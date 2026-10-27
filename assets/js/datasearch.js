// Tìm kiếm trong dữ liệu của tool:
//  - file Excel đã nạp vào các tool Tổng hợp (đọc từ IndexedDB, mỗi dòng Excel = 1 bản ghi, tìm trên mọi cột);
//  - nội dung các tool BOM (model, SKU, mô tả…) sau khi đã mở khóa.
// Toàn bộ xử lý trên trình duyệt, không gửi dữ liệu đi đâu.
import { norm } from './search.js';

const nk = (s) => norm(s).replace(/[^a-z0-9]+/g, ' ').trim();
const KEYS = {
  id: ['id', 'ma phieu', 'so phieu', 'so po', 'ma po', 'ma don hang', 'ma nv', 'ma nhan vien', 'ma'],
  title: ['ten thuong vu', 'ten co hoi', 'ten phieu', 'ten du an', 'du an', 'ho va ten', 'ho ten', 'ten nhan vien', 'ten khach hang', 'khach hang', 'ten', 'noi dung', 'mo ta'],
  meta: ['khach hang', 'ten khach hang', 'end user', 'sale', 'nhan vien', 'hang', 'vendor', 'reseller', 'giai doan', 'trang thai',
    'tinh trang', 'gia tri', 'tong tien', 'thanh tien', 'phong ban', 'bo phan', 'pm', 'ngay tao'],
};
const MAX_ROWS_PER_SHEET = 20000;

let xlsxP;
function loadXLSX() {
  return (xlsxP ||= new Promise((res, rej) => {
    if (window.XLSX) return res(window.XLSX);
    const s = document.createElement('script');
    s.src = 'assets/vendor/xlsx.min.js';
    s.onload = () => res(window.XLSX);
    s.onerror = () => { xlsxP = null; rej(new Error('Không tải được thư viện đọc Excel')); };
    document.head.append(s);
  }));
}

/** Cột khớp danh sách tên ưu tiên (theo thứ tự ưu tiên của danh sách). */
function pickCols(headers, keys, max) {
  const out = [];
  for (const k of keys) {
    headers.forEach((h, i) => {
      if (out.length < max && !out.includes(i) && (h === k || h.startsWith(k + ' '))) out.push(i);
    });
  }
  return out;
}

function sheetRecords(rows, src, file, sheet) {
  // Dòng tiêu đề: dòng có nhiều ô chữ nhất trong 20 dòng đầu.
  let hi = -1, best = 1;
  rows.slice(0, 20).forEach((r, i) => {
    const n = r.filter((c) => typeof c === 'string' && c.trim() && !/^[\d.,\s%-]+$/.test(c)).length;
    if (n > best) { best = n; hi = i; }
  });
  if (hi < 0) return [];
  const raw = rows[hi].map((h) => String(h ?? '').trim());
  const headers = raw.map(nk);
  const idCol = pickCols(headers, KEYS.id, 1)[0];
  const titleCol = pickCols(headers, KEYS.title, 1).find((i) => i !== idCol);
  const metaCols = pickCols(headers, KEYS.meta, 5).filter((i) => i !== idCol && i !== titleCol);
  const recs = [];
  for (const r of rows.slice(hi + 1, hi + 1 + MAX_ROWS_PER_SHEET)) {
    const cells = [];
    r.forEach((v, i) => {
      const val = String(v ?? '').trim();
      if (val) cells.push([raw[i] || `Cột ${i + 1}`, val, i]);
    });
    if (cells.length < 2) continue;
    const get = (i) => (i == null ? '' : String(r[i] ?? '').trim());
    const id = get(idCol);
    const title = get(titleCol) || cells.find(([, v, i]) => i !== idCol && !/^[\d.,\s%/-]+$/.test(v))?.[1] || cells[0][1];
    recs.push({
      src, file, sheet, id, title, cells,
      meta: metaCols.map((i) => get(i)).filter((v) => v && v !== title),
      key: nk(`${id} ${title}`),
      text: nk(cells.map((c) => c[1]).join(' ')),
    });
  }
  return recs;
}

/** Chuỗi văn bản hữu ích trong một tool BOM (chữ hiển thị + chuỗi trong script: model, SKU, mô tả…). */
function bomStrings(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const scripts = [...doc.querySelectorAll('script')].map((s) => s.textContent);
  doc.querySelectorAll('script,style,svg,noscript,template').forEach((el) => el.remove());
  const visible = (doc.body?.innerText || doc.body?.textContent || '').split(/\n+/);
  const literals = scripts.flatMap((src) => [...src.matchAll(/(["'`])((?:\\.|(?!\1)[^\\\n]){3,240}?)\1/g)].map((m) => m[2]));
  const seen = new Set();
  const out = [];
  for (let s of [...visible, ...literals]) {
    s = s.replace(/\\n|\\t/g, ' ').replace(/\s+/g, ' ').trim();
    if (s.length < 3 || s.length > 240 || !/[\p{L}\p{N}]{2}/u.test(s)) continue;
    if (/[{};=]|=>|function|\$\{|^#[0-9a-f]{3,8}$|^\d+(\.\d+)?(px|%|em|rem|s|ms)?$|^[a-z-]+:[a-z-]/i.test(s)) continue;
    if (/^[\w-]+(\s[\w-]+)*$/.test(s) && /^(div|span|btn|row|col|active|hidden|flex|grid)/.test(s)) continue;
    const k = nk(s);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

export class DataIndex {
  constructor() {
    this.sources = new Map(); // id -> { item, sig, records }
    this.pending = null;
  }

  get building() { return !!this.pending; }

  drop(id) { this.sources.delete(id); }

  dropBom() { for (const [id, s] of this.sources) if (s.item.kind === 'bom') this.sources.delete(id); }

  /**
   * Đồng bộ chỉ mục với dữ liệu hiện có.
   * tools: [{ item, rec }] với rec = bản ghi IndexedDB ({ files, savedAt }) hoặc null.
   * boms: [{ item, load: () => Promise<html> }] (chỉ truyền khi BOM đã mở khóa).
   */
  sync(tools, boms) {
    if (this.pending) return this.pending;
    this.pending = (async () => {
      for (const { item, rec } of tools) {
        if (!rec?.files?.length) { this.sources.delete(item.id); continue; }
        const sig = `${rec.savedAt}:${rec.files.map((f) => f.name + f.size).join('|')}`;
        if (this.sources.get(item.id)?.sig === sig) continue;
        try {
          const XLSX = await loadXLSX();
          const records = [];
          for (const file of rec.files) {
            const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
            for (const name of wb.SheetNames) {
              const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '', blankrows: false });
              records.push(...sheetRecords(rows, item.id, file.name, name));
            }
          }
          this.sources.set(item.id, { item, sig, records });
        } catch (e) {
          console.warn('Không đọc được dữ liệu', item.id, e);
        }
      }
      for (const { item, load } of boms) {
        if (this.sources.has(item.id)) continue;
        try {
          const records = bomStrings(await load()).map((s) => ({ src: item.id, title: s, id: '', meta: [], cells: [], key: nk(s), text: nk(s) }));
          this.sources.set(item.id, { item, sig: 'bom', records });
        } catch (e) {
          console.warn('Không đọc được BOM', item.id, e);
        }
      }
    })().finally(() => { this.pending = null; });
    return this.pending;
  }

  get size() {
    let n = 0;
    for (const s of this.sources.values()) n += s.records.length;
    return n;
  }

  /** Kết quả theo từng nguồn: [{ item, total, hits: [record] }], nguồn khớp tốt nhất trước. */
  search(q, perSource = 5) {
    const tokens = nk(q).split(' ').filter((t) => t.length > 1 || /\d/.test(t));
    if (!tokens.length) return [];
    const nq = tokens.join(' ');
    const out = [];
    for (const { item, records } of this.sources.values()) {
      const hits = [];
      for (const r of records) {
        if (!tokens.every((t) => r.text.includes(t))) continue;
        let score = 1;
        if (r.key.includes(nq)) score += 20;
        if (r.id && nk(r.id) === nq) score += 30;
        for (const t of tokens) if (r.key.includes(t)) score += 4;
        if (r.text.includes(nq)) score += 3;
        hits.push({ r, score });
      }
      if (!hits.length) continue;
      hits.sort((a, b) => b.score - a.score);
      out.push({ item, total: hits.length, best: hits[0].score, hits: hits.slice(0, perSource).map((h) => h.r) });
    }
    return out.sort((a, b) => b.best - a.best || b.total - a.total);
  }

  /** Ô dữ liệu chứa từ khóa (để hiển thị khi từ khóa không nằm ở tiêu đề / thông tin chính). */
  static matchedCell(r, q) {
    const tokens = nk(q).split(' ').filter(Boolean);
    const shown = nk([r.id, r.title, ...r.meta].join(' '));
    if (tokens.every((t) => shown.includes(t))) return null;
    return r.cells.find(([, v]) => tokens.some((t) => !shown.includes(t) && nk(v).includes(t))) || null;
  }
}

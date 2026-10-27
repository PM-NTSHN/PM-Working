// Công cụ tìm kiếm toàn văn phía trình duyệt: không dấu, gõ dở (prefix), gõ sai nhẹ (fuzzy), từ đồng nghĩa.

export const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
const WORD = /[\p{L}\p{N}]+/gu;
const tokens = (s) => (norm(s).match(WORD) || []).filter((t) => t.length > 1 || /\d/.test(t));
const STOP = new Set('va cua la cac cho voi trong nhung mot duoc khi de tu co the nay do ve theo tai den hay thi ma se da dang cung nhu rat neu vi bang tren duoi sau truoc the and the of to in for on with is are by an or at as be from'.split(' '));

const FIELDS = { title: 12, meta: 7, head: 3, body: 1 };

function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Chuẩn hóa chuỗi kèm bảng ánh xạ vị trí về chuỗi gốc (để tô sáng / trích đoạn trên văn bản có dấu). */
export function normMap(raw) {
  let out = '';
  const map = [];
  for (let i = 0; i < raw.length; i++) {
    const n = norm(raw[i]);
    for (let k = 0; k < n.length; k++) { out += n[k]; map.push(i); }
  }
  map.push(raw.length);
  return { out, map };
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Tô sáng các từ khóa (so khớp không dấu, theo đầu từ) và escape HTML. */
export function highlight(raw, terms) {
  raw = raw || '';
  if (!terms?.length) return esc(raw);
  const { out, map } = normMap(raw);
  const ranges = [];
  for (const t of terms) {
    if (!t) continue;
    let i = 0;
    while ((i = out.indexOf(t, i)) !== -1) {
      if (i === 0 || !/[\p{L}\p{N}]/u.test(out[i - 1])) ranges.push([map[i], map[i + t.length - 1] + 1]);
      i += t.length;
    }
  }
  if (!ranges.length) return esc(raw);
  ranges.sort((a, b) => a[0] - b[0]);
  let html = '', pos = 0;
  for (const [s, e] of ranges) {
    if (s < pos) continue;
    html += esc(raw.slice(pos, s)) + '<mark>' + esc(raw.slice(s, e)) + '</mark>';
    pos = e;
  }
  return html + esc(raw.slice(pos));
}

export class SearchEngine {
  constructor(catalog, index) {
    const sections = Object.fromEntries(catalog.sections.map((s) => [s.id, s]));
    const byId = Object.fromEntries((index || []).map((e) => [e.id, e]));
    this.docs = catalog.items.map((it) => {
      const ix = byId[it.id] || { h: '', b: it.desc || '' };
      return {
        item: it,
        title: it.title,
        meta: [it.vendor, it.solution, it.type, sections[it.section]?.title, ...(it.tags || [])].filter(Boolean).join(' · '),
        head: ix.h,
        body: ix.b,
      };
    });
    this.post = new Map();   // token -> Map(docIdx -> trọng số)
    const display = new Map(); // token không dấu -> dạng có dấu hay gặp nhất
    const phrases = new Map(); // cụm gợi ý (có dấu) -> tần suất

    this.docs.forEach((d, i) => {
      for (const [field, w] of Object.entries(FIELDS)) {
        const tf = new Map();
        for (const raw of (d[field] || '').match(WORD) || []) {
          const t = norm(raw);
          if (t.length < 2 && !/\d/.test(t)) continue;
          tf.set(t, (tf.get(t) || 0) + 1);
          if (field !== 'body') {
            const forms = display.get(t) || new Map();
            const lower = raw.toLowerCase();
            forms.set(lower, (forms.get(lower) || 0) + 1);
            display.set(t, forms);
          }
        }
        for (const [t, n] of tf) {
          const m = this.post.get(t) || new Map();
          m.set(i, (m.get(i) || 0) + w * (1 + Math.log(n)));
          this.post.set(t, m);
        }
      }
      for (const p of [d.item.title, d.item.vendor, d.item.solution, ...(d.item.tags || []), ...(d.head || '').split(' · ')]) {
        if (p && p.length >= 3 && p.length <= 48 && p.split(/\s+/).length <= 6) phrases.set(p, (phrases.get(p) || 0) + 1);
      }
    });
    for (const g of catalog.synonyms || []) for (const p of g) phrases.set(p, (phrases.get(p) || 0) + 2);

    this.N = this.docs.length;
    this.vocab = [...this.post.keys()].sort();
    this.display = new Map([...display].map(([t, forms]) => [t, [...forms].sort((a, b) => b[1] - a[1])[0][0]]));
    this.phrases = [...phrases].map(([p, n]) => ({ p, n: norm(p), f: n }));
    this.synonyms = (catalog.synonyms || []).map((g) => g.map((p) => ({ p, n: norm(p) })));
    this.vendors = catalog.vendors || [];
  }

  idf(t) {
    const df = this.post.get(t)?.size || 0;
    return df ? Math.log(1 + this.N / df) : 0;
  }

  /** Các từ trong vocab khớp với token gõ vào: chính xác, gõ dở, gõ sai nhẹ. */
  expand(t, isLast) {
    const out = [];
    if (this.post.has(t)) out.push([t, 1]);
    if (t.length >= 2 && (isLast || t.length >= 3)) {
      let lo = 0, hi = this.vocab.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; this.vocab[mid] < t ? (lo = mid + 1) : (hi = mid); }
      for (let i = lo, n = 0; i < this.vocab.length && this.vocab[i].startsWith(t) && n < 40; i++, n++) {
        if (this.vocab[i] !== t) out.push([this.vocab[i], 0.75]);
      }
    }
    if (!out.length && t.length >= 4) {
      const max = t.length >= 8 ? 2 : 1;
      for (const v of this.vocab) {
        if (Math.abs(v.length - t.length) <= max && v[0] === t[0] && editDistance(t, v, max) <= max) out.push([v, 0.55]);
      }
    }
    return out;
  }

  /** Nhóm đồng nghĩa có cụm từ xuất hiện trong câu truy vấn. */
  synonymGroups(q) {
    const qt = tokens(q).join(' ');
    const nq = ` ${qt} `;
    return this.synonyms.filter((g) => g.some(({ n }) => {
      const p = tokens(n).join(' ');
      return nq.includes(` ${p} `) || (qt.length >= 6 && qt.includes(' ') && p.startsWith(qt));
    }));
  }

  scoreTokens(qt, weight, scores, matched, slot) {
    qt.forEach((t, k) => {
      const cand = this.expand(t, k === qt.length - 1);
      const best = new Map();
      for (const [term, w] of cand) {
        const idf = this.idf(term);
        for (const [doc, s] of this.post.get(term)) {
          const v = s * idf * w * weight;
          if (v > (best.get(doc) || 0)) best.set(doc, v);
        }
      }
      for (const [doc, v] of best) {
        scores.set(doc, (scores.get(doc) || 0) + v);
        if (slot !== undefined) matched.set(doc, (matched.get(doc) || new Set()).add(slot + k));
      }
    });
  }

  search(q, limit = 30) {
    const all = tokens(q);
    const qt = all.filter((t) => !STOP.has(t) || all.length === 1);
    if (!qt.length) return { results: [], terms: [] };

    const scores = new Map(), matched = new Map();
    this.scoreTokens(qt, 1, scores, matched, 0);

    // Từ đồng nghĩa: cộng điểm phụ, đồng thời coi như đã khớp các token thuộc cụm đó.
    const groups = this.synonymGroups(q);
    const synTerms = new Set();
    for (const g of groups) for (const { n } of g) for (const t of tokens(n)) if (!qt.includes(t)) synTerms.add(t);
    const synScores = new Map();
    this.scoreTokens([...synTerms], 0.6, synScores, new Map());
    for (const [doc, v] of synScores) {
      scores.set(doc, (scores.get(doc) || 0) + v);
      if (!matched.has(doc)) matched.set(doc, new Set());
      const set = matched.get(doc);
      if (set.size < qt.length) qt.forEach((_, k) => set.add(k));
    }

    const nq = norm(q).trim();
    const results = [];
    for (const [doc, s] of scores) {
      const d = this.docs[doc];
      const coverage = (matched.get(doc)?.size || 0) / qt.length;
      let score = s * coverage * coverage;
      if (norm(d.title).includes(nq)) score += 40;
      else if (norm(d.meta).includes(nq)) score += 15;
      if (d.item.status === 'soon') score *= 0.6;
      if (score > 0.5) results.push({ doc: d, score, item: d.item });
    }
    results.sort((a, b) => b.score - a.score);
    const floor = (results[0]?.score || 0) * 0.08;
    const kept = results.filter((r) => r.score >= floor);
    const terms = [...new Set([...qt, ...qt.flatMap((t) => this.expand(t, true).slice(0, 4).map(([v]) => v))])];
    return { results: kept.slice(0, limit), terms };
  }

  /** Trích đoạn văn bản quanh từ khóa đầu tiên tìm thấy. */
  snippet(d, terms, len = 170) {
    for (const field of ['body', 'head']) {
      const raw = d[field];
      if (!raw) continue;
      const { out, map } = normMap(raw);
      for (const t of terms) {
        const re = new RegExp(`(^|[^\\p{L}\\p{N}])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u');
        const m = re.exec(out);
        if (!m) continue;
        const at = map[m.index + m[1].length];
        const start = Math.max(0, at - 60);
        let s = raw.slice(start, start + len).replace(/\s\.\s/g, ' · ');
        return (start > 0 ? '…' : '') + s.trim() + '…';
      }
    }
    return d.item.desc || '';
  }

  /** Gợi ý cụm từ để hoàn thành câu truy vấn. */
  suggest(q, limit = 6) {
    const nq = tokens(q).join(' ');
    if (!nq) return [];
    const seen = new Set();
    const out = this.phrases
      .filter((x) => x.n !== nq && (x.n.startsWith(nq) || x.n.includes(' ' + nq)))
      .sort((a, b) => (b.n.startsWith(nq) - a.n.startsWith(nq)) || b.f - a.f || a.p.length - b.p.length)
      .filter((x) => !seen.has(x.n) && seen.add(x.n))
      .slice(0, limit)
      .map((x) => x.p);
    if (out.length < limit) {
      const last = tokens(q).pop();
      for (const [term] of this.expand(last, true)) {
        const disp = this.display.get(term);
        if (disp && term !== last && !seen.has(term) && out.length < limit) {
          seen.add(term);
          out.push(q.replace(/\S+$/, disp));
        }
      }
    }
    return out;
  }

  /** Từ khóa liên quan: đồng nghĩa + tag phổ biến trong kết quả đầu. */
  relatedTerms(q, results, limit = 8) {
    const nq = norm(q);
    const out = new Map();
    for (const g of this.synonymGroups(q)) for (const { p, n } of g) if (!nq.includes(n)) out.set(n, p);
    const tagCount = new Map();
    for (const r of results.slice(0, 10)) {
      for (const t of [...(r.item.tags || []), r.item.vendor].filter(Boolean)) {
        const n = norm(t);
        if (!nq.includes(n) && !/^(quiz|sale|research|bom)$/.test(n)) tagCount.set(t, (tagCount.get(t) || 0) + 1);
      }
    }
    for (const [t] of [...tagCount].sort((a, b) => b[1] - a[1])) if (!out.has(norm(t))) out.set(norm(t), t);
    return [...out.values()].slice(0, limit);
  }

  matchVendors(q) {
    const nq = norm(q).trim();
    if (nq.length < 2) return [];
    return this.vendors.filter((v) => norm(v.name).includes(nq) || v.solutions.some((s) => norm(s).includes(nq)));
  }
}

/** Nội dung liên quan tới một mục (cùng sản phẩm / hãng / giải pháp / lĩnh vực / tag). */
export function related(catalog, item, limit = 8) {
  const tags = new Set((item.tags || []).map(norm));
  return catalog.items
    .filter((x) => x.id !== item.id && x.status !== 'soon')
    .map((x) => {
      let s = 0;
      if (item.product && x.product === item.product) s += 7;
      if (item.vendor && x.vendor === item.vendor) s += 4;
      if (item.solution && x.solution === item.solution) s += 5;
      if (item.cat && x.cat === item.cat) s += 3;
      for (const t of x.tags || []) if (tags.has(norm(t)) && !/^(quiz|bom)$/i.test(t)) s += 2;
      if (x.section === item.section) s += 0.5;
      return { x, s };
    })
    .filter((r) => r.s >= 3)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((r) => r.x);
}

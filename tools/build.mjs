#!/usr/bin/env node
// Build PM Hub: đồng bộ Sale guide từ PM-Knowledge-Hub, sinh data/catalog.json + data/search-index.json.
//
//   node tools/build.mjs                 # tự clone các repo nguồn vào .cache/
//   node tools/build.mjs --src <thư mục>  # dùng sẵn các repo đã clone trong <thư mục>
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORG = 'https://github.com/PM-NTSHN';
const BODY_LIMIT = 24000;
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/hub.json'), 'utf8'));

const srcArg = process.argv.indexOf('--src');
const SRC = srcArg > 0 ? path.resolve(process.argv[srcArg + 1]) : path.join(ROOT, '.cache');

function repoDir(name) {
  const dir = path.join(SRC, name);
  if (!fs.existsSync(dir)) {
    if (srcArg > 0) return null;
    fs.mkdirSync(SRC, { recursive: true });
    execFileSync('git', ['clone', '--quiet', '--depth', '1', `${ORG}/${name}.git`, dir], { stdio: 'inherit' });
  }
  return dir;
}

const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------- Trích xuất chữ từ HTML cho chỉ mục tìm kiếm ----------
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rarr: '→', larr: '←', hellip: '…', laquo: '«', raquo: '»', middot: '·', bull: '•', copy: '©', reg: '®', trade: '™' };
const decode = (s) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
  if (e[0] === '#') {
    const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : m;
  }
  return ENTITIES[e.toLowerCase()] ?? m;
});
const clean = (s) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

function extract(html) {
  const body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|svg|noscript|template|head)\b[\s\S]*?<\/\1>/gi, ' ');
  const headings = [...body.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
    .map((m) => clean(m[1])).filter((h) => h && h.length < 160);
  let b = clean(body.replace(/<\/(p|div|li|h\d|td|th|tr|section|article)>/gi, ' . ')).replace(/( \.)+/g, ' .');
  // Trang dựng nội dung bằng JS (quiz, khóa học): lấy thêm các chuỗi văn bản trong <script>.
  if (b.length < 3000) {
    const strings = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
      .flatMap((m) => [...m[1].matchAll(/(["'`])((?:\\.|(?!\1)[^\\\n]){24,}?)\1/g)].map((s) => s[2]))
      .filter((s) => /\s/.test(s) && /\p{L}{3}/u.test(s) && !/[{};=]|function|\$\{|=>/.test(s));
    b += ' ' + clean(strings.join(' . ').replace(/\\n/g, ' '));
  }
  return { h: [...new Set(headings)].slice(0, 80).join(' · '), b: b.slice(0, BODY_LIMIT) };
}

// ---------- Sale guide từ PM-Knowledge-Hub ----------
function readKnowledgeHub(dir) {
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  // Lấy literal `const NAME = [...]` / `{...}` bằng cách đếm ngoặc (bỏ qua chuỗi).
  const grab = (name) => {
    const m = new RegExp(`const ${name}\\s*=\\s*`).exec(html);
    if (!m) throw new Error(`Không tìm thấy ${name} trong PM-Knowledge-Hub/index.html`);
    const start = m.index + m[0].length;
    let depth = 0, quote = null;
    for (let i = start; i < html.length; i++) {
      const c = html[i];
      if (quote) {
        if (c === '\\') i++;
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'" || c === '`') quote = c;
      else if (c === '[' || c === '{') depth++;
      else if ((c === ']' || c === '}') && --depth === 0) {
        return vm.runInNewContext(`(${html.slice(start, i + 1)})`);
      }
    }
    throw new Error(`Không đọc được ${name}`);
  };
  return { docs: grab('DOCS'), cats: grab('SOLUTION_CATS'), types: grab('TYPE_ORDER') };
}

function copyDir(from, to) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
}

const sg = config.saleGuide;
const kbDir = repoDir(sg.source);
if (!kbDir) throw new Error(`Thiếu repo ${sg.source} trong ${SRC}`);
const kb = readKnowledgeHub(kbDir);
copyDir(path.join(kbDir, 'docs'), path.join(ROOT, 'content/sale-guide'));

const saleDocs = [...kb.docs, ...(sg.extraDocs || [])].map((d) => {
  const rel = d.file.replace(/^docs\//, '');
  const vendor = sg.vendorRename[d.vendor] || d.vendor;
  return {
    id: 'sg-' + slug(rel.replace(/\.html?$/, '')),
    section: 'sale-guide',
    kind: 'html',
    title: d.title,
    src: d.file.startsWith('content/') ? d.file : `content/sale-guide/${rel}`,
    vendor,
    product: sg.productBySolution[`${d.solution}@${d.vendor}`] || sg.productBySolution[d.solution] || null,
    solution: d.solution,
    cat: d.cat,
    type: d.type,
    tags: d.tags || [],
  };
});

const vendorNames = [...new Set(saleDocs.map((d) => d.vendor))]
  .sort((a, b) => {
    const ia = sg.vendorOrder.indexOf(a), ib = sg.vendorOrder.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
const vendors = vendorNames.map((name) => {
  const docs = saleDocs.filter((d) => d.vendor === name);
  return {
    id: slug(name),
    name,
    solutions: [...new Set(docs.map((d) => d.solution))],
    cats: [...new Set(docs.map((d) => d.cat))],
    count: docs.length,
  };
});

// ---------- Ghép catalog ----------
const appItems = config.sections.filter((s) => s.kind === 'app').map((s) => ({
  id: s.id, section: s.id, kind: 'external', title: s.title, src: s.src, repo: s.repo,
  desc: s.desc, tags: s.tags || [], icon: s.icon, app: true,
}));
const items = [...config.items, ...appItems, ...saleDocs];
const ids = new Set();
for (const it of items) {
  if (ids.has(it.id)) throw new Error(`Trùng id: ${it.id}`);
  ids.add(it.id);
}

const catalog = {
  generatedAt: new Date().toISOString(),
  sections: config.sections.map(({ src, repo, ...s }) => s),
  items,
  vendors,
  cats: Object.fromEntries(Object.entries(kb.cats).map(([k, c]) => [k, { label: c.label, color: c.color, icon: c.icon }])),
  types: kb.types,
  synonyms: config.synonyms,
};

// ---------- Chỉ mục tìm kiếm ----------
const index = [];
for (const it of items) {
  let text = { h: '', b: '' };
  if (it.kind === 'html') {
    text = extract(fs.readFileSync(path.join(ROOT, it.src), 'utf8'));
  } else if (it.kind === 'external' && it.repo) {
    const dir = repoDir(it.repo);
    const file = dir && path.join(dir, 'index.html');
    if (file && fs.existsSync(file)) text = extract(fs.readFileSync(file, 'utf8'));
  }
  // BOM: chỉ đánh chỉ mục tiêu đề/mô tả — nội dung đã mã hóa.
  index.push({ id: it.id, h: text.h, b: [it.desc || '', text.b].join(' ').trim() });
}

fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data/catalog.json'), JSON.stringify(catalog, null, 1));
fs.writeFileSync(path.join(ROOT, 'data/search-index.json'), JSON.stringify(index));

const size = (f) => (fs.statSync(path.join(ROOT, f)).size / 1024).toFixed(0) + ' KB';
console.log(`Sale guide: ${saleDocs.length} tài liệu / ${vendors.length} hãng`);
console.log(`Catalog: ${items.length} mục (${size('data/catalog.json')}), search index ${size('data/search-index.json')}`);
for (const e of index) if (e.b.length < 400) console.log(`  ! nội dung ngắn: ${e.id} (${e.b.length} ký tự)`);

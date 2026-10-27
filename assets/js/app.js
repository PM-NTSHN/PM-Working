import { icon, rawIcon } from './icons.js';
import { verify, exportKey, importKey, decryptFile } from './crypto.js';
import { SearchEngine, related, highlight, norm, normMap } from './search.js';
import { DataIndex } from './datasearch.js';

// ---------------------------------------------------------------- tiện ích
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, def, area = localStorage) { try { const v = area.getItem(k); return v == null ? def : JSON.parse(v); } catch { return def; } },
  set(k, v, area = localStorage) { try { area.setItem(k, JSON.stringify(v)); } catch { /* chế độ riêng tư */ } },
  del(k) { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch { /* bỏ qua */ } },
};
const K = { auth: 'pmhub.auth', bom: 'pmhub.bomkey', fav: 'pmhub.fav', recent: 'pmhub.recent', nav: 'pmhub.navOpen', sb: 'pmhub.sbCollapsed', theme: 'pmhub.theme' };
const fillIcons = (root = document) => root.querySelectorAll('[data-ic]').forEach((el) => {
  el.insertAdjacentHTML('afterbegin', icon(el.dataset.ic));
  el.removeAttribute('data-ic');
});
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

const SECTION_COLOR = { bom: '#f37021', dealreg: '#0ea5e9', po: '#10b981', crm: '#6366f1', kpi: '#e11d48', 'sale-guide': '#0b5cad', 'update-solution': '#8b5cf6', learning: '#d946ef' };
const TYPE = {
  'Cẩm nang bán hàng': { c: '#16a34a', ic: 'book' },
  'Nghiên cứu': { c: '#2563eb', ic: 'flask' },
  'Bài kiểm tra': { c: '#d97706', ic: 'quiz' },
  'Presales': { c: '#7c3aed', ic: 'presentation' },
  'Khóa học': { c: '#db2777', ic: 'graduation' },
  'Infographic': { c: '#0891b2', ic: 'layers' },
};
const MAX_FRAMES = 6;

// ---------------------------------------------------------------- dữ liệu
let AUTH, CAT, SEC, ITEM, VENDOR, engine, indexLoading;
const frames = new Map(); // id -> { el, loaded, blob }
let current = null;       // mục đang mở trong khung iframe

const secHref = (s) => (s.kind === 'app' ? `#/v/${s.id}` : `#/s/${s.id}`);
const itemHref = (it, q) => `#/v/${it.id}${q ? `?q=${encodeURIComponent(q)}` : ''}`;
const vendorHref = (v) => `#/s/sale-guide/${v.id}`;
const colorOf = (it) => (it.cat && CAT.cats[it.cat]?.color) || TYPE[it.type]?.c || SECTION_COLOR[it.section] || '#0b5cad';
function iconOf(it, cls) {
  if (it.cat && CAT.cats[it.cat]) return rawIcon(CAT.cats[it.cat].icon, cls);
  if (it.icon) return icon(it.icon, cls);
  if (TYPE[it.type]) return icon(TYPE[it.type].ic, cls);
  return icon(SEC[it.section]?.icon || 'file', cls);
}
const typeBadge = (t) => (t ? `<span class="badge" style="--c:${TYPE[t]?.c || '#64748b'}">${icon(TYPE[t]?.ic || 'file')}${esc(t)}</span>` : '');
const itemMeta = (it) => [SEC[it.section]?.short, it.vendor, it.solution].filter(Boolean).map(esc).join(' · ');
const initials = (name) => name.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || name.slice(0, 2);
const vendorColor = (v) => CAT.cats[v.cats[0]]?.color || '#0b5cad';
const isBomUnlocked = () => !!store.get(K.bom, null, sessionStorage);

// ---------------------------------------------------------------- khởi động
async function boot() {
  fillIcons();
  try {
    [AUTH, CAT] = await Promise.all(['data/auth.json', 'data/catalog.json'].map((u) => fetch(u, { cache: 'no-cache' }).then((r) => {
      if (!r.ok) throw new Error(`${u}: ${r.status}`);
      return r.json();
    })));
  } catch (e) {
    document.body.innerHTML = `<div class="empty" style="margin:40px">Không tải được dữ liệu PM Hub (${esc(e.message)}). Hãy mở qua web server / GitHub Pages.</div>`;
    return;
  }
  SEC = Object.fromEntries(CAT.sections.map((s) => [s.id, s]));
  ITEM = Object.fromEntries(CAT.items.map((i) => [i.id, i]));
  VENDOR = Object.fromEntries(CAT.vendors.map((v) => [v.id, v]));
  engine = new SearchEngine(CAT, []);
  bindLogin();
  session() ? startApp() : showLogin();
}

function session() {
  const s = store.get(K.auth, null) || store.get(K.auth, null, sessionStorage);
  return s && s.exp > Date.now() && s.salt === AUTH.salt ? s : null;
}

// ---------------------------------------------------------------- đăng nhập
function showLogin() {
  $('#app').hidden = true;
  $('#login').hidden = false;
  setTimeout(() => $('#lgUser').focus(), 50);
}

function bindPasswordEye(root) {
  root.querySelectorAll('.eye').forEach((b) => b.addEventListener('click', () => {
    const inp = b.parentElement.querySelector('input');
    inp.type = inp.type === 'password' ? 'text' : 'password';
    b.innerHTML = icon(inp.type === 'password' ? 'eye' : 'eyeOff');
  }));
}

async function submitCredentials(form, userEl, passEl, errEl, onKey) {
  const btn = form.querySelector('button[type=submit]');
  const label = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span><span>Đang kiểm tra…</span>';
  errEl.textContent = '';
  try {
    const key = await verify(userEl.value, passEl.value, AUTH);
    if (!key) {
      errEl.textContent = 'Tên đăng nhập hoặc mật khẩu không đúng.';
      form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
      passEl.select();
      return;
    }
    await onKey(key, userEl.value.trim());
  } catch (e) {
    errEl.textContent = 'Lỗi: ' + e.message;
  } finally {
    btn.disabled = false;
    btn.innerHTML = label;
  }
}

function bindLogin() {
  const form = $('#loginForm');
  bindPasswordEye(form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitCredentials(form, $('#lgUser'), $('#lgPass'), $('#loginErr'), async (_key, user) => {
      const remember = $('#lgRemember').checked;
      const s = { user, salt: AUTH.salt, exp: Date.now() + (remember ? 7 * 864e5 : 12 * 36e5) };
      store.set(K.auth, s, remember ? localStorage : sessionStorage);
      $('#lgPass').value = '';
      $('#login').hidden = true;
      startApp();
    });
  });
}

function logout() {
  store.del(K.auth);
  store.del(K.bom);
  dataIx.dropBom();
  for (const id of [...frames.keys()]) dropFrame(id);
  location.hash = '#/';
  showLogin();
}

// ---------------------------------------------------------------- khung ứng dụng
let started = false;
function startApp() {
  $('#app').hidden = false;
  $('#userName').textContent = session()?.user || 'Admin';
  if (store.get(K.sb, false)) $('#app').classList.add('sb-collapsed');
  syncThemeIcon();
  if (!started) {
    started = true;
    bindShell();
    window.addEventListener('hashchange', route);
    loadIndex();
  }
  route();
}

function bindShell() {
  $('#btnCollapse').onclick = () => {
    const on = $('#app').classList.toggle('sb-collapsed');
    store.set(K.sb, on);
  };
  $('#btnMenu').onclick = () => toggleMobileNav(true);
  $('#btnTheme').onclick = () => {
    const dark = effectiveTheme() === 'dark';
    document.documentElement.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem(K.theme, dark ? 'light' : 'dark'); } catch { /* bỏ qua */ }
    syncThemeIcon();
  };
  $('#btnLogout').onclick = logout;
  $('#actFav').onclick = () => current && toggleFav(current.id);
  $('#actRelated').onclick = () => toggleDrawer();
  $('#drawerClose').onclick = () => toggleDrawer(false);
  $('#actReload').onclick = () => {
    if (!current) return;
    const id = current.id;
    dropFrame(id);
    openItem(ITEM[id]);
  };
  $('#actFocus').onclick = toggleFocus;
  $('#actSaved').onclick = clearSaved;
  $('.sb-search').addEventListener('click', () => $('#app').classList.contains('sb-collapsed') && focusSearch());
  document.addEventListener('fullscreenchange', () => {
    $('#actFocus').innerHTML = icon(document.fullscreenElement ? 'minimize' : 'maximize');
  });

  document.addEventListener('keydown', (e) => {
    const typing = /input|textarea|select/i.test(e.target.tagName) || e.target.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); focusSearch(); }
    else if (e.key === '/' && !typing) { e.preventDefault(); focusSearch(); }
    else if (e.key === 'Escape') {
      if (!$('#palette').hidden) closePalette();
      else if ($('#drawer').classList.contains('open')) toggleDrawer(false);
      else if ($('#app').classList.contains('focus')) toggleFocus();
      else toggleMobileNav(false);
    }
  });

  $('#nav').addEventListener('click', (e) => {
    const caret = e.target.closest('.caret');
    if (caret) {
      e.preventDefault();
      const node = caret.closest('.nav-node');
      node.classList.toggle('open');
      const open = new Set(store.get(K.nav, []));
      node.classList.contains('open') ? open.add(node.dataset.id) : open.delete(node.dataset.id);
      store.set(K.nav, [...open]);
    } else if (e.target.closest('a')) toggleMobileNav(false);
  });
  bindPalette();
}

const effectiveTheme = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
function syncThemeIcon() { $('#btnTheme').innerHTML = icon(effectiveTheme() === 'dark' ? 'sun' : 'moon'); }

function toggleMobileNav(open) {
  const app = $('#app');
  app.classList.toggle('sb-open', open);
  $('.scrim')?.remove();
  if (open) {
    const s = document.createElement('div');
    s.className = 'scrim';
    s.onclick = () => toggleMobileNav(false);
    document.body.append(s);
  }
}

function toggleFocus() {
  const fv = $('#frameView');
  if (fv.requestFullscreen && !$('#app').classList.contains('focus')) {
    document.fullscreenElement ? document.exitFullscreen() : fv.requestFullscreen().catch(() => {});
    return;
  }
  // Dự phòng (iPhone): ẩn sidebar + topbar, hiện nút thoát nổi.
  const on = $('#app').classList.toggle('focus');
  $('#focusExit')?.remove();
  if (on) {
    const b = document.createElement('button');
    b.id = 'focusExit';
    b.className = 'btn';
    b.style.cssText = 'position:fixed;top:10px;right:10px;z-index:45;box-shadow:var(--shadow)';
    b.innerHTML = icon('minimize') + 'Thoát';
    b.onclick = toggleFocus;
    document.body.append(b);
  }
}

// ---------------------------------------------------------------- sidebar
function navLeaf(key, href, ic, label, extra = '') {
  return `<a class="nav-item" data-key="${key}" href="${href}">${ic}<span class="label">${esc(label)}</span>${extra}</a>`;
}

function renderNav() {
  const open = new Set(store.get(K.nav, []));
  const favs = store.get(K.fav, []).map((id) => ITEM[id]).filter(Boolean);
  let html = navLeaf('home', '#/', icon('home'), 'Trang chủ');
  if (favs.length) {
    html += `<div class="nav-group">Đã ghim</div>`;
    html += favs.map((it) => navLeaf(`item:${it.id}`, itemHref(it), icon('star'), it.title)).join('');
  }
  let group = null;
  for (const s of CAT.sections) {
    const g = s.group || 'Công cụ';
    if (g !== group) { html += `<div class="nav-group">${esc(g)}</div>`; group = g; }
    if (s.kind === 'app') { html += navLeaf(`item:${s.id}`, secHref(s), icon(s.icon), s.title); continue; }

    let children = '';
    let count = '';
    if (s.kind === 'sale-guide') {
      children = CAT.vendors.map((v) => navLeaf(`vendor:${v.id}`, vendorHref(v), '', v.name, `<span class="count">${v.count}</span>`)).join('');
      count = `<span class="count">${CAT.vendors.length}</span>`;
    } else {
      children = CAT.items.filter((i) => i.section === s.id).map((i) => navLeaf(`item:${i.id}`, itemHref(i), '', i.title.replace(/^BOM /, ''),
        i.status === 'soon' ? '<span class="pill">Sắp có</span>' : '').replace('class="nav-item"', `class="nav-item${i.status === 'soon' ? ' soon' : ''}"`)).join('');
    }
    const lock = s.locked ? `<span class="lock">${icon(isBomUnlocked() ? 'unlock' : 'lock', 'lock')}</span>` : '';
    html += `<div class="nav-node${open.has(s.id) ? ' open' : ''}" data-id="${s.id}">
      ${navLeaf(`sec:${s.id}`, secHref(s), icon(s.icon), s.title, lock + count + `<span class="caret">${icon('chevron')}</span>`)}
      <div class="nav-children">${children}</div></div>`;
  }
  $('#nav').innerHTML = html;
}

function setActive(key, parentSec) {
  const nav = $('#nav');
  nav.querySelectorAll('.nav-item.active').forEach((a) => a.classList.remove('active'));
  nav.querySelectorAll(`[data-key="${CSS.escape(key)}"]`).forEach((a) => a.classList.add('active'));
  if (parentSec) nav.querySelector(`.nav-node[data-id="${parentSec}"]`)?.classList.add('open');
  nav.querySelector('.nav-item.active')?.scrollIntoView({ block: 'nearest' });
}

function setCrumbs(parts) {
  const sep = icon('chevron', 'sep');
  $('#crumbs').innerHTML = [`<a href="#/" title="Trang chủ">${icon('home')}</a>`,
    ...parts.map((p, i) => (i === parts.length - 1 || !p.href ? `<b>${esc(p.label)}</b>` : `<a href="${p.href}">${esc(p.label)}</a>`))].join(sep);
}

// ---------------------------------------------------------------- điều hướng
function route() {
  const [path, qs] = location.hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const params = new URLSearchParams(qs || '');
  toggleMobileNav(false);
  toggleDrawer(false);
  renderNav();

  if (!parts.length) return showPage(renderHome(), [], 'home');
  if (parts[0] === 's' && SEC[parts[1]]) {
    const s = SEC[parts[1]];
    if (s.kind === 'app') return location.replace(secHref(s));
    if (s.kind === 'sale-guide') {
      if (parts[2] && VENDOR[parts[2]]) return renderVendor(VENDOR[parts[2]]);
      return renderSaleGuide(params);
    }
    return renderCollection(s);
  }
  if (parts[0] === 'v' && ITEM[parts[1]]) return openItem(ITEM[parts[1]], params.get('q'), params.get('find'));
  showPage(`<div class="page"><div class="empty">${icon('info')}<div>Không tìm thấy trang. <a class="muted" href="#/"><u>Về trang chủ</u></a></div></div></div>`, [{ label: 'Không tìm thấy' }], '');
}

function showPage(html, crumbs, activeKey, parentSec) {
  current = null;
  $('#frameView').hidden = true;
  $('#itemActions').hidden = true;
  const view = $('#view');
  view.hidden = false;
  view.innerHTML = html;
  view.querySelectorAll('.search-input').forEach(bindSearchInput);
  view.scrollTop = 0;
  setCrumbs(crumbs);
  setActive(activeKey, parentSec);
  document.title = `${crumbs.length ? crumbs[crumbs.length - 1].label + ' · ' : ''}PM Hub`;
}

// ---------------------------------------------------------------- mở nội dung (iframe được giữ lại)
async function openItem(it, q, find) {
  const sec = SEC[it.section];
  const crumbs = [];
  if (sec.kind !== 'app') crumbs.push({ label: sec.title, href: secHref(sec) });
  if (it.section === 'sale-guide') {
    const v = CAT.vendors.find((x) => x.name === it.vendor);
    if (v) crumbs.push({ label: v.name, href: vendorHref(v) });
  }
  crumbs.push({ label: it.title });

  if (it.status === 'soon') {
    toast(`${it.title} đang được cập nhật`);
    return location.replace(secHref(sec));
  }
  if (it.kind === 'bom' && !isBomUnlocked()) {
    showPage(lockScreen(it), crumbs, `item:${it.id}`, sec.id);
    return bindUnlock(() => openItem(it, q, find));
  }

  current = it;
  $('#view').hidden = true;
  $('#frameView').hidden = false;
  $('#itemActions').hidden = false;
  setCrumbs(crumbs);
  setActive(`item:${it.id}`, sec.id);
  document.title = `${it.title} · PM Hub`;
  syncFav();
  syncSaved();
  const open = $('#actOpen');
  open.hidden = it.kind === 'bom';
  if (it.kind !== 'bom') open.href = it.src;
  pushRecent(it.id);
  if ($('#drawer').classList.contains('open')) renderDrawer();

  let f = frames.get(it.id);
  if (!f) {
    f = { el: document.createElement('iframe'), loaded: false };
    f.el.title = it.title;
    f.el.allow = 'clipboard-read; clipboard-write; fullscreen';
    f.el.addEventListener('load', () => {
      f.loaded = true;
      if (it.persist) hookPersist(it, f);
      if (current?.id === it.id) $('#frameLoading')?.remove();
      if (f.q) { highlightIn(f.el, f.q); f.q = null; }
    });
    frames.set(it.id, f);
    $('#frameHost').append(f.el);
    if (it.kind === 'bom') {
      try {
        f.blob = await decryptBom(it);
        f.el.src = f.blob;
      } catch (e) {
        dropFrame(it.id);
        if (current?.id === it.id) showPage(`<div class="page"><div class="empty">${icon('lock')}<div>Không mở được ${esc(it.title)}: ${esc(e.message)}</div></div></div>`, crumbs, `item:${it.id}`, sec.id);
        return;
      }
    } else {
      f.el.src = it.src;
    }
  } else {
    frames.delete(it.id); // đưa lên cuối (LRU)
    frames.set(it.id, f);
  }
  if (current?.id !== it.id) return;
  for (const [id, x] of frames) x.el.hidden = id !== it.id;
  $('#frameLoading')?.remove();
  if (!f.loaded) $('#frameHost').insertAdjacentHTML('beforeend', `<div class="frame-loading" id="frameLoading"><span class="spinner"></span>Đang tải ${esc(it.title)}…</div>`);
  if (q) f.loaded ? highlightIn(f.el, q) : (f.q = q);
  if (find && it.persist?.search) {
    f.find = find;
    if (f.ready) applyFind(it, f);
  }

  // Giữ lại các tool Tổng hợp (không bao giờ đóng); chỉ đóng bớt tài liệu cũ nhất.
  while (frames.size > MAX_FRAMES) {
    const old = [...frames.keys()].find((id) => id !== it.id && !ITEM[id]?.app);
    if (!old) break;
    dropFrame(old);
  }
}

function dropFrame(id) {
  const f = frames.get(id);
  if (!f) return;
  f.el.remove();
  if (f.blob) URL.revokeObjectURL(f.blob);
  frames.delete(id);
}

// ---------------------------------------------------------------- lưu file Excel đã nạp vào tool (IndexedDB)
// Hub bắt sự kiện chọn / kéo-thả file trong tool (cùng origin), lưu file vào IndexedDB của trình duyệt,
// và tự nạp lại khi tool được mở lại hoặc khi tải lại trang — không cần sửa code của từng tool.
const idb = (() => {
  let dbp;
  const open = () => (dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open('pmhub', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('imports');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const run = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction('imports', mode);
      const req = fn(t.objectStore('imports'));
      t.oncomplete = () => res(req.result);
      t.onerror = () => rej(t.error);
    });
  };
  return {
    get: (k) => run('readonly', (st) => st.get(k)).catch(() => null),
    set: (k, v) => run('readwrite', (st) => st.put(v, k)),
    del: (k) => run('readwrite', (st) => st.delete(k)),
  };
})();

async function saveImport(it, list) {
  // File tạo trong iframe thuộc realm khác nên không dùng instanceof.
  const files = [...list].filter((x) => x && typeof x.arrayBuffer === 'function' && x.size);
  if (!files.length) return;
  let next = files;
  if (it.persist.mode === 'append') {
    const prev = (await idb.get(it.id))?.files || [];
    const names = new Set(files.map((x) => x.name));
    next = [...prev.filter((x) => !names.has(x.name)), ...files];
  } else {
    next = files.slice(0, 1);
  }
  try {
    await idb.set(it.id, { files: next, savedAt: Date.now() });
    toast(`Đã lưu dữ liệu ${it.short || it.title} — lần sau mở lại không cần nạp file`);
  } catch {
    toast('Trình duyệt không cho lưu dữ liệu (chế độ ẩn danh?)');
  }
  if (current?.id === it.id) syncSaved();
  syncData();
}

async function hookPersist(it, f) {
  let win, doc;
  try { win = f.el.contentWindow; doc = f.el.contentDocument; } catch { return; }
  if (!doc?.body) return;
  doc.addEventListener('change', (e) => {
    if (!f.replaying && e.target.matches?.('input[type=file]')) saveImport(it, e.target.files);
  }, true);
  win.addEventListener('drop', (e) => {
    if (!f.replaying && e.dataTransfer?.files?.length) saveImport(it, e.dataTransfer.files);
  }, true);
  // Nút "Xoá toàn bộ dữ liệu" trong tool -> xóa luôn bản đã lưu.
  const confirm0 = win.confirm.bind(win);
  win.confirm = (msg) => {
    const ok = confirm0(msg);
    if (ok && /xo[áa]/i.test(msg) && /d[ữu] li[ệe]u|file/i.test(msg)) idb.del(it.id).then(() => { syncSaved(); syncData(); });
    return ok;
  };

  const rec = await idb.get(it.id);
  const input = doc.querySelector(it.persist.input);
  if (!rec?.files?.length || !input) return markReady(it, f, 0);
  await new Promise((r) => setTimeout(r, 60));
  // Tạo lại File trong realm của iframe để thư viện Excel của tool nhận đúng kiểu dữ liệu.
  const dt = new win.DataTransfer();
  for (const file of rec.files) {
    const buf = new win.Uint8Array(await file.arrayBuffer());
    dt.items.add(new win.File([buf], file.name || 'data.xlsx', { type: file.type, lastModified: file.lastModified }));
  }
  f.replaying = true;
  try {
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  } finally {
    f.replaying = false;
  }
  toast(`Đã tự nạp lại ${rec.files.length} file cho ${it.short || it.title}`);
  markReady(it, f, 1200);
}

/** Tool đã nạp xong dữ liệu -> áp dụng từ khóa tìm kiếm đang chờ (mở từ kết quả "Dữ liệu"). */
function markReady(it, f, delay) {
  setTimeout(() => {
    f.ready = true;
    if (f.find) applyFind(it, f);
  }, delay);
}

function applyFind(it, f) {
  const q = f.find;
  f.find = null;
  try {
    const inp = f.el.contentDocument.querySelector(it.persist.search);
    if (!inp) return;
    inp.value = q;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    toast(`Đã lọc ${it.short || it.title} theo “${q}”`);
  } catch { /* khác origin */ }
}

/** Nút "đã lưu N file" trên topbar của tool đang mở. */
async function syncSaved() {
  const chip = $('#actSaved');
  const it = current;
  if (!it?.persist) { chip.hidden = true; return; }
  const rec = await idb.get(it.id);
  if (current?.id !== it.id) return;
  const n = rec?.files?.length || 0;
  chip.hidden = !n;
  if (!n) return;
  const when = new Date(rec.savedAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  chip.innerHTML = `${icon('database')}<span>Đã lưu ${n} file</span>${icon('close', 'x')}`;
  const read = dataIx.counts().find((c) => c.item.id === it.id);
  chip.title = `${read ? `Ô tìm kiếm đã đọc ${read.rows} dòng dữ liệu của tool này.\n` : ''}Dữ liệu đã nạp được lưu trên trình duyệt này (cập nhật ${when}):\n${rec.files.map((x) => '• ' + x.name).join('\n')}\n\nBấm để xóa dữ liệu đã lưu.`;
}

async function clearSaved() {
  const it = current;
  if (!it?.persist || !confirm(`Xóa dữ liệu đã lưu của ${it.title}? Tool sẽ được tải lại trống.`)) return;
  await idb.del(it.id);
  syncData();
  dropFrame(it.id);
  openItem(it);
}

async function decryptBomHtml(it) {
  const res = await fetch(it.src, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`không tải được file (${res.status})`);
  const key = await importKey(store.get(K.bom, null, sessionStorage));
  return decryptFile(key, await res.arrayBuffer());
}

async function decryptBom(it) {
  const html = await decryptBomHtml(it);
  return URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
}

// ---------------------------------------------------------------- chỉ mục dữ liệu trong tool (file đã nạp + BOM)
const dataIx = new DataIndex();
let dataDirty = false;
async function syncData() {
  if (dataIx.building) { dataDirty = true; return; }
  dataDirty = false;
  const tools = await Promise.all(CAT.items.filter((i) => i.persist).map(async (item) => ({ item, rec: await idb.get(item.id) })));
  let boms = [];
  if (isBomUnlocked()) boms = CAT.items.filter((i) => i.kind === 'bom' && i.src).map((item) => ({ item, load: () => decryptBomHtml(item) }));
  else dataIx.dropBom();
  if (!$('#palette').hidden) renderPalette();
  await dataIx.sync(tools, boms);
  if (!$('#palette').hidden) renderPalette();
  if (dataDirty) syncData();
}

/** Cuộn tới và tô sáng từ khóa tìm kiếm trong tài liệu (cùng origin). */
function highlightIn(frame, q) {
  try {
    const doc = frame.contentDocument;
    if (!doc?.body) return;
    const nq = norm(q).trim();
    const words = nq.split(/\s+/).filter((w) => w.length >= 3).sort((a, b) => b.length - a.length);
    for (const needle of [nq, ...words]) {
      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.parentElement && !/script|style/i.test(n.parentElement.tagName) && n.parentElement.offsetParent !== null ? 1 : 3),
      });
      let node;
      while ((node = walker.nextNode())) {
        const { out, map } = normMap(node.data);
        const i = out.indexOf(needle);
        if (i < 0) continue;
        const range = doc.createRange();
        range.setStart(node, map[i]);
        range.setEnd(node, map[i + needle.length - 1] + 1);
        const mark = doc.createElement('mark');
        mark.style.cssText = 'background:#ffd29e;color:inherit;border-radius:3px;box-shadow:0 0 0 3px rgba(243,112,33,.35);transition:box-shadow 1.5s';
        range.surroundContents(mark);
        mark.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setTimeout(() => { mark.style.boxShadow = 'none'; }, 2500);
        return;
      }
    }
  } catch { /* khác origin: bỏ qua */ }
}

// ---------------------------------------------------------------- BOM: khóa lớp 2
function lockScreen(it) {
  return `<div class="lock-screen"><div class="card lock-card">
    <div class="lock-ic">${icon('lock')}</div>
    <h2>Khu vực Tool chạy BOM</h2>
    <p>${it ? `<b>${esc(it.title)}</b> chứa` : 'Các tool BOM chứa'} thông tin giá nội bộ đã được mã hóa. Nhập tài khoản PM để mở khóa — chỉ cần một lần cho cả phiên làm việc.</p>
    <form id="unlockForm">
      <div class="field"><label for="ulUser">Tên đăng nhập</label>
        <div class="input">${icon('user')}<input id="ulUser" autocomplete="username" required></div></div>
      <div class="field"><label for="ulPass">Mật khẩu</label>
        <div class="input">${icon('key')}<input id="ulPass" type="password" autocomplete="current-password" required>
        <button type="button" class="eye" aria-label="Hiện mật khẩu">${icon('eye')}</button></div></div>
      <button class="btn-primary" type="submit">${icon('unlock')}<span>Mở khóa</span></button>
      <div class="login-err" id="ulErr" role="alert"></div>
    </form></div></div>`;
}

function bindUnlock(after) {
  const form = $('#unlockForm');
  bindPasswordEye(form);
  setTimeout(() => $('#ulUser').focus(), 50);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitCredentials(form, $('#ulUser'), $('#ulPass'), $('#ulErr'), async (key) => {
      store.set(K.bom, await exportKey(key), sessionStorage);
      toast('Đã mở khóa Tool chạy BOM cho phiên này');
      syncData();
      renderNav();
      after();
    });
  });
}

function lockBom() {
  store.del(K.bom);
  dataIx.dropBom();
  for (const [id] of [...frames]) if (ITEM[id]?.kind === 'bom') dropFrame(id);
  toast('Đã khóa lại Tool chạy BOM');
  route();
}

// ---------------------------------------------------------------- ghim & gần đây
function toggleFav(id) {
  const favs = store.get(K.fav, []);
  const i = favs.indexOf(id);
  i >= 0 ? favs.splice(i, 1) : favs.unshift(id);
  store.set(K.fav, favs);
  toast(i >= 0 ? 'Đã bỏ ghim' : 'Đã ghim lên menu');
  syncFav();
  renderNav();
  if (current) setActive(`item:${current.id}`, current.section);
}
function syncFav() {
  const on = current && store.get(K.fav, []).includes(current.id);
  $('#actFav').classList.toggle('on', !!on);
}
function pushRecent(id) {
  const r = store.get(K.recent, []).filter((x) => x.id !== id);
  r.unshift({ id, t: Date.now() });
  store.set(K.recent, r.slice(0, 12));
}
function ago(t) {
  const m = Math.round((Date.now() - t) / 6e4);
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m} phút`;
  if (m < 1440) return `${Math.round(m / 60)} giờ`;
  return `${Math.round(m / 1440)} ngày`;
}

const rowLink = (it, side = '') => `<a class="row-link" href="${itemHref(it)}" style="--c:${colorOf(it)}">
  <span class="r-icon">${iconOf(it)}</span><span class="r-main"><b>${esc(it.title)}</b><span>${itemMeta(it)}</span></span>
  ${side ? `<span class="r-side">${side}</span>` : ''}</a>`;

// ---------------------------------------------------------------- trang chủ
function renderHome() {
  const h = new Date().getHours();
  const greet = h < 11 ? 'Chào buổi sáng' : h < 14 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const today = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const sale = CAT.items.filter((i) => i.section === 'sale-guide');
  const bomReady = CAT.items.filter((i) => i.section === 'bom' && i.status !== 'soon');
  const apps = CAT.sections.filter((s) => s.kind === 'app');
  const courses = CAT.items.filter((i) => i.section === 'learning');
  const recent = store.get(K.recent, []).filter((r) => ITEM[r.id]).slice(0, 6);
  const favs = store.get(K.fav, []).map((id) => ITEM[id]).filter(Boolean).slice(0, 6);

  const tiles = CAT.sections.map((s) => {
    let desc = s.desc;
    if (s.id === 'sale-guide') desc = `${sale.length} tài liệu · ${CAT.vendors.length} hãng — cẩm nang, nghiên cứu, bài kiểm tra.`;
    if (s.id === 'bom') desc = `${bomReady.length} tool sẵn sàng: ${bomReady.map((b) => b.title.replace(/^BOM /, '')).join(', ')}.`;
    return `<a class="card tile" href="${secHref(s)}" style="--c:${SECTION_COLOR[s.id]}">
      <span class="t-icon">${icon(s.icon)}</span>
      ${s.locked ? `<span class="lock-badge">${icon(isBomUnlocked() ? 'unlock' : 'lock')}</span>` : `<span class="go">${icon('arrowRight')}</span>`}
      <div><h3>${esc(s.title)}</h3><p>${esc(desc)}</p></div></a>`;
  }).join('');

  const catCount = {};
  for (const d of sale) catCount[d.cat] = (catCount[d.cat] || 0) + 1;
  const cats = Object.entries(catCount).sort((a, b) => b[1] - a[1]).map(([k, n]) => {
    const c = CAT.cats[k] || { label: k, color: '#64748b', icon: '' };
    return `<a class="card cat-card" href="#/s/sale-guide?cat=${k}" style="--c:${c.color}"><span class="t-icon">${rawIcon(c.icon)}</span>
      <div><b>${esc(c.label)}</b><span>${n} tài liệu</span></div></a>`;
  }).join('');

  const quick = ['BOM Kemp', 'DDoS', 'DLP', 'Dealreg', 'Nghị định 85', 'kỹ năng bán hàng'];
  return `<div class="page">
    <section class="hero">
      <div class="hello">${icon('clock')}<span style="text-transform:capitalize">${esc(today)}</span></div>
      <h1>${greet}, Minh 👋</h1>
      <p>Mọi công cụ PM ở một nơi — lên BOM, tổng hợp số liệu, tra cứu sale guide và học tập.</p>
      <label class="hero-search">${icon('search')}<input class="lbl search-input" id="heroSearch" placeholder="Gõ để tìm công cụ, hãng, giải pháp, nội dung…" autocomplete="off" spellcheck="false"><kbd>Ctrl K</kbd></label>
      <div class="quick">Tìm nhanh: ${quick.map((q) => `<button data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    </section>
    <div class="stats">
      <div class="card stat" style="--c:#f37021"><span class="t-icon">${icon('calculator')}</span><div><b>${bomReady.length + apps.length}</b><span>Công cụ đang chạy</span></div></div>
      <div class="card stat" style="--c:#0b5cad"><span class="t-icon">${icon('grid')}</span><div><b>${CAT.vendors.length}</b><span>Hãng / vendor</span></div></div>
      <div class="card stat" style="--c:#16a34a"><span class="t-icon">${icon('book')}</span><div><b>${sale.length}</b><span>Tài liệu sale guide</span></div></div>
      <div class="card stat" style="--c:#d946ef"><span class="t-icon">${icon('graduation')}</span><div><b>${courses.length}</b><span>Khóa học</span></div></div>
    </div>
    <div class="h2">${icon('grid')}Truy cập nhanh</div>
    <div class="grid g-tiles">${tiles}</div>
    <div class="two-col">
      <div><div class="h2">${icon('clock')}Tiếp tục làm việc</div>
        <div class="card list-card">${recent.length ? recent.map((r) => rowLink(ITEM[r.id], ago(r.t))).join('') : '<div class="empty-mini">Các mục bạn mở gần đây sẽ hiện ở đây.</div>'}</div></div>
      <div><div class="h2">${icon('star')}Đã ghim</div>
        <div class="card list-card">${favs.length ? favs.map((it) => rowLink(it)).join('') : `<div class="empty-mini">Bấm ${icon('star')} khi đang xem một mục để ghim lên menu.</div>`}</div></div>
    </div>
    <div class="h2">${icon('layers')}Sale Guide theo lĩnh vực<a class="more" href="#/s/sale-guide">Xem tất cả →</a></div>
    <div class="cat-grid">${cats}</div>
  </div>`;
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-q],[data-lock-bom]');
  if (!t) return;
  if (t.dataset.lockBom !== undefined) return lockBom();
  focusSearch(t.dataset.q || '');
});

// ---------------------------------------------------------------- trang danh mục (BOM, Update, Learning)
function renderCollection(s) {
  const items = CAT.items.filter((i) => i.section === s.id);
  const bar = s.locked ? (isBomUnlocked()
    ? `<div class="unlock-bar">${icon('unlock')}<span>Đã mở khóa cho phiên làm việc này. Đóng trình duyệt hoặc bấm “Khóa lại” để khóa.</span><button class="btn" data-lock-bom>${icon('lock')}Khóa lại</button></div>`
    : `<div class="unlock-bar locked">${icon('lock')}<span>Nội dung được mã hóa AES-256. Bạn sẽ được yêu cầu nhập tài khoản PM khi mở tool đầu tiên.</span></div>`) : '';
  const cards = items.map((it) => {
    const soon = it.status === 'soon';
    return `<a class="card tile${soon ? ' soon' : ''}" href="${soon ? 'javascript:void 0' : itemHref(it)}" style="--c:${colorOf(it)}">
      <span class="t-icon">${iconOf(it)}</span>
      ${soon ? '<span class="lock-badge"><span class="pill">Sắp có</span></span>' : `<span class="go">${icon('arrowRight')}</span>`}
      <div><h3>${esc(it.title)}</h3><p>${esc(it.desc || '')}</p></div>
      <div class="tags">${it.type ? typeBadge(it.type) : ''}${(it.tags || []).slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div></a>`;
  }).join('');
  showPage(`<div class="page">
    <div class="page-head"><span class="page-icon" style="background:linear-gradient(135deg,${SECTION_COLOR[s.id]},#061f42)">${icon(s.icon)}</span>
      <div class="grow"><h1>${esc(s.title)}</h1><p>${esc(s.desc)}</p></div></div>
    ${bar}<div class="grid g-cards">${cards || `<div class="empty">Chưa có nội dung.</div>`}</div></div>`,
  [{ label: s.title }], `sec:${s.id}`, s.id);
}

// ---------------------------------------------------------------- Sale guide
const sg = { cat: '', type: '', q: '', view: 'vendor' };

function renderSaleGuide(params) {
  sg.cat = params.get('cat') || '';
  sg.type = params.get('type') || '';
  sg.q = '';
  if (sg.cat || sg.type) sg.view = 'docs';
  const docs = CAT.items.filter((i) => i.section === 'sale-guide');
  const catCount = {}, typeCount = {};
  for (const d of docs) { catCount[d.cat] = (catCount[d.cat] || 0) + 1; typeCount[d.type] = (typeCount[d.type] || 0) + 1; }
  const s = SEC['sale-guide'];
  showPage(`<div class="page">
    <div class="page-head"><span class="page-icon">${icon('book')}</span>
      <div class="grow"><h1>${esc(s.title)}</h1><p>${esc(s.desc)} ${docs.length} tài liệu từ ${CAT.vendors.length} hãng.</p></div></div>
    <div class="filterbar">
      <div class="filter-row">
        <div class="local-search">${icon('search')}<input id="sgQ" placeholder="Lọc theo tên tài liệu, hãng, giải pháp…"></div>
        <div class="seg" id="sgView"><button data-v="vendor">${icon('grid')}Theo hãng</button><button data-v="docs">${icon('file')}Tất cả tài liệu</button></div>
      </div>
      <div class="filter-row"><span class="lbl">Lĩnh vực</span><div class="chips" id="sgCats">
        <button class="chip" data-cat="">Tất cả</button>
        ${Object.entries(catCount).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<button class="chip" data-cat="${k}" style="--c:${CAT.cats[k]?.color}"><span class="dot"></span>${esc(CAT.cats[k]?.label || k)}<span class="n">${n}</span></button>`).join('')}
      </div></div>
      <div class="filter-row"><span class="lbl">Loại</span><div class="chips" id="sgTypes">
        <button class="chip" data-type="">Tất cả</button>
        ${CAT.types.filter((t) => typeCount[t]).map((t) => `<button class="chip" data-type="${esc(t)}">${icon(TYPE[t]?.ic || 'file')}${esc(t)}<span class="n">${typeCount[t]}</span></button>`).join('')}
      </div></div>
    </div>
    <div id="sgResults"></div></div>`, [{ label: s.title }], 'sec:sale-guide', 'sale-guide');

  $('#sgQ').addEventListener('input', (e) => { sg.q = e.target.value; if (sg.q) sg.view = 'docs'; drawSaleGuide(); });
  $('#sgView').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { sg.view = b.dataset.v; drawSaleGuide(); } });
  $('#sgCats').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { sg.cat = b.dataset.cat; drawSaleGuide(); } });
  $('#sgTypes').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { sg.type = b.dataset.type; if (sg.type) sg.view = 'docs'; drawSaleGuide(); } });
  drawSaleGuide();
}

function drawSaleGuide() {
  $('#sgView').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === sg.view));
  $('#sgCats').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.cat === sg.cat));
  $('#sgTypes').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.type === sg.type));
  const nq = norm(sg.q).trim();
  const docs = CAT.items.filter((d) => d.section === 'sale-guide'
    && (!sg.cat || d.cat === sg.cat) && (!sg.type || d.type === sg.type)
    && (!nq || norm([d.title, d.vendor, d.solution, ...(d.tags || [])].join(' ')).includes(nq)));
  const out = $('#sgResults');
  if (!docs.length) { out.innerHTML = `<div class="empty">${icon('search')}<div>Không có tài liệu phù hợp bộ lọc.</div></div>`; return; }

  if (sg.view === 'vendor') {
    const byVendor = CAT.vendors.map((v) => ({ v, docs: docs.filter((d) => d.vendor === v.name) })).filter((x) => x.docs.length);
    out.innerHTML = `<div class="grid g-cards">${byVendor.map(({ v, docs: vd }) => {
      const sols = [...new Set(vd.map((d) => d.solution))];
      const types = {};
      for (const d of vd) types[d.type] = (types[d.type] || 0) + 1;
      return `<a class="card vendor-card" href="${vendorHref(v)}" style="--c:${vendorColor(v)}">
        <div class="vendor-top"><span class="v-avatar">${esc(initials(v.name))}</span><div><h3>${esc(v.name)}</h3><span>${sols.length} dòng giải pháp · ${vd.length} tài liệu</span></div></div>
        <div class="vendor-sols">${sols.map((s) => `<div style="--c:${CAT.cats[vd.find((d) => d.solution === s).cat]?.color}"><i></i>${esc(s)}</div>`).join('')}</div>
        <div class="vendor-foot">${Object.entries(types).map(([t, n]) => `<span class="badge" style="--c:${TYPE[t]?.c}">${icon(TYPE[t]?.ic || 'file')}${n} ${esc(t)}</span>`).join('')}</div></a>`;
    }).join('')}</div>`;
  } else {
    out.innerHTML = `<div class="card">${docs.map((d) => docRow(d, true, sg.q)).join('')}</div>`;
  }
}

function docRow(d, showVendor, q) {
  const c = TYPE[d.type]?.c || colorOf(d);
  const terms = q ? norm(q).split(/\s+/).filter(Boolean) : [];
  return `<a class="doc-row" href="${itemHref(d)}" style="--c:${c}">
    <span class="r-icon">${icon(TYPE[d.type]?.ic || 'file')}</span>
    <span class="r-main"><b>${highlight(d.title, terms)}</b>
      <span class="r-meta">${typeBadge(d.type)}${showVendor ? `<span>${esc(d.vendor)} · ${esc(d.solution)}</span>` : ''}${(d.tags || []).slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</span></span>
    <span class="go">${icon('arrowRight')}</span></a>`;
}

function renderVendor(v) {
  const docs = CAT.items.filter((d) => d.section === 'sale-guide' && d.vendor === v.name);
  const products = new Set(docs.map((d) => d.product).filter(Boolean));
  const tools = CAT.items.filter((i) => i.section === 'bom' && (products.has(i.product) || i.vendor === v.name));
  const order = (t) => { const i = CAT.types.indexOf(t); return i < 0 ? 99 : i; };
  const blocks = v.solutions.map((sol) => {
    const sd = docs.filter((d) => d.solution === sol).sort((a, b) => order(a.type) - order(b.type));
    const c = CAT.cats[sd[0].cat] || { color: '#0b5cad', icon: '', label: '' };
    return `<div class="card sol-block" style="--c:${c.color}">
      <div class="sol-head"><span class="t-icon">${rawIcon(c.icon)}</span><div><h3>${esc(sol)}</h3><span>${esc(c.label)} · ${sd.length} tài liệu</span></div></div>
      ${sd.map((d) => docRow(d, false)).join('')}</div>`;
  }).join('');
  showPage(`<div class="page">
    <div class="page-head" style="--c:${vendorColor(v)}"><span class="v-avatar" style="width:54px;height:54px;font-size:18px;border-radius:15px">${esc(initials(v.name))}</span>
      <div class="grow"><h1>${esc(v.name)}</h1><p>${v.solutions.length} dòng giải pháp · ${docs.length} tài liệu sale guide</p></div></div>
    ${tools.length ? `<div class="related-tools">${tools.map((t) => `<a class="btn${t.status === 'soon' ? '' : ' accent'}" href="${t.status === 'soon' ? 'javascript:void 0' : itemHref(t)}">${icon('calculator')}${esc(t.title)}${t.status === 'soon' ? ' <span class="pill">Sắp có</span>' : ''}</a>`).join('')}</div>` : ''}
    ${blocks}</div>`,
  [{ label: 'Sale Guide', href: '#/s/sale-guide' }, { label: v.name }], `vendor:${v.id}`, 'sale-guide');
}

// ---------------------------------------------------------------- nội dung liên quan
function toggleDrawer(open) {
  const d = $('#drawer');
  const on = open ?? !d.classList.contains('open');
  d.classList.toggle('open', on && !!current);
  if (on && current) renderDrawer();
}
function renderDrawer() {
  const it = current;
  const rel = related(CAT, it);
  $('#drawerBody').innerHTML = `<div class="info"><b style="color:var(--text)">${esc(it.title)}</b>
      <div style="margin-top:4px">${esc(it.desc || [it.vendor, it.solution].filter(Boolean).join(' · '))}</div>
      <div class="tags">${typeBadge(it.type)}${(it.tags || []).map((t) => `<button class="tag" data-q="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>
    ${rel.length ? rel.map((r) => rowLink(r)).join('') : '<div class="empty-mini muted" style="padding:20px;text-align:center">Chưa có nội dung liên quan.</div>'}`;
}

// ---------------------------------------------------------------- tìm kiếm trực tiếp trong ô (Ctrl K)
const pal = { sel: 0, entries: [], sugg: [], input: null };

async function loadIndex() {
  if (indexLoading) return indexLoading;
  indexLoading = fetch('data/search-index.json', { cache: 'no-cache' }).then((r) => r.json()).then((ix) => {
    engine = new SearchEngine(CAT, ix);
    if (!$('#palette').hidden) renderPalette();
  }).catch(() => { indexLoading = null; });
  return indexLoading;
}

/** Đặt khung kết quả ngay dưới ô tìm kiếm đang gõ. */
function placePalette() {
  const inp = pal.input;
  if (!inp) return;
  const box = (inp.closest('.top-search, .sb-search, .hero-search') || inp).getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const width = Math.min(720, vw - 16);
  const left = Math.max(8, Math.min(box.left, vw - width - 8));
  const p = $('#palette');
  p.style.top = `${box.bottom + 8}px`;
  p.style.left = `${left}px`;
  p.style.width = `${width}px`;
  p.querySelector('.pal').style.maxHeight = `${Math.max(240, window.innerHeight - box.bottom - 24)}px`;
}

function openPalette(input) {
  pal.input = input;
  syncData();
  $('#palette').hidden = false;
  pal.sel = 0;
  placePalette();
  renderPalette();
}
function closePalette() {
  $('#palette').hidden = true;
}

/** Focus ô tìm kiếm (Ctrl K, "/", nút Tìm nhanh). */
function focusSearch(q) {
  const hero = $('#heroSearch');
  const inp = hero && hero.offsetParent ? hero : $('#topSearch');
  if (q !== undefined) inp.value = q;
  inp.focus();
  inp.select();
  openPalette(inp);
}

function bindSearchInput(inp) {
  if (inp.dataset.bound) return;
  inp.dataset.bound = '1';
  inp.addEventListener('focus', () => openPalette(inp));
  inp.addEventListener('input', () => { pal.input = inp; pal.sel = 0; if ($('#palette').hidden) openPalette(inp); else renderPalette(); });
  inp.addEventListener('keydown', (e) => {
    if ($('#palette').hidden && e.key !== 'Escape') openPalette(inp);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = pal.entries.length;
      if (!n) return;
      pal.sel = (pal.sel + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
      markSel(true);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const en = pal.entries[pal.sel];
      if (en) go(en.href);
    } else if (e.key === 'Tab' && pal.sugg.length && !e.shiftKey) {
      e.preventDefault();
      inp.value = pal.sugg[0];
      pal.sel = 0;
      renderPalette();
    } else if (e.key === 'Escape') {
      closePalette();
      inp.blur();
    }
  });
}

function bindPalette() {
  document.querySelectorAll('.search-input').forEach(bindSearchInput);
  const pop = $('#palette');
  // Giữ focus ở ô đang gõ khi bấm vào khung kết quả.
  pop.addEventListener('mousedown', (e) => e.preventDefault());
  document.addEventListener('mousedown', (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('.search-input')) closePalette();
  });
  window.addEventListener('resize', () => !pop.hidden && placePalette());
  $('#view').addEventListener('scroll', () => !pop.hidden && placePalette(), { passive: true });
  $('#palSugg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !pal.input) return;
    pal.input.value = b.dataset.s;
    pal.input.focus();
    pal.sel = 0;
    renderPalette();
  });
  $('#palBody').addEventListener('mousemove', (e) => {
    const el = e.target.closest('.pal-item');
    if (el && +el.dataset.i !== pal.sel) { pal.sel = +el.dataset.i; markSel(false); }
  });
  $('#palBody').addEventListener('click', (e) => {
    const el = e.target.closest('.pal-item');
    if (el) go(pal.entries[+el.dataset.i].href);
  });
}

function go(href) {
  closePalette();
  if (pal.input) {
    pal.input.blur();
    pal.input.value = '';
  }
  if (location.hash === href) route();
  else location.hash = href;
}

function markSel(scroll) {
  $('#palBody').querySelectorAll('.pal-item').forEach((el) => {
    const on = +el.dataset.i === pal.sel;
    el.classList.toggle('sel', on);
    if (on && scroll) el.scrollIntoView({ block: 'nearest' });
  });
}

/** Nhóm kết quả tìm trong dữ liệu tool (mỗi tool / BOM một nhóm). */
function dataGroups(q, terms) {
  const enc = encodeURIComponent;
  return dataIx.search(q, 5).map(({ item, total, best, hits }) => {
    const isBom = item.kind === 'bom';
    const tag = `<span class="badge" style="--c:${colorOf(item)}">${icon(isBom ? 'calculator' : 'database')}${esc(item.short || item.title.replace(/^BOM /, 'BOM '))}</span>`;
    const list = hits.map((r) => {
      const cell = isBom ? null : DataIndex.matchedCell(r, q);
      return {
        href: isBom ? `#/v/${item.id}?q=${enc(r.title)}` : `#/v/${item.id}?find=${enc(r.id || r.title)}`,
        color: colorOf(item),
        icon: icon(isBom ? 'calculator' : item.icon || 'database'),
        title: highlight(`${r.id ? r.id + ' · ' : ''}${r.title}`, terms),
        meta: `${tag}<span>${highlight(r.meta.join(' · '), terms)}</span>`,
        snip: cell ? `<b>${esc(cell[0])}:</b> ${highlight(cell[1], terms)}` : '',
      };
    });
    if (total > hits.length) {
      list.push({
        href: isBom ? `#/v/${item.id}?q=${enc(q)}` : `#/v/${item.id}?find=${enc(q)}`,
        color: colorOf(item), icon: icon('arrowRight'),
        title: `Xem tất cả ${total} kết quả trong ${esc(item.short || item.title)}`,
        meta: `<span>${isBom ? 'Mở tool BOM và tô sáng từ khóa' : 'Mở tool và lọc sẵn theo từ khóa'}</span>`,
      });
    }
    const label = isBom ? `Trong ${esc(item.title)}` : `Dữ liệu đã nạp · ${esc(item.short || item.title)}`;
    return { best, total, group: [`${label} — ${total} dòng`, list] };
  });
}

function palItem(en, i) {
  return `<div class="pal-item${i === pal.sel ? ' sel' : ''}" data-i="${i}" style="--c:${en.color}">
    <span class="r-icon">${en.icon}</span>
    <div class="r-main"><b>${en.title}</b><div class="r-meta">${en.meta}</div>${en.snip ? `<div class="snip">${en.snip}</div>` : ''}</div>
    <span class="enter">${icon('enter')}</span></div>`;
}

function renderPalette() {
  const q = (pal.input?.value || '').trim();
  const body = $('#palBody');
  const groups = [];
  pal.entries = [];
  pal.sugg = [];
  const fromItem = (it, terms, d) => ({
    href: itemHref(it, it.kind === 'html' ? q : ''),
    color: colorOf(it),
    icon: iconOf(it),
    title: highlight(it.title, terms) + (it.kind === 'bom' ? ` ${icon('lock', 'lock')}` : '') + (it.status === 'soon' ? ' <span class="pill">Sắp có</span>' : ''),
    meta: `${typeBadge(it.type)}<span>${itemMeta(it)}</span>`,
    snip: d && terms.length ? highlight(engine.snippet(d, terms), terms) : '',
  });

  if (!q) {
    const recent = store.get(K.recent, []).map((r) => ITEM[r.id]).filter(Boolean).slice(0, 5);
    if (recent.length) groups.push(['Gần đây', recent.map((it) => fromItem(it, []))]);
    groups.push(['Đi tới', CAT.sections.map((s) => ({
      href: secHref(s), color: SECTION_COLOR[s.id], icon: icon(s.icon), title: esc(s.title), meta: `<span>${esc(s.desc)}</span>`,
    }))]);
    $('#palSugg').innerHTML = `<div class="line"><span>Thử tìm</span>${['Kemp', 'bảo mật email', 'DLP', 'quiz', 'cấp độ ATTT', 'đàm phán'].map((s) => `<button data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div>`;
    $('#palStat').textContent = '';
  } else {
    const { results, terms } = engine.search(q, 40);
    pal.sugg = engine.suggest(q);
    const rel = engine.relatedTerms(q, results);
    $('#palSugg').innerHTML = [
      pal.sugg.length ? `<div class="line"><span>Gợi ý</span>${pal.sugg.map((s) => `<button data-s="${esc(s)}">${highlight(s, terms)}</button>`).join('')}</div>` : '',
      rel.length ? `<div class="line"><span>Từ khóa liên quan</span>${rel.map((s) => `<button class="syn" data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : '',
    ].join('');
    const vendors = engine.matchVendors(q);
    if (vendors.length) groups.push(['Hãng', vendors.map((v) => ({
      href: vendorHref(v), color: vendorColor(v), icon: `<b style="font-size:13px">${esc(initials(v.name))}</b>`,
      title: highlight(v.name, terms), meta: `<span>${v.solutions.map(esc).join(' · ')}</span>`,
    }))]);
    const tools = results.filter((r) => r.item.kind === 'bom' || r.item.app);
    const docs = results.filter((r) => !(r.item.kind === 'bom' || r.item.app));
    const tg = tools.length && ['Công cụ', tools.map((r) => fromItem(r.item, terms))];
    const dg = docs.length && ['Tài liệu & khóa học', docs.map((r) => fromItem(r.item, terms, r.doc))];
    // Nhóm có kết quả tốt nhất lên trước.
    const main = ((tools[0]?.score || 0) >= (docs[0]?.score || 0) ? [tg, dg] : [dg, tg]).filter(Boolean);
    const data = dataGroups(q, terms);
    // Khớp đúng mã / tên trong dữ liệu -> đưa nhóm dữ liệu lên trên.
    const dataFirst = data.length && data[0].best >= 20;
    groups.push(...(dataFirst ? [...data.map((d) => d.group), ...main] : [...main, ...data.map((d) => d.group)]));
    const rows = data.reduce((n, d) => n + d.total, 0);
    const hints = [];
    if (dataIx.building) hints.push('đang đọc dữ liệu…');
    const read = dataIx.counts().map((c) => `${c.item.short || c.item.title.replace(/^Tổng hợp /, '')} ${c.rows}`);
    if (read.length) hints.push(`đã đọc: ${read.join(', ')} dòng`);
    for (const [id, msg] of dataIx.errors) hints.push(`⚠ không đọc được file ${ITEM[id]?.title || id}: ${msg}`);
    if (!isBomUnlocked() && CAT.items.some((i) => i.kind === 'bom' && i.src)) hints.push('mở khóa BOM để tìm cả trong BOM');
    $('#palStat').textContent = `${results.length} mục · ${rows} dòng dữ liệu${hints.length ? ' · ' + hints.join(' · ') : ''}`;
  }

  let i = 0;
  body.innerHTML = groups.length ? groups.map(([g, list]) => `<div class="pal-group"><span>${g}</span><span>${list.length}</span></div>${list.map((en) => {
    pal.entries.push(en);
    return palItem(en, i++);
  }).join('')}`).join('') : `<div class="pal-empty">${icon('search')}<div>Không tìm thấy kết quả cho “${esc(q)}”.</div><div class="muted" style="font-size:13px;margin-top:4px">Thử từ khóa ngắn hơn hoặc chọn một gợi ý ở trên.</div></div>`;
  if (pal.sel >= pal.entries.length) pal.sel = 0;
}

boot();

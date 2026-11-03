#!/usr/bin/env node
// Kiểm thử nhanh một PM Hub bằng Playwright (Chromium headless) và chụp ảnh màn hình.
//
//   node verify_hub.cjs --url http://localhost:8765/ --user Admin --pass '<mật khẩu>' --out ./shots \
//        [--tools-src <thư mục chứa các repo tool đã clone>] [--xlsx <file Excel thử cho tool>] [--tool dealreg]
//
// Kiểm tra: login sai/đúng, trang chủ, Sale guide, trang hãng, mở khóa BOM, ô tìm kiếm gõ trực tiếp,
// và (nếu có --tools-src) nạp file vào tool -> F5 -> dữ liệu còn. In "FAIL ..." nếu có bước hỏng.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const URL0 = arg('url', 'http://localhost:8765/');
const USER = arg('user'), PASS = arg('pass');
const OUT = arg('out', './shots');
const SRC = arg('tools-src');
const XLSX = arg('xlsx');
const TOOL = arg('tool', 'dealreg');
const REPO = { dealreg: 'Tools-Dealreg', po: 'Tool_tonghop_PO', crm: 'Tool_CRM_v2', kpi: 'HCNS-KPI' };
if (!USER || !PASS) { console.error('Thiếu --user / --pass'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) failed++; };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  if (SRC) {
    // Cho các tool chạy cùng origin với Hub (giống production) bằng cách phục vụ bản clone cục bộ.
    await ctx.route(/\/data\/catalog\.json/, async (r) => {
      const res = await r.fetch(); const j = await res.json();
      for (const it of j.items) if (it.app && REPO[it.id]) it.src = `/_t/${REPO[it.id]}/`;
      r.fulfill({ response: res, json: j });
    });
    await ctx.route(/\/_t\//, (r) => {
      const repo = new URL(r.request().url()).pathname.split('/_t/')[1].split('/')[0];
      r.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(SRC, repo, 'index.html')) });
    });
  }
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  const shot = (n) => p.screenshot({ path: path.join(OUT, n + '.png') });
  const go = async (h, wait = 600) => { await p.evaluate((x) => { location.hash = x; }, h); await p.waitForTimeout(wait); };

  await p.goto(URL0);
  await p.waitForSelector('#login:not([hidden])');
  await p.waitForTimeout(600);
  await shot('01-login');
  await p.fill('#lgUser', USER); await p.fill('#lgPass', 'sai-mat-khau');
  await p.click('#loginForm button[type=submit]'); await p.waitForTimeout(1500);
  check(/không đúng/i.test(await p.textContent('#loginErr')), 'Sai mật khẩu bị từ chối');
  await p.fill('#lgPass', PASS); await p.click('#loginForm button[type=submit]');
  await p.waitForSelector('#app:not([hidden])', { timeout: 10000 });
  check(true, 'Đăng nhập đúng vào được Hub');
  await shot('02-home');

  await go('#/s/sale-guide'); await shot('03-sale-guide');
  check(await p.$$eval('.vendor-card', (x) => x.length) > 0, 'Sale guide có thẻ hãng');
  const vendor = await p.$eval('.vendor-card', (a) => a.getAttribute('href'));
  await go(vendor); await shot('04-vendor');
  check(await p.$$eval('.sol-sec', (x) => x.length) > 0 && await p.$$eval('.doc-card', (x) => x.length) > 0, 'Trang hãng có khối dòng giải pháp + thẻ tài liệu');

  await p.click('#topSearch'); await p.keyboard.type('bom'); await p.waitForTimeout(800);
  check(await p.$$eval('.pal-item', (x) => x.length) > 0, 'Ô tìm kiếm gõ trực tiếp trả kết quả');
  await shot('05-search');
  await p.keyboard.press('Escape');

  const bom = await p.evaluate(async () => (await (await fetch('data/catalog.json')).json()).items.find((i) => i.kind === 'bom' && i.src)?.id);
  if (bom) {
    await go('#/v/' + bom);
    await p.fill('#ulUser', USER); await p.fill('#ulPass', PASS); await p.click('#unlockForm button[type=submit]');
    await p.waitForTimeout(3000);
    check(p.frames().some((f) => f.url().startsWith('blob:')), `Mở khóa & giải mã ${bom}`);
    await shot('06-bom');
  }

  if (SRC && XLSX) {
    await go('#/v/' + TOOL, 2000);
    const fr = () => p.frames().find((f) => f.url().includes('/_t/' + REPO[TOOL]));
    const input = TOOL === 'dealreg' ? '#file-input' : '#fileInput';
    await fr().setInputFiles(input, XLSX); await p.waitForTimeout(2000);
    check(!(await p.$eval('#actSaved', (e) => e.hidden)), 'Nạp file -> hiện "Đã lưu N file"');
    await p.reload(); await p.waitForSelector('#app:not([hidden])'); await p.waitForTimeout(3500);
    check(await fr().evaluate((n) => document.body.innerText.includes(n), path.basename(XLSX)), 'F5 -> tool tự nạp lại file');
    await shot('07-tool-restored');
  }

  check(!errs.length, 'Không có lỗi JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
  console.log(failed ? `\n${failed} bước lỗi` : '\nTất cả bước đều đạt');
  process.exit(failed ? 1 : 0);
})();

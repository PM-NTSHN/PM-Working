#!/usr/bin/env node
// Gắn ?v=<phiên bản> vào CSS/JS trong bản deploy để trình duyệt luôn tải code mới sau mỗi lần cập nhật.
//   node tools/stamp.mjs <thư mục site> <phiên bản>
import fs from 'node:fs';
import path from 'node:path';

const [dir, ver] = process.argv.slice(2);
if (!dir || !ver) {
  console.error('Cách dùng: node tools/stamp.mjs <thư mục site> <phiên bản>');
  process.exit(1);
}
const stamp = (file, re) => {
  const p = path.join(dir, file);
  const before = fs.readFileSync(p, 'utf8');
  const after = before.replace(re, (m, a, b) => `${a}?v=${ver}${b}`);
  fs.writeFileSync(p, after);
};
stamp('index.html', /((?:href|src)="assets\/[^"?]+\.(?:css|js))(")/g);
for (const f of fs.readdirSync(path.join(dir, 'assets/js'))) {
  if (f.endsWith('.js')) stamp(`assets/js/${f}`, /(from '\.\/[^'?]+\.js)(')/g);
}
console.log(`Đã gắn phiên bản ${ver}`);

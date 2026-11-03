#!/usr/bin/env node
// Mã hóa tool BOM để đưa lên PM Hub.
//
//   PM_HUB_USER=Admin PM_HUB_PASSWORD='...' node tools/encrypt-bom.mjs <file-nguon.html> <ten-file-dich>
//     -> ghi content/bom/<ten-file-dich>.bin (khai báo item trong config/hub.json trỏ tới file này)
//
//   PM_HUB_USER=... PM_HUB_PASSWORD=... node tools/encrypt-bom.mjs --init
//     -> tạo mới data/auth.json (đổi mật khẩu). Sau đó PHẢI mã hóa lại toàn bộ file BOM.
//
// Không commit file nguồn chưa mã hóa. Có thể dùng tools/bom-encryptor.html thay cho script này.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuth, verify, encryptFile } from '../assets/js/crypto.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUTH = path.join(ROOT, 'data/auth.json');
const user = process.env.PM_HUB_USER;
const pass = process.env.PM_HUB_PASSWORD;
if (!user || !pass) {
  console.error('Thiếu biến môi trường PM_HUB_USER / PM_HUB_PASSWORD');
  process.exit(1);
}

const args = process.argv.slice(2);
if (args[0] === '--init') {
  const { auth } = await createAuth(user, pass);
  fs.writeFileSync(AUTH, JSON.stringify(auth, null, 2) + '\n');
  console.log('Đã tạo', path.relative(ROOT, AUTH), '- nhớ mã hóa lại các file BOM.');
  process.exit(0);
}

const [src, name] = args;
if (!src || !name) {
  console.error('Cách dùng: node tools/encrypt-bom.mjs <file-nguon.html> <ten-file-dich>');
  process.exit(1);
}
const auth = JSON.parse(fs.readFileSync(AUTH, 'utf8'));
const key = await verify(user, pass, auth);
if (!key) {
  console.error('Sai tài khoản/mật khẩu so với data/auth.json');
  process.exit(1);
}
const out = path.join(ROOT, 'content/bom', `${name.replace(/\.bin$/, '')}.bin`);
const bytes = await encryptFile(key, fs.readFileSync(src, 'utf8'));
fs.writeFileSync(out, bytes);
console.log(`Đã mã hóa ${path.basename(src)} -> ${path.relative(ROOT, out)} (${(bytes.length / 1024).toFixed(0)} KB)`);

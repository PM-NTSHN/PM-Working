// Mã hóa dùng chung cho trình duyệt và Node (WebCrypto).
// Khóa = PBKDF2-SHA256(username viết thường + "\0" + password, salt chung, ITER) -> AES-256-GCM.
// File .bin = "PMH1" | iv(12) | AES-GCM(gzip(nội dung)).

const enc = new TextEncoder();
const dec = new TextDecoder();
const MAGIC = enc.encode('PMH1');
export const CHECK_TEXT = 'PM-HUB-OK';

export const b64 = {
  to: (buf) => {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  },
  from: (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0)),
};

const credential = (user, pass) => enc.encode(`${user.trim().toLowerCase()}\u0000${pass}`);

export async function deriveKey(user, pass, auth) {
  const base = await crypto.subtle.importKey('raw', credential(user, pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: b64.from(auth.salt), iterations: auth.iter },
    base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export const exportKey = async (key) => b64.to(await crypto.subtle.exportKey('raw', key));
export const importKey = (raw) =>
  crypto.subtle.importKey('raw', b64.from(raw), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);

async function aesEncrypt(key, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv); out.set(ct, 12);
  return out;
}
const aesDecrypt = async (key, bytes) =>
  new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) }, key, bytes.subarray(12)));

async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

/** Tạo auth.json mới (salt ngẫu nhiên + chuỗi kiểm tra). */
export async function createAuth(user, pass, iter = 250000) {
  const auth = { v: 1, kdf: 'PBKDF2-SHA256', iter, salt: b64.to(crypto.getRandomValues(new Uint8Array(16))) };
  const key = await deriveKey(user, pass, auth);
  auth.check = b64.to(await aesEncrypt(key, enc.encode(CHECK_TEXT)));
  return { auth, key };
}

/** Trả về khóa nếu đúng tài khoản, ngược lại null. */
export async function verify(user, pass, auth) {
  const key = await deriveKey(user, pass, auth);
  return (await checkKey(key, auth)) ? key : null;
}

export async function checkKey(key, auth) {
  try {
    return dec.decode(await aesDecrypt(key, b64.from(auth.check))) === CHECK_TEXT;
  } catch { return false; }
}

export async function encryptFile(key, text) {
  const gz = await pipe(enc.encode(text), new CompressionStream('gzip'));
  const body = await aesEncrypt(key, gz);
  const out = new Uint8Array(4 + body.length);
  out.set(MAGIC); out.set(body, 4);
  return out;
}

export async function decryptFile(key, buf) {
  const bytes = new Uint8Array(buf);
  if (dec.decode(bytes.subarray(0, 4)) !== 'PMH1') throw new Error('File BOM không đúng định dạng');
  const gz = await aesDecrypt(key, bytes.subarray(4));
  return dec.decode(await pipe(gz, new DecompressionStream('gzip')));
}

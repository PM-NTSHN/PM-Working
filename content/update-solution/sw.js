// Service worker của Thư viện giải pháp Cyber Security: cho phép cài như ứng dụng và mở khi không có mạng.
// Trang chính: ưu tiên bản mới trên mạng, mất mạng thì dùng bản đã lưu.
const CACHE = 'cslib-v1';
const SHELL = ['./thu-vien-giai-phap-cyber-security.html', './manifest.webmanifest', './app/icon-192.png', './app/icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./thu-vien-giai-phap-cyber-security.html')))
  );
});

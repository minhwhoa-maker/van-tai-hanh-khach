// Service worker RIÊNG cho dat-ve.html (trang đặt vé công khai cho khách) — KHÔNG dùng chung
// sw.js của 5 trang crew nội bộ, dù cùng pattern network-first + cache fallback. Lý do tách riêng:
// sw.js của crew fallback offline về './login.html' (đúng cho app nội bộ, sai hoàn toàn cho khách
// công khai — khách vãng lai không có tài khoản, không nên bị đưa tới màn đăng nhập crew). Xem
// SPEC "Đặt vé công khai cho khách" trong CLAUDE.md.
// v2 (2026-09-18, đợt 15): đổi icon riêng (icon-*-booking.png, không dùng chung file với crew nữa
// — xem lý do ở dat-ve.html) — bump CACHE_NAME để dọn sạch entry icon cũ trong cache trình duyệt.
// v3 (2026-09-20, Multi-tenant Giai đoạn 5): dat-ve.html đổi (đọc `nx`, gọi API kèm nx, <link
// rel="manifest"> giờ chèn động bằng JS thay vì tĩnh) — bump để dọn cache cũ, tránh khách mở lại
// app đã cài thấy bản dat-ve.html không đọc `nx` (sẽ luôn báo "Link không hợp lệ").
// v4 (2026-09-20, tách origin riêng eakar-booking.vercel.app): đăng ký lại với scope '/' (trước là
// '/dat-ve.html', xem dat-ve.html) — bump để dọn cache/registration cũ, tránh SW đời trước (scope
// hẹp) đứng chắn SW mới ở cùng origin.
const CACHE_NAME = 'eakar-dat-ve-v4';
const STATIC_ASSETS = [
    './dat-ve.html',
    './shared.js',
    './style.css',
    './manifest-dat-ve.json',
    './icons/icon-192-booking.png',
    './icons/icon-512-booking.png'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// Network-first cho MỌI request cùng-origin (cùng lý do đã ghi trong sw.js — asset không phải
// navigate cũng phải luôn ưu tiên lấy bản mới nhất, tránh kẹt cache cũ qua các lần deploy). Offline
// → rơi về cache đã lưu, navigate thất bại thì fallback về CHÍNH `dat-ve.html` (không phải trang
// đăng nhập crew) — khách mở lại app đặt vé lúc mất mạng vẫn thấy đúng trang, dù dữ liệu lịch/sơ đồ
// giường bên trong có thể cũ (API `fetch()` bên trong trang tự báo lỗi riêng, không phải việc của SW).
self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;

    const url = new URL(e.request.url);
    if (url.origin !== self.location.origin) return;

    e.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
            const response = await fetch(e.request);
            if (response.ok) await cache.put(e.request, response.clone());
            return response;
        } catch {
            return (await cache.match(e.request)) || (e.request.mode === 'navigate' ? cache.match('./dat-ve.html') : undefined);
        }
    })());
});

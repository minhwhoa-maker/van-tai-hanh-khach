// middleware.js (root) — Vercel Routing Middleware, chạy TRƯỚC filesystem/cache trên MỌI request,
// dùng để cách ly hẳn origin eakar-booking.vercel.app (PWA đặt vé công khai) khỏi
// van-tai-hanh-khach.vercel.app (app crew nội bộ) dù cả 2 vẫn CÙNG 1 project Vercel/CÙNG 1
// deployment (2026-09-20). Xem SPEC "PWA riêng cho dat-ve.html" trong CLAUDE.md.
//
// LÝ DO DÙNG MIDDLEWARE THAY VÌ `rewrites`/`redirects` THƯỜNG TRONG vercel.json: đã thử `rewrites`
// trước — KHÔNG hoạt động cho việc chặn/404 các trang crew (hang.html, login.html...) trên host
// booking, vì `rewrites` chỉ được xét SAU KHI Vercel đã kiểm tra filesystem — 1 path khớp đúng 1
// file tĩnh có sẵn trong deployment (vd hang.html tồn tại thật) được serve THẲNG, bỏ qua toàn bộ
// `rewrites`, bất kể thứ tự khai báo trong mảng. Đã verify thật bằng curl (2026-09-20): host booking
// vẫn trả 200 cho /hang.html dù có rule catch-all 404 trong `rewrites`. Middleware chạy TRƯỚC bước
// filesystem đó nên chặn được đúng ý — xem docs.
//
// `redirects` (khác `rewrites`) trong vercel.json ĐÃ verify hoạt động đúng cho việc redirect
// /dat-ve.html + /api/manifest-dat-ve từ host crew sang host booking (redirects được xét TRƯỚC
// filesystem) — giữ nguyên ở vercel.json, KHÔNG chuyển phần đó vào đây.
import { next, rewrite } from '@vercel/functions'

const HOST_BOOKING = 'eakar-booking.vercel.app'

// Đường dẫn DUY NHẤT được phục vụ trên host booking — dat-ve.html + mọi asset/API nó cần (đọc trực
// tiếp từ dat-ve.html/sw-dat-ve.js để liệt kê đủ, xem CLAUDE.md mục "PWA riêng cho dat-ve.html").
const DUONG_DAN_CHO_PHEP_BOOKING = new Set([
    '/dat-ve.html',
    '/sw-dat-ve.js',
    '/manifest-dat-ve.json', // file tĩnh cũ, giữ tới khi test xong trên điện thoại thật — xem CLAUDE.md
    '/style.css',
    '/shared.js',
    '/point-match.js', // dùng cho boDau() trong picker Tỉnh->Xã/Huyện (2026-09-22, thay diem_khach)
    '/data/tinh-xa-huyen.json', // dữ liệu xã/huyện cũ/mới cho picker cùng tính năng trên
    '/icons/icon-192-booking.png',
    '/icons/icon-512-booking.png',
    '/api/manifest-dat-ve',
    '/api/cong-khai-dat-ve',
    '/api/cong-khai-diem-khach',
    '/api/cong-khai-gui-otp',
    '/api/cong-khai-lich-chay',
    '/api/cong-khai-so-do',
    '/api/cong-khai-xac-thuc-otp',
])

export default function middleware(request) {
    const url = new URL(request.url)
    const host = request.headers.get('host') || ''
    if (host !== HOST_BOOKING) return next()

    // REWRITE (không phải redirect) — giữ nguyên "/" trên thanh địa chỉ, khớp `start_url: "/?nx=..."`
    // của api/manifest-dat-ve.js (redirect sẽ đổi URL hiển thị thành /dat-ve.html?nx=..., lệch
    // start_url đã khai trong manifest).
    if (url.pathname === '/') {
        return rewrite(new URL(`/dat-ve.html${url.search}`, url))
    }
    if (DUONG_DAN_CHO_PHEP_BOOKING.has(url.pathname)) return next()

    return new Response('Not found', { status: 404 })
}

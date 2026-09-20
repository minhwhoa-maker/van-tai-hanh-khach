// api/manifest-dat-ve.js?nx=<slug> — manifest PWA ĐỘNG theo từng nhà xe (2026-09-20, Multi-tenant
// Giai đoạn 5). File tĩnh `manifest-dat-ve.json` KHÔNG thể mang `nx` — mọi nhà xe sẽ cài ra cùng 1
// app (cùng `id`, `start_url` không có `nx`) và mở lên gặp lỗi "Link đặt vé không hợp lệ" ở
// dat-ve.html. `id`/`start_url` ở đây LUÔN gắn `?nx=<slug>` để mỗi nhà xe là 1 app cài đặt riêng
// biệt trên máy khách (tránh lặp lại bug "already installed" đã gặp ở đợt 15 khi 2 manifest dùng
// chung identity) — xem SPEC "Multi-tenant Giai đoạn 5" trong CLAUDE.md.
//
// dat-ve.html KHÔNG còn `<link rel="manifest">` tĩnh trong <head> — JS tự tạo <link> trỏ tới route
// này SAU KHI đọc `nx` và resolve nhà xe thành công. Có `nx` mà sai/tạm_dừng → route trả lỗi
// (KHÔNG trả manifest) — màn lỗi ở dat-ve.html không được phép cài thành app.
//
// `scope`/`start_url`/`id` đổi sang gốc "/" (2026-09-20, tách origin riêng eakar-booking.vercel.app)
// — origin đó giờ CHỈ phục vụ dat-ve.html (vercel.json rewrite "/" -> "/dat-ve.html" trên host này),
// nên scope "/" an toàn, không còn đụng độ với app crew (khác origin hoàn toàn, không còn chung
// van-tai-hanh-khach.vercel.app nữa — lý do gốc của scope hẹp "/dat-ve.html" trước đây, xem CLAUDE.md
// mục "PWA riêng cho dat-ve.html"). Đổi origin sau này (nếu có) bắt khách cài lại app.
import { createClient } from '@supabase/supabase-js'
import { docNx, layNhaXe, guiLoiNhaXe } from './_lib/nha-xe.js'

export default async function handler(req, res) {
    if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }

    const sbAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    let nhaXe
    try {
        nhaXe = await layNhaXe(sbAdmin, docNx(req))
    } catch (err) {
        if (guiLoiNhaXe(res, err)) return
        res.status(500).json({ error: err.message }); return
    }

    const nx = nhaXe.slug
    const ten = nhaXe.ten || 'Booking'

    res.setHeader('Content-Type', 'application/manifest+json')
    res.status(200).json({
        id: `/?nx=${nx}`,
        name: ten,
        short_name: ten,
        description: `Đặt vé xe khách — ${ten}`,
        start_url: `/?nx=${nx}`,
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f0f2f5',
        theme_color: '#1565c0',
        lang: 'vi',
        // Đường dẫn TUYỆT ĐỐI (bắt đầu "/") — bắt buộc, vì manifest này được serve từ
        // /api/manifest-dat-ve, KHÔNG phải từ gốc trang. Trình duyệt resolve icon path tương đối
        // theo URL CỦA CHÍNH MANIFEST (không phải theo dat-ve.html) — "icons/..." (thiếu "/" đầu)
        // sẽ ra "/api/icons/..." (404 thật, đã verify bằng curl), khiến Chrome coi PWA "cannot be
        // installed" và fallback icon xám mặc định. Lỗi thật gặp trên điện thoại thật (2026-09-20).
        icons: [
            { src: '/icons/icon-192-booking.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-192-booking.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
            { src: '/icons/icon-512-booking.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512-booking.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
    })
}

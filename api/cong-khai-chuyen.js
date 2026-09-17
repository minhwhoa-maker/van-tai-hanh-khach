// api/cong-khai-chuyen.js — API công khai (không cần auth) cho trang đặt vé khách dat-ve.html.
// Trả DANH SÁCH TẤT CẢ chuyến 'dang_chay' (sắp theo khoi_hanh TĂNG DẦN — gần nhất lên đầu), để
// khách CHỌN NGÀY ĐI trước khi chọn giường (2026-09-17, đổi từ bản đầu chỉ trả 1 chuyến gần nhất —
// xem bullet "Bước 0 — Chọn ngày đi" trong CLAUDE.md). Khách chỉ đặt được vào chuyến crew đã tự
// tạo sẵn, không tạo chuyến mới từ phía khách. Dùng SUPABASE_SERVICE_KEY (không đụng RLS anon) để
// tránh phải mở policy anon cho bảng `chuyen` — chỉ trả đúng field cần, KHÔNG trả `tao_boi`/
// `ghi_chu` (nội bộ crew, không phải thứ khách cần thấy).
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
    if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }

    const sbAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    const { data, error } = await sbAdmin
        .from('chuyen')
        .select('id, chieu, khoi_hanh')
        .eq('trang_thai', 'dang_chay')
        .order('khoi_hanh', { ascending: true })

    if (error) { res.status(500).json({ error: error.message }); return }
    res.status(200).json({ chuyenList: data || [] })
}

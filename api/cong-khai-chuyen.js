// api/cong-khai-chuyen.js — API công khai (không cần auth) cho trang đặt vé khách dat-ve.html.
// Trả về chuyến 'dang_chay' GẦN NHẤT — khách chỉ đặt được vào chuyến crew đã tự tạo sẵn, không
// tạo chuyến mới từ phía khách (xem SPEC "dat-ve.html" trong CLAUDE.md). Dùng SUPABASE_SERVICE_KEY
// (không đụng RLS anon) để tránh phải mở policy anon cho bảng `chuyen` — chỉ trả đúng field cần,
// KHÔNG trả `tao_boi`/`ghi_chu` (nội bộ crew, không phải thứ khách cần thấy).
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
    if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }

    const sbAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    const { data, error } = await sbAdmin
        .from('chuyen')
        .select('id, chieu, khoi_hanh')
        .eq('trang_thai', 'dang_chay')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (error) { res.status(500).json({ error: error.message }); return }
    if (!data) { res.status(200).json({ chuyen: null }); return }
    res.status(200).json({ chuyen: data })
}

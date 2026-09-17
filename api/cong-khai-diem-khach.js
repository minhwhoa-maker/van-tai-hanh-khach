// api/cong-khai-diem-khach.js — danh sách điểm đón/trả + tỉnh (để hiện "Tên điểm — Tên tỉnh" và
// sắp theo thứ tự tuyến, giống renderDiemKhachOptions ở khach.html) công khai cho 2 dropdown điểm
// lên/xuống ở dat-ve.html. KHÔNG có đường tạo điểm mới từ phía khách (chỉ crew được tạo điểm mới,
// qua khach.html như cũ) — xem SPEC "dat-ve.html" trong CLAUDE.md.
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
    if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }

    const sbAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    const [diemRes, tinhRes] = await Promise.all([
        sbAdmin.from('diem_khach').select('id, ten, tinh_ma, thu_tu'),
        // gia_moc — mốc giá theo tỉnh (đồng, nullable), dat-ve.html dùng tính giá vé =
        // |mốc(tỉnh đến) − mốc(tỉnh đi)| ở Bước 0 (client, chỉ để hiển thị — giá thật do server
        // tự tính lại ở api/cong-khai-dat-ve.js, xem CLAUDE.md).
        sbAdmin.from('tinh_tuyen').select('ma, ten, thu_tu, gia_moc').order('thu_tu')
    ])
    if (diemRes.error) { res.status(500).json({ error: diemRes.error.message }); return }
    if (tinhRes.error) { res.status(500).json({ error: tinhRes.error.message }); return }
    res.status(200).json({ diemKhach: diemRes.data || [], tinh: tinhRes.data || [] })
}

// api/cong-khai-diem-khach.js?nx=<slug> — danh sách điểm đón/trả + tỉnh (để hiện "Tên điểm — Tên
// tỉnh" và sắp theo thứ tự tuyến, giống renderDiemKhachOptions ở khach.html) công khai cho 2
// dropdown điểm lên/xuống ở dat-ve.html. KHÔNG có đường tạo điểm mới từ phía khách (chỉ crew được
// tạo điểm mới, qua khach.html như cũ) — xem SPEC "dat-ve.html" trong CLAUDE.md.
//
// Multi-tenant Giai đoạn 5 (2026-09-20) — resolve nhà xe từ `?nx=<slug>` (BLOCKER hardcode 'eakar'
// đã gỡ). Đọc `tuyen_tinh` join `tinh` (KHÔNG phải `tinh_tuyen` — bảng cũ, đã ngừng được ghi từ
// Giai đoạn 4).
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

    const [diemRes, tinhRes] = await Promise.all([
        sbAdmin.from('diem_khach').select('id, ten, tinh_ma, thu_tu').eq('nha_xe_id', nhaXe.id),
        // gia_moc — mốc giá theo tỉnh (đồng, nullable), dat-ve.html dùng tính giá vé =
        // |mốc(tỉnh đến) − mốc(tỉnh đi)| ở Bước 0 (client, chỉ để hiển thị — giá thật do server
        // tự tính lại ở api/cong-khai-dat-ve.js, xem CLAUDE.md).
        sbAdmin.from('tuyen_tinh').select('tinh_ma, thu_tu, gia_moc, tinh:tinh_ma(ma, ten)').eq('nha_xe_id', nhaXe.id).order('thu_tu')
    ])
    if (diemRes.error) { res.status(500).json({ error: diemRes.error.message }); return }
    if (tinhRes.error) { res.status(500).json({ error: tinhRes.error.message }); return }
    const tinh = (tinhRes.data || []).map(r => ({ ma: r.tinh_ma, ten: r.tinh.ten, thu_tu: r.thu_tu, gia_moc: r.gia_moc }))
    res.status(200).json({ diemKhach: diemRes.data || [], tinh })
}

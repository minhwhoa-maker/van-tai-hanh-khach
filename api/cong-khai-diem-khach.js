// api/cong-khai-diem-khach.js — danh sách điểm đón/trả + tỉnh (để hiện "Tên điểm — Tên tỉnh" và
// sắp theo thứ tự tuyến, giống renderDiemKhachOptions ở khach.html) công khai cho 2 dropdown điểm
// lên/xuống ở dat-ve.html. KHÔNG có đường tạo điểm mới từ phía khách (chỉ crew được tạo điểm mới,
// qua khach.html như cũ) — xem SPEC "dat-ve.html" trong CLAUDE.md.
//
// Multi-tenant (2026-09-19) — TẠM THỜI hardcode nhà xe "eakar" (LAY_NHA_XE_ID_MAC_DINH) vì Giai
// đoạn 5 (routing `?nx=slug`) CHƯA làm — dat-ve.html hiện chỉ phục vụ đúng 1 nhà xe. TRƯỚC đợt sửa
// này route KHÔNG lọc `nha_xe_id` chút nào (đọc TOÀN BỘ diem_khach mọi nhà xe) — lỗ hổng thật phát
// hiện lúc audit, sửa ngay dù Giai đoạn 5 đầy đủ chưa tới. Đổi sang `tuyen_tinh` join `tinh` thay
// `tinh_tuyen` (bảng cũ) — SÓT LẠI TỪ GIAI ĐOẠN 4: khach.html đã đổi ghi giá sang `tuyen_tinh.
// gia_moc` nhưng route này quên đổi theo, khiến giá khách thấy BỊ ĐỨNG YÊN (đọc bảng đã ngừng cập
// nhật) — đây là bug thật đang chạy trên production, không phải lý thuyết.
import { createClient } from '@supabase/supabase-js'

const SLUG_NHA_XE_MAC_DINH = 'eakar'

async function layNhaXeIdMacDinh(sbAdmin) {
    const { data, error } = await sbAdmin.from('nha_xe').select('id').eq('slug', SLUG_NHA_XE_MAC_DINH).single()
    if (error) throw error
    return data.id
}

export default async function handler(req, res) {
    if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }

    const sbAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    let nhaXeId
    try {
        nhaXeId = await layNhaXeIdMacDinh(sbAdmin)
    } catch (err) {
        res.status(500).json({ error: 'Lỗi xác định nhà xe: ' + err.message }); return
    }

    const [diemRes, tinhRes] = await Promise.all([
        sbAdmin.from('diem_khach').select('id, ten, tinh_ma, thu_tu').eq('nha_xe_id', nhaXeId),
        // gia_moc — mốc giá theo tỉnh (đồng, nullable), dat-ve.html dùng tính giá vé =
        // |mốc(tỉnh đến) − mốc(tỉnh đi)| ở Bước 0 (client, chỉ để hiển thị — giá thật do server
        // tự tính lại ở api/cong-khai-dat-ve.js, xem CLAUDE.md).
        sbAdmin.from('tuyen_tinh').select('tinh_ma, thu_tu, gia_moc, tinh:tinh_ma(ma, ten)').eq('nha_xe_id', nhaXeId).order('thu_tu')
    ])
    if (diemRes.error) { res.status(500).json({ error: diemRes.error.message }); return }
    if (tinhRes.error) { res.status(500).json({ error: tinhRes.error.message }); return }
    const tinh = (tinhRes.data || []).map(r => ({ ma: r.tinh_ma, ten: r.tinh.ten, thu_tu: r.thu_tu, gia_moc: r.gia_moc }))
    res.status(200).json({ diemKhach: diemRes.data || [], tinh })
}

// api/cong-khai-so-do.js?chuyen_id=... — sơ đồ giường công khai cho dat-ve.html. JOIN giuong +
// ve (chỉ vé 'da_dat' của ĐÚNG chuyen_id) rồi trả {id, tang, hang, vi_tri, ma, hoat_dong, trong}.
// TUYỆT ĐỐI không trả tên/SĐT khách đã đặt ghế khác — công khai chỉ cần biết trống hay không, xem
// SPEC "dat-ve.html" trong CLAUDE.md.
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
    if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
    const chuyenId = req.query.chuyen_id
    if (!chuyenId) { res.status(400).json({ error: 'Thiếu chuyen_id' }); return }

    const sbAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

    const [giuongRes, veRes] = await Promise.all([
        sbAdmin.from('giuong').select('id, tang, hang, vi_tri, ma, hoat_dong').order('tang').order('hang').order('vi_tri'),
        sbAdmin.from('ve').select('giuong_id').eq('chuyen_id', chuyenId).eq('trang_thai', 'da_dat')
    ])
    if (giuongRes.error) { res.status(500).json({ error: giuongRes.error.message }); return }
    if (veRes.error) { res.status(500).json({ error: veRes.error.message }); return }

    const daDatSet = new Set(veRes.data.map(v => v.giuong_id))
    const soDo = giuongRes.data.map(g => ({
        id: g.id, tang: g.tang, hang: g.hang, vi_tri: g.vi_tri, ma: g.ma,
        hoat_dong: g.hoat_dong,
        trong: g.hoat_dong && !daDatSet.has(g.id)
    }))
    res.status(200).json({ soDo })
}

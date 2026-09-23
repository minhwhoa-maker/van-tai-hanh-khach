// api/cong-khai-xem-ve.js (GET) — khách tra cứu lại vé đã đặt qua link `xem-ve.html?id=<ve.id>`,
// hỗ trợ nhiều `id` cùng lúc (khứ hồi gộp 2 chặng vào 1 link). Bảo mật dựa vào `ve.id` (UUID khó
// đoán) — đúng pattern app đang dùng cho ảnh Storage (`{kien.id}.jpg`), không thêm token/login
// riêng. Xem SPEC "Xem lại vé đã đặt" trong CLAUDE.md.
//
// KHÔNG bắt buộc `?nx=` — NGOẠI LỆ CÓ CHỦ ĐÍCH so với 4 route `cong-khai-*` khác (`layNhaXe` luôn
// là việc đầu tiên của mọi handler ở các route đó). Lý do: các route kia thao tác TRÊN TOÀN BỘ tài
// nguyên của 1 nhà xe (đặt vé mới, xem lịch chạy...) nên cần `nx` để biết phạm vi truy vấn; route
// này chỉ TRA CỨU ĐIỂM theo đúng `ve.id` — UUID đã tự xác định duy nhất 1 nhà xe rồi, không có gì
// mơ hồ cần `nx` để phân giải. Vẫn dùng SUPABASE_SERVICE_KEY (bypass RLS) như các route công khai
// khác — response tự lọc field, không trả gì ngoài phạm vi đã hiện sẵn ở màn xác nhận lúc đặt.
import { createClient } from '@supabase/supabase-js'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function handler(req, res) {
    if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
    res.setHeader('Cache-Control', 'no-store')

    // Vercel trả string đơn nếu chỉ 1 `?id=`, mảng nếu ≥2 — lỗi rất dễ quên case 1-phần-tử.
    const raw = req.query.id
    const idsGoc = raw == null ? [] : (Array.isArray(raw) ? raw : [raw])
    // Lọc UUID hợp lệ trước khi query — id sai định dạng (không phải lỗi query, chỉ là chuỗi rác)
    // coi như "không tìm thấy", không để lọt xuống DB gây lỗi cú pháp uuid.
    const idsHopLe = [...new Set(idsGoc.filter(id => typeof id === 'string' && UUID_REGEX.test(id)))]
    const khongTimThay = idsGoc.filter(id => !idsHopLe.includes(id))

    if (!idsGoc.length) { res.status(400).json({ error: 'Thiếu id vé' }); return }
    if (!idsHopLe.length) { res.status(200).json({ chang: [], khong_tim_thay: idsGoc }); return }

    const sbAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

    const { data: veRows, error: veErr } = await sbAdmin
        .from('ve')
        .select(`
            id, ma_ve, chuyen_id, giuong_id, ten_khach, sdt_khach, gia, trang_thai, hinh_thuc_thanh_toan,
            nha_xe_id, tinh_len_ma, tinh_xuong_ma,
            dia_diem_len_nhan, dia_diem_len_loai, dia_diem_xuong_nhan, dia_diem_xuong_loai,
            chuyen:chuyen_id ( id, khoi_hanh, chieu ),
            giuong:giuong_id ( ma ),
            diem_len:diem_len_id ( ten, tinh_ma ),
            diem_xuong:diem_xuong_id ( ten, tinh_ma )
        `)
        .in('id', idsHopLe)
    if (veErr) { res.status(500).json({ error: veErr.message }); return }

    const timThayIds = new Set(veRows.map(v => v.id))
    for (const id of idsHopLe) if (!timThayIds.has(id)) khongTimThay.push(id)

    if (!veRows.length) { res.status(200).json({ chang: [], khong_tim_thay: khongTimThay }); return }

    // Guard: mọi id phải cùng 1 nhà xe — URL bị chỉnh tay ghép id của 2 nhà xe khác nhau thì báo
    // lỗi rõ ràng thay vì âm thầm hiện lẫn data 2 nhà xe trên cùng 1 trang.
    const nhaXeIdSet = new Set(veRows.map(v => v.nha_xe_id))
    if (nhaXeIdSet.size > 1) { res.status(400).json({ error: 'Link không hợp lệ — các vé không thuộc cùng 1 nhà xe' }); return }
    const nhaXeId = veRows[0].nha_xe_id

    const { data: nhaXe, error: nhaXeErr } = await sbAdmin.from('nha_xe').select('ten').eq('id', nhaXeId).single()
    if (nhaXeErr) { res.status(500).json({ error: nhaXeErr.message }); return }

    // Tên tỉnh — `ve.tinh_len_ma`/`tinh_xuong_ma` KHÔNG có FK trực tiếp tới `tinh` (FK thật là
    // composite qua `tuyen_tinh`, xem CLAUDE.md mục "ve_tinh_len_xuong_ma") nên không embed được
    // qua PostgREST, phải query riêng theo danh sách mã đã gom.
    const maTinhCanTra = new Set()
    veRows.forEach(v => {
        if (v.tinh_len_ma) maTinhCanTra.add(v.tinh_len_ma)
        if (v.tinh_xuong_ma) maTinhCanTra.add(v.tinh_xuong_ma)
        if (v.diem_len?.tinh_ma) maTinhCanTra.add(v.diem_len.tinh_ma)
        if (v.diem_xuong?.tinh_ma) maTinhCanTra.add(v.diem_xuong.tinh_ma)
    })
    let tinhMap = new Map()
    if (maTinhCanTra.size) {
        const { data: tinhRows, error: tinhErr } = await sbAdmin.from('tinh').select('ma, ten').in('ma', [...maTinhCanTra])
        if (tinhErr) { res.status(500).json({ error: tinhErr.message }); return }
        tinhMap = new Map(tinhRows.map(t => [t.ma, t.ten]))
    }

    // Nhãn địa điểm — ƯU TIÊN dia_diem_*_nhan (vé mới, thay diem_khach, 2026-09-22), FALLBACK
    // diem_khach cho vé CŨ chưa có field mới (cùng logic `tenDiaDiem` ở khach.html).
    function nhanDiaDiem(nhan, tinhMa, diemFallback) {
        if (nhan) {
            const ten = tinhMap.get(tinhMa)
            return ten ? `${nhan} — ${ten}` : nhan
        }
        if (diemFallback) {
            const ten = tinhMap.get(diemFallback.tinh_ma)
            return ten ? `${diemFallback.ten} — ${ten}` : diemFallback.ten
        }
        return null
    }

    // Gom theo chuyen_id (1 chặng = 1 chuyến, có thể nhiều giường/vé nếu đặt nhóm) rồi sort theo
    // khoi_hanh TĂNG DẦN — không phụ thuộc thứ tự `id` trong URL, luôn hiện chiều đi trước về sau.
    const nhomTheoChuyen = new Map()
    veRows.forEach(v => {
        if (!nhomTheoChuyen.has(v.chuyen_id)) {
            // tinh_len_ten/tinh_xuong_ten: tóm tắt tuyến cấp CHẶNG cho tiêu đề, lấy từ VÉ ĐẦU TIÊN
            // gặp trong nhóm — thực tế mọi vé cùng chuyen_id luôn cùng tinh_len_ma/tinh_xuong_ma vì
            // đặt cùng lúc theo cùng 1 tuyến đã chọn ở Bước 0. Từng vé vẫn có `dia_diem_len`/
            // `dia_diem_xuong` riêng (đã kèm tên tỉnh) để hiện chi tiết hơn nếu khác nhau.
            nhomTheoChuyen.set(v.chuyen_id, {
                chuyen: v.chuyen,
                tinh_len_ten: tinhMap.get(v.tinh_len_ma) || null,
                tinh_xuong_ten: tinhMap.get(v.tinh_xuong_ma) || null,
                ve: []
            })
        }
        nhomTheoChuyen.get(v.chuyen_id).ve.push({
            id: v.id,
            ma_ve: v.ma_ve,
            ma_giuong: v.giuong?.ma || null,
            ten_khach: v.ten_khach,
            sdt_khach: v.sdt_khach,
            gia: v.gia,
            trang_thai: v.trang_thai,
            hinh_thuc_thanh_toan: v.hinh_thuc_thanh_toan,
            dia_diem_len: nhanDiaDiem(v.dia_diem_len_nhan, v.tinh_len_ma, v.diem_len),
            dia_diem_xuong: nhanDiaDiem(v.dia_diem_xuong_nhan, v.tinh_xuong_ma, v.diem_xuong)
        })
    })
    const chang = [...nhomTheoChuyen.values()]
        .sort((a, b) => new Date(a.chuyen.khoi_hanh) - new Date(b.chuyen.khoi_hanh))
        .map(nhom => ({
            chuyen_id: nhom.chuyen.id,
            khoi_hanh: nhom.chuyen.khoi_hanh,
            chieu: nhom.chuyen.chieu,
            tinh_len_ten: nhom.tinh_len_ten,
            tinh_xuong_ten: nhom.tinh_xuong_ten,
            ve: nhom.ve
        }))

    res.status(200).json({ nha_xe: { ten: nhaXe.ten }, chang, khong_tim_thay: khongTimThay })
}

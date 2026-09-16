// api/cong-khai-dat-ve.js (POST) — khách tự đặt vé qua dat-ve.html, không cần đăng nhập. Dùng
// SUPABASE_SERVICE_KEY (không đụng RLS anon) — xem SPEC "dat-ve.html" trong CLAUDE.md để biết vì
// sao không mở thẳng policy anon cho bảng `ve` (sẽ lộ tên/SĐT khách khác cho bất kỳ ai xem source).
//
// chuanHoaSdt/laSdtHopLe COPY từ api/doi-chieu-sdt.js — cố ý KHÔNG import chéo giữa 2 route
// serverless độc lập (mỗi route Vercel Function tự đứng riêng, import chéo giữa api/*.js không có
// lợi ích thực tế ở quy mô nhỏ này, chỉ thêm phụ thuộc ẩn khó theo dõi).
import { createClient } from '@supabase/supabase-js'

function chuanHoaSdt(s) {
    let d = (s || '').replace(/\D/g, '')
    if (d.startsWith('84')) {
        const rest = d.slice(2)
        d = rest.startsWith('0') ? rest : '0' + rest
    }
    return d
}

function laSdtHopLe(daChuanHoa) {
    return /^0(3|5|7|8|9)\d{8}$/.test(daChuanHoa)
}

export default async function handler(req, res) {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

    const { chuyen_id, giuong_id, ten, sdt, diem_len_id, diem_xuong_id, hinh_thuc_thanh_toan, gia } = req.body || {}

    if (!chuyen_id || !giuong_id) { res.status(400).json({ error: 'Thiếu chuyen_id/giuong_id' }); return }
    const tenSach = (ten || '').trim()
    if (!tenSach) { res.status(400).json({ error: 'Vui lòng nhập tên' }); return }
    const sdtChuan = chuanHoaSdt(sdt)
    if (!laSdtHopLe(sdtChuan)) { res.status(400).json({ error: 'Số điện thoại không hợp lệ' }); return }
    if (!diem_len_id || !diem_xuong_id) { res.status(400).json({ error: 'Vui lòng chọn điểm lên/xuống' }); return }
    if (hinh_thuc_thanh_toan !== 'tien_mat_len_xe' && hinh_thuc_thanh_toan !== 'chuyen_khoan_truoc') {
        res.status(400).json({ error: 'Vui lòng chọn phương thức thanh toán' }); return
    }
    let giaSo = null
    if (gia !== undefined && gia !== null && gia !== '') {
        giaSo = Number(gia)
        if (!Number.isFinite(giaSo) || giaSo < 0) { res.status(400).json({ error: 'Giá vé không hợp lệ' }); return }
    }

    const sbAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

    // Chỉ chấp nhận đặt vào chuyến ĐANG chạy — chặn cả trường hợp khách giữ tab cũ mở lâu sau khi
    // crew đã "Kết thúc chuyến" (trang_thai chuyển 'xong') rồi mới bấm Đặt vé.
    const { data: chuyen, error: chuyenErr } = await sbAdmin.from('chuyen').select('id, trang_thai').eq('id', chuyen_id).maybeSingle()
    if (chuyenErr) { res.status(500).json({ error: chuyenErr.message }); return }
    if (!chuyen || chuyen.trang_thai !== 'dang_chay') {
        res.status(400).json({ error: 'Chuyến này không còn mở bán, tải lại trang' }); return
    }

    // KHÔNG tự check "còn trống" trước khi insert — DB tự chặn trùng qua unique index
    // uq_ve_giuong_active (bắt lỗi 23505 bên dưới), tránh race condition 2 khách bấm cùng lúc.
    const { error } = await sbAdmin.from('ve').insert({
        chuyen_id, giuong_id,
        ten_khach: tenSach, sdt_khach: sdtChuan,
        diem_len_id, diem_xuong_id,
        gia: giaSo,
        trang_thai: 'da_dat',
        nguon: 'khach_tu_dat',
        hinh_thuc_thanh_toan
    })

    if (error) {
        if (error.code === '23505') {
            res.status(409).json({ error: 'Giường này vừa có người đặt, chọn giường khác' }); return
        }
        res.status(500).json({ error: error.message }); return
    }

    res.status(200).json({ ok: true })
}

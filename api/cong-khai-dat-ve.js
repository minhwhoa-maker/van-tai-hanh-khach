// api/cong-khai-dat-ve.js (POST) — khách tự đặt vé qua dat-ve.html, không cần đăng nhập. Dùng
// SUPABASE_SERVICE_KEY (không đụng RLS anon) — xem SPEC "dat-ve.html" trong CLAUDE.md để biết vì
// sao không mở thẳng policy anon cho bảng `ve` (sẽ lộ tên/SĐT khách khác cho bất kỳ ai xem source).
//
// chuanHoaSdt/laSdtHopLe COPY từ api/doi-chieu-sdt.js — cố ý KHÔNG import chéo giữa 2 route
// serverless độc lập (mỗi route Vercel Function tự đứng riêng, import chéo giữa api/*.js không có
// lợi ích thực tế ở quy mô nhỏ này, chỉ thêm phụ thuộc ẩn khó theo dõi).
//
// Nhận CHUYEN_ID trực tiếp (chuyến đã có sẵn) HOẶC {ngay, chieu} (lịch chạy cố định — xem
// api/cong-khai-lich-chay.js) để TỰ TẠO `chuyen` (trang_thai='dat_truoc') nếu ngày đó chưa có ai
// đặt trước, xem SPEC "Lịch chạy cố định theo ngày chẵn âm lịch" trong CLAUDE.md.
//
// Giá vé (`ve.gia`) LUÔN do SERVER tự tính lại từ `tinh_tuyen.gia_moc` (2 mã tỉnh client gửi kèm
// qua `tinh_len_ma`/`tinh_xuong_ma`), KHÔNG bao giờ tin `gia` client gửi lên (có thể bị sửa qua
// DevTools trước khi gửi request) — xem SPEC "Bảng giá theo tỉnh" trong CLAUDE.md.
import { createClient } from '@supabase/supabase-js'

function docGioEnv(bien, fallback) {
    const raw = process.env[bien] || fallback
    const m = /^(\d{1,2}):(\d{2})$/.exec(raw)
    if (!m) return { h: 0, m: 0 }
    return { h: Number(m[1]), m: Number(m[2]) }
}

// ngay dạng "YYYY-MM-DD" (giờ VN) + chieu -> Date UTC đúng giờ khởi hành mặc định.
function tinhKhoiHanhMacDinh(ngay, chieu) {
    const gio = docGioEnv(chieu === 'bac' ? 'GIO_KHOI_HANH_BAC' : 'GIO_KHOI_HANH_NAM', '19:30')
    const [yy, mm, dd] = ngay.split('-').map(Number)
    return new Date(Date.UTC(yy, mm - 1, dd, gio.h - 7, gio.m))
}

// Ranh giới 1 ngày DƯƠNG LỊCH theo giờ VN (UTC+7, không DST) quy sang UTC — dùng để
// lọc `chuyen.khoi_hanh` (timestamptz) đúng "ngày VN" thay vì so sánh chuỗi ngày với timestamptz
// (Postgres sẽ hiểu chuỗi "YYYY-MM-DD" là mốc UTC, lệch múi giờ so với ngày VN thật). Khớp đúng
// cách unique index `uq_chuyen_ngay_chieu` (hàm `chuyen_ngay_vn`, xem migration) tính ngày.
function ranhGioiNgayVN(ngay) {
    const [yy, mm, dd] = ngay.split('-').map(Number)
    const start = new Date(Date.UTC(yy, mm - 1, dd, -7, 0))
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
    return { start: start.toISOString(), end: end.toISOString() }
}

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

    const { chuyen_id, ngay, chieu, giuong_id, ten, sdt, diem_len_id, diem_xuong_id, hinh_thuc_thanh_toan, tinh_len_ma, tinh_xuong_ma } = req.body || {}

    if (!giuong_id) { res.status(400).json({ error: 'Thiếu giuong_id' }); return }
    if (!chuyen_id && !(ngay && chieu)) { res.status(400).json({ error: 'Thiếu chuyen_id hoặc ngay/chieu' }); return }
    const tenSach = (ten || '').trim()
    if (!tenSach) { res.status(400).json({ error: 'Vui lòng nhập tên' }); return }
    const sdtChuan = chuanHoaSdt(sdt)
    if (!laSdtHopLe(sdtChuan)) { res.status(400).json({ error: 'Số điện thoại không hợp lệ' }); return }
    // diem_len_id/diem_xuong_id KHÔNG còn bắt buộc (đợt 10, 2026-09-19) — dat-ve.html bỏ hẳn Bước
    // "Chọn điểm lên/xuống" (dropdown diem_khach cụ thể), tự suy ra điểm ĐẦU TIÊN của tỉnh đã chọn
    // ở Bước 0 (client-side, xem CLAUDE.md) hoặc để null nếu tỉnh đó chưa có diem_khach nào — cả 2
    // cột đã nullable sẵn trong schema, không cần migration.
    if (hinh_thuc_thanh_toan !== 'tien_mat_len_xe' && hinh_thuc_thanh_toan !== 'chuyen_khoan_truoc') {
        res.status(400).json({ error: 'Vui lòng chọn phương thức thanh toán' }); return
    }

    const sbAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

    // Bảng giá theo tỉnh (2026-09-19, đợt 12) — giá vé = |gia_moc(tỉnh đến) − gia_moc(tỉnh đi)|,
    // tính LẠI HOÀN TOÀN Ở SERVER từ `tinh_len_ma`/`tinh_xuong_ma` client gửi kèm (không phải từ
    // `diem_len_id`/`diem_xuong_id` — 2 field đó chỉ là điểm CỤ THỂ, có thể null, không đủ để suy
    // ra tỉnh nếu chưa có `diem_khach` nào). `null` nếu thiếu mã tỉnh hoặc 1 trong 2 tỉnh chưa có
    // `gia_moc` — coi như "chưa định giá", KHÔNG chặn đặt vé (giữ hành vi cũ).
    let giaSo = null
    if (tinh_len_ma && tinh_xuong_ma) {
        const { data: tinhRows, error: tinhErr } = await sbAdmin
            .from('tinh_tuyen').select('ma, gia_moc').in('ma', [tinh_len_ma, tinh_xuong_ma])
        if (tinhErr) { res.status(500).json({ error: tinhErr.message }); return }
        const mocMap = new Map(tinhRows.map(t => [t.ma, t.gia_moc]))
        const mocDi = mocMap.get(tinh_len_ma)
        const mocDen = mocMap.get(tinh_xuong_ma)
        if (mocDi != null && mocDen != null) giaSo = Math.abs(Number(mocDen) - Number(mocDi))
    }

    let chuyenId = chuyen_id

    if (chuyenId) {
        // Chấp nhận đặt vào chuyến 'dat_truoc' (chưa tới ngày, khách đặt trước) hoặc 'dang_chay'
        // (crew đã bắt đầu) — chặn 'xong' (crew đã Kết thúc chuyến, hoặc khách giữ tab cũ mở lâu).
        const { data: chuyen, error: chuyenErr } = await sbAdmin.from('chuyen').select('id, trang_thai').eq('id', chuyenId).maybeSingle()
        if (chuyenErr) { res.status(500).json({ error: chuyenErr.message }); return }
        if (!chuyen || (chuyen.trang_thai !== 'dang_chay' && chuyen.trang_thai !== 'dat_truoc')) {
            res.status(400).json({ error: 'Chuyến này không còn mở bán, tải lại trang' }); return
        }
    } else {
        // Chưa có chuyen_id — tra theo (ngay, chieu), tự tạo 'dat_truoc' nếu chưa ai đặt ngày này.
        const { start, end } = ranhGioiNgayVN(ngay)
        const { data: coSan, error: timErr } = await sbAdmin
            .from('chuyen')
            .select('id, trang_thai')
            .in('trang_thai', ['dat_truoc', 'dang_chay'])
            .eq('chieu', chieu)
            .gte('khoi_hanh', start)
            .lt('khoi_hanh', end)
            .maybeSingle()
        if (timErr) { res.status(500).json({ error: timErr.message }); return }

        if (coSan) {
            chuyenId = coSan.id
        } else {
            const { data: created, error: insErr } = await sbAdmin
                .from('chuyen')
                .insert({ chieu, khoi_hanh: tinhKhoiHanhMacDinh(ngay, chieu).toISOString(), trang_thai: 'dat_truoc', tao_boi: null })
                .select('id')
                .single()
            if (insErr) {
                if (insErr.code === '23505') {
                    // Khách khác vừa tạo chuyến cho đúng ngày/chiều này trong lúc mình đang xử lý
                    // (đụng unique index uq_chuyen_ngay_chieu) — lấy lại bản ghi vừa được tạo,
                    // KHÔNG báo lỗi cho khách (họ không cần biết chi tiết race condition này).
                    const { data: laiThu, error: laiErr } = await sbAdmin
                        .from('chuyen').select('id').eq('chieu', chieu)
                        .gte('khoi_hanh', start).lt('khoi_hanh', end)
                        .in('trang_thai', ['dat_truoc', 'dang_chay']).maybeSingle()
                    if (laiErr || !laiThu) { res.status(500).json({ error: laiErr?.message || 'Lỗi tạo chuyến' }); return }
                    chuyenId = laiThu.id
                } else {
                    res.status(500).json({ error: insErr.message }); return
                }
            } else {
                chuyenId = created.id
            }
        }
    }

    // KHÔNG tự check "còn trống" trước khi insert — DB tự chặn trùng qua unique index
    // uq_ve_giuong_active (bắt lỗi 23505 bên dưới), tránh race condition 2 khách bấm cùng lúc.
    const { error } = await sbAdmin.from('ve').insert({
        chuyen_id: chuyenId, giuong_id,
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

    // Trả lại chuyen_id đã dùng (kể cả khi vừa tự tạo) — dat-ve.html cần giá trị này để các lượt
    // đặt/tải-lại-sơ-đồ TIẾP THEO trong cùng phiên dùng ĐÚNG chuyến vừa tạo, không phải tạo lại.
    res.status(200).json({ ok: true, chuyen_id: chuyenId })
}

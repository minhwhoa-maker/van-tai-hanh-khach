// api/cong-khai-dat-ve.js (POST) — khách tự đặt vé qua dat-ve.html, không cần đăng nhập. Dùng
// SUPABASE_SERVICE_KEY (không đụng RLS anon) — xem SPEC "dat-ve.html" trong CLAUDE.md để biết vì
// sao không mở thẳng policy anon cho bảng `ve` (sẽ lộ tên/SĐT khách khác cho bất kỳ ai xem source).
//
// chuanHoaSdt/laSdtHopLe COPY từ api/doi-chieu-sdt.js — cố ý KHÔNG import chéo giữa 2 route
// serverless độc lập (mỗi route Vercel Function tự đứng riêng, import chéo giữa api/*.js không có
// lợi ích thực tế ở quy mô nhỏ này, chỉ thêm phụ thuộc ẩn khó theo dõi). NGOẠI LỆ: `_lib/nha-xe.js`
// (resolve tenant + verify ownership) DÙNG CHUNG có chủ đích — xem file đó để biết lý do.
//
// Nhận CHUYEN_ID trực tiếp (chuyến đã có sẵn) HOẶC {ngay, chieu} (lịch chạy cố định — xem
// api/cong-khai-lich-chay.js) để TỰ TẠO `chuyen` (trang_thai='dat_truoc') nếu ngày đó chưa có ai
// đặt trước, xem SPEC "Lịch chạy cố định theo ngày chẵn âm lịch" trong CLAUDE.md.
//
// Giá vé (`ve.gia`) LUÔN do SERVER tự tính lại từ `tuyen_tinh.gia_moc` (2 mã tỉnh client gửi kèm
// qua `tinh_len_ma`/`tinh_xuong_ma`), KHÔNG bao giờ tin `gia` client gửi lên (có thể bị sửa qua
// DevTools trước khi gửi request) — xem SPEC "Bảng giá theo tỉnh" trong CLAUDE.md.
//
// Multi-tenant Giai đoạn 5 (2026-09-20) — resolve nhà xe từ `?nx=<slug>` (BLOCKER hardcode 'eakar'
// đã gỡ). MỌI id client gửi lên (chuyen_id, giuong_id, diem_len_id, diem_xuong_id, tinh_len_ma,
// tinh_xuong_ma) được verify thuộc đúng nhà xe TRƯỚC khi insert — route dùng service key nên RLS
// KHÔNG cứu được nếu bỏ qua bước này. Xem SPEC "Multi-tenant Giai đoạn 5" trong CLAUDE.md.
import { createClient } from '@supabase/supabase-js'
import { docNx, layNhaXe, xacMinhThuocNhaXe, guiLoiNhaXe } from './_lib/nha-xe.js'

// Giờ khởi hành mặc định cho `chuyen` tự tạo — đọc từ `nha_xe.gio_khoi_hanh_bac/nam` (cột DB
// riêng từng nhà xe, thay cho ENV Vercel chung 1 giờ trước đây).
function tinhKhoiHanhMacDinh(nhaXe, ngay, chieu) {
    const raw = chieu === 'bac' ? nhaXe.gio_khoi_hanh_bac : nhaXe.gio_khoi_hanh_nam
    const m = /^(\d{1,2}):(\d{2})/.exec(raw)
    const h = Number(m[1]), mi = Number(m[2])
    const [yy, mm, dd] = ngay.split('-').map(Number)
    return new Date(Date.UTC(yy, mm - 1, dd, h - 7, mi))
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

    const sbAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    let nhaXe
    try {
        nhaXe = await layNhaXe(sbAdmin, docNx(req))
    } catch (err) {
        if (guiLoiNhaXe(res, err)) return
        res.status(500).json({ error: err.message }); return
    }

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

    // OTP bắt buộc (2026-09-19) — SERVER TỰ KIỂM TRA đã xác thực qua api/cong-khai-xac-thuc-otp.js
    // chưa, KHÔNG tin cờ "đã verify" từ client (cùng nguyên tắc "không tin client" đã áp dụng cho
    // giá vé) — dòng dat_ve_otp phải da_dung=true VÀ xac_thuc_luc trong 30 phút gần nhất (khách xác
    // thực xong rồi lằng nhằng chọn giường lâu quá thì bắt xác thực lại, tránh mã cũ dùng mãi).
    // `dat_ve_otp` cố ý GLOBAL, không gắn nha_xe_id — xác thực SĐT là việc của số điện thoại.
    const { data: otpRow, error: otpErr } = await sbAdmin
        .from('dat_ve_otp').select('id')
        .eq('sdt', sdtChuan).eq('da_dung', true)
        .gte('xac_thuc_luc', new Date(Date.now() - 30 * 60 * 1000).toISOString())
        .order('xac_thuc_luc', { ascending: false }).limit(1).maybeSingle()
    if (otpErr) { res.status(500).json({ error: otpErr.message }); return }
    if (!otpRow) { res.status(403).json({ error: 'Vui lòng xác thực số điện thoại trước khi đặt vé' }); return }

    // Verify sở hữu — MỌI id client gửi lên phải thuộc đúng nhà xe vừa resolve. Ownership (404) và
    // trạng thái/hoạt động (400) LUÔN là 2 kiểm tra RIÊNG — gộp lại sẽ khiến 1 chuyến/giường hợp lệ
    // của ĐÚNG nhà xe này nhưng đang 'xong'/`hoat_dong=false` bị báo nhầm thành 404 (sai nghĩa, khó
    // debug) thay vì đúng 400.
    if (chuyen_id) {
        try {
            await xacMinhThuocNhaXe(sbAdmin, 'chuyen', chuyen_id, nhaXe.id)
        } catch (err) {
            if (guiLoiNhaXe(res, err)) return
            res.status(500).json({ error: err.message }); return
        }
    }

    // giuong_id: verify sở hữu + hoạt động (2026-09-20) — CŨNG vá 1 lỗ hổng có sẵn không liên quan
    // multi-tenant: trước đợt này route không hề check `hoat_dong`, nên gọi thẳng API vẫn đặt được
    // giường mà UI (openVeModal ở dat-ve.html) đã khoá.
    let giuong
    try {
        giuong = await xacMinhThuocNhaXe(sbAdmin, 'giuong', giuong_id, nhaXe.id)
    } catch (err) {
        if (guiLoiNhaXe(res, err)) return
        res.status(500).json({ error: err.message }); return
    }
    {
        const { data: giuongFull, error: giuongErr } = await sbAdmin.from('giuong').select('hoat_dong').eq('id', giuong.id).single()
        if (giuongErr) { res.status(500).json({ error: giuongErr.message }); return }
        if (!giuongFull.hoat_dong) { res.status(400).json({ error: 'Giường ngưng phục vụ' }); return }
    }

    if (diem_len_id) {
        try { await xacMinhThuocNhaXe(sbAdmin, 'diem_khach', diem_len_id, nhaXe.id) }
        catch (err) { if (guiLoiNhaXe(res, err)) return; res.status(500).json({ error: err.message }); return }
    }
    if (diem_xuong_id) {
        try { await xacMinhThuocNhaXe(sbAdmin, 'diem_khach', diem_xuong_id, nhaXe.id) }
        catch (err) { if (guiLoiNhaXe(res, err)) return; res.status(500).json({ error: err.message }); return }
    }

    // Bảng giá theo tỉnh (2026-09-19, đợt 12) — giá vé = |gia_moc(tỉnh đến) − gia_moc(tỉnh đi)|,
    // tính LẠI HOÀN TOÀN Ở SERVER từ `tinh_len_ma`/`tinh_xuong_ma` client gửi kèm (không phải từ
    // `diem_len_id`/`diem_xuong_id` — 2 field đó chỉ là điểm CỤ THỂ, có thể null, không đủ để suy
    // ra tỉnh nếu chưa có `diem_khach` nào).
    //
    // KHÔNG dùng xacMinhThuocNhaXe (mã tỉnh không phải PK `id` của tuyen_tinh) — query riêng theo
    // tinh_ma. Mỗi mã ĐƯỢC GỬI (khác rỗng) validate ĐỘC LẬP, không phụ thuộc mã kia có mặt hay
    // không: mã lạ (không có trong tuyen_tinh của đúng nhà xe này) → 400 hard-fail, vì client hợp
    // lệ chỉ gửi mã lấy từ danh sách của chính nhà xe đó (từ api/cong-khai-diem-khach.js) — mã lạ
    // là tampering hoặc bug, không được âm thầm cho qua. Chỉ TÍNH GIÁ khi CẢ 2 mã có mặt và cả 2
    // hợp lệ; gia_moc null ở 1 trong 2 tỉnh (dù mã hợp lệ) → giữ hành vi cũ, `ve.gia = null`
    // ("chưa định giá"), không chặn đặt vé.
    let giaSo = null
    const maTinhGuiLen = [tinh_len_ma, tinh_xuong_ma].filter(Boolean)
    if (maTinhGuiLen.length) {
        const { data: tinhRows, error: tinhErr } = await sbAdmin
            .from('tuyen_tinh').select('tinh_ma, gia_moc').eq('nha_xe_id', nhaXe.id).in('tinh_ma', maTinhGuiLen)
        if (tinhErr) { res.status(500).json({ error: tinhErr.message }); return }
        const mocMap = new Map(tinhRows.map(t => [t.tinh_ma, t.gia_moc]))
        for (const ma of maTinhGuiLen) {
            if (!mocMap.has(ma)) { res.status(400).json({ error: 'Tỉnh không hợp lệ' }); return }
        }
        if (tinh_len_ma && tinh_xuong_ma) {
            const mocDi = mocMap.get(tinh_len_ma)
            const mocDen = mocMap.get(tinh_xuong_ma)
            if (mocDi != null && mocDen != null) giaSo = Math.abs(Number(mocDen) - Number(mocDi))
        }
    }

    let chuyenId = chuyen_id

    if (chuyenId) {
        // Ownership đã verify ở trên (xacMinhThuocNhaXe) — kiểm tra RIÊNG trạng thái, không gộp
        // vào cùng 1 query. Chấp nhận đặt vào chuyến 'dat_truoc' (chưa tới ngày, khách đặt trước)
        // hoặc 'dang_chay' (crew đã bắt đầu) — chặn 'xong' (crew đã Kết thúc chuyến, hoặc khách
        // giữ tab cũ mở lâu).
        const { data: chuyen, error: chuyenErr } = await sbAdmin.from('chuyen').select('trang_thai').eq('id', chuyenId).single()
        if (chuyenErr) { res.status(500).json({ error: chuyenErr.message }); return }
        if (chuyen.trang_thai !== 'dang_chay' && chuyen.trang_thai !== 'dat_truoc') {
            res.status(400).json({ error: 'Chuyến này không còn mở bán, tải lại trang' }); return
        }
    } else {
        // Chưa có chuyen_id — tra theo (ngay, chieu), tự tạo 'dat_truoc' nếu chưa ai đặt ngày này.
        const { start, end } = ranhGioiNgayVN(ngay)
        const { data: coSan, error: timErr } = await sbAdmin
            .from('chuyen')
            .select('id, trang_thai')
            .eq('nha_xe_id', nhaXe.id)
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
                .insert({ chieu, khoi_hanh: tinhKhoiHanhMacDinh(nhaXe, ngay, chieu).toISOString(), trang_thai: 'dat_truoc', tao_boi: null, nha_xe_id: nhaXe.id })
                .select('id')
                .single()
            if (insErr) {
                if (insErr.code === '23505') {
                    // Khách khác vừa tạo chuyến cho đúng ngày/chiều này trong lúc mình đang xử lý
                    // (đụng unique index uq_chuyen_ngay_chieu) — lấy lại bản ghi vừa được tạo,
                    // KHÔNG báo lỗi cho khách (họ không cần biết chi tiết race condition này).
                    const { data: laiThu, error: laiErr } = await sbAdmin
                        .from('chuyen').select('id').eq('chieu', chieu).eq('nha_xe_id', nhaXe.id)
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
        // tinh_len_ma/tinh_xuong_ma: ĐÃ validate thuộc đúng tuyen_tinh của nhaXe ở trên (xem
        // maTinhGuiLen) trước khi dùng để tính giá — ghi thêm vào đây để trả nợ "vé không biết
        // khách xuống đâu" khi tỉnh chưa có diem_khach cụ thể (spec "Đặt vé trên khach.html",
        // 2026-09-21). Không cần validate lại — cùng giá trị/cùng lượt request đã qua bước tính
        // giá phía trên, `ve_tinh_len_fk`/`ve_tinh_xuong_fk` (composite theo nha_xe_id) là lớp
        // chặn thứ 2 ở tầng DB nếu có gì đó sai sót.
        tinh_len_ma: tinh_len_ma || null, tinh_xuong_ma: tinh_xuong_ma || null,
        gia: giaSo,
        trang_thai: 'da_dat',
        nguon: 'khach_tu_dat',
        hinh_thuc_thanh_toan,
        nha_xe_id: nhaXe.id
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

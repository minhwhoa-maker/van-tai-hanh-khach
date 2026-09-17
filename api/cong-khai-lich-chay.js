// api/cong-khai-lich-chay.js (GET) — tính lịch chạy CỐ ĐỊNH theo ngày ÂM LỊCH CHẴN (2, 4, 6...30
// mỗi tháng âm), dùng bởi dat-ve.html Bước 0 "Chọn ngày đi". Xem SPEC "Lịch chạy cố định theo ngày
// chẵn âm lịch" trong CLAUDE.md.
//
// convertSolar2Lunar + các hàm phụ trợ COPY NGUYÊN VĂN từ shared.js — file đó là script trình
// duyệt thuần (khai báo hàm ở global scope, không module.exports) nên không import được thẳng vào
// route serverless Node (ESM `import`). Cùng convention "không import chéo giữa 2 nơi độc lập" đã
// dùng cho chuanHoaSdt/laSdtHopLe ở api/cong-khai-dat-ve.js.
import { createClient } from '@supabase/supabase-js'

function _int(d) { return Math.floor(d) }

function _jdFromDate(dd, mm, yy) {
    const a = _int((14 - mm) / 12)
    const y = yy + 4800 - a
    const m = mm + 12 * a - 3
    let jd = dd + _int((153 * m + 2) / 5) + 365 * y + _int(y / 4) - _int(y / 100) + _int(y / 400) - 32045
    if (jd < 2299161) {
        jd = dd + _int((153 * m + 2) / 5) + 365 * y + _int(y / 4) - 32083
    }
    return jd
}

function _newMoon(k) {
    const T = k / 1236.85
    const T2 = T * T
    const T3 = T2 * T
    const dr = Math.PI / 180
    let Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3
    Jd1 = Jd1 + 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr)
    const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3
    const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3
    const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3
    let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M)
    C1 = C1 - 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr)
    C1 = C1 - 0.0004 * Math.sin(dr * 3 * Mpr)
    C1 = C1 + 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr))
    C1 = C1 - 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M))
    C1 = C1 - 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr))
    C1 = C1 + 0.0010 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M))
    let deltat
    if (T < -11) {
        deltat = 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3
    } else {
        deltat = -0.000278 + 0.000265 * T + 0.000262 * T2
    }
    const JdNew = Jd1 + C1 - deltat
    return JdNew
}

function _sunLongitude(jdn) {
    const T = (jdn - 2451545.0) / 36525
    const T2 = T * T
    const dr = Math.PI / 180
    const M = 357.52910 + 35999.05030 * T - 0.0001559 * T2 - 0.00000048 * T * T2
    const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2
    let DL = (1.914600 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M)
    DL = DL + (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.000290 * Math.sin(dr * 3 * M)
    let L = L0 + DL
    L = L * dr
    L = L - Math.PI * 2 * (_int(L / (Math.PI * 2)))
    return L
}

function _getSunLongitude(dayNumber, timeZone) {
    return _int(_sunLongitude(dayNumber - 0.5 - timeZone / 24) / Math.PI * 6)
}

function _getNewMoonDay(k, timeZone) {
    return _int(_newMoon(k) + 0.5 + timeZone / 24)
}

function _getLunarMonth11(yy, timeZone) {
    const off = _jdFromDate(31, 12, yy) - 2415021.076998695
    const k = _int(off / 29.530588853)
    let nm = _getNewMoonDay(k, timeZone)
    const sunLong = _getSunLongitude(nm, timeZone)
    if (sunLong >= 9) {
        nm = _getNewMoonDay(k - 1, timeZone)
    }
    return nm
}

function _getLeapMonthOffset(a11, timeZone) {
    const k = _int((a11 - 2415021.076998695) / 29.530588853 + 0.5)
    let last = 0, i = 1
    let arc = _getSunLongitude(_getNewMoonDay(k + i, timeZone), timeZone)
    do {
        last = arc
        i++
        arc = _getSunLongitude(_getNewMoonDay(k + i, timeZone), timeZone)
    } while (arc != last && i < 14)
    return i - 1
}

function convertSolar2Lunar(dd, mm, yy, timeZone) {
    const dayNumber = _jdFromDate(dd, mm, yy)
    const k = _int((dayNumber - 2415021.076998695) / 29.530588853)
    let monthStart = _getNewMoonDay(k + 1, timeZone)
    if (monthStart > dayNumber) {
        monthStart = _getNewMoonDay(k, timeZone)
    }
    let a11 = _getLunarMonth11(yy, timeZone)
    let b11 = a11
    let lunarYear
    if (a11 >= monthStart) {
        lunarYear = yy
        a11 = _getLunarMonth11(yy - 1, timeZone)
    } else {
        lunarYear = yy + 1
        b11 = _getLunarMonth11(yy + 1, timeZone)
    }
    const lunarDay = dayNumber - monthStart + 1
    const diff = _int((monthStart - a11) / 29)
    let lunarLeap = 0
    let lunarMonth = diff + 11
    if (b11 - a11 > 365) {
        const leapMonthDiff = _getLeapMonthOffset(a11, timeZone)
        if (diff >= leapMonthDiff) {
            lunarMonth = diff + 10
            if (diff == leapMonthDiff) {
                lunarLeap = 1
            }
        }
    }
    if (lunarMonth > 12) {
        lunarMonth -= 12
    }
    if (lunarMonth >= 11 && diff < 4) {
        lunarYear -= 1
    }
    return { day: lunarDay, month: lunarMonth, year: lunarYear, leap: lunarLeap }
}

// GIÁ TRỊ TẠM — owner cần xác nhận thực tế mở bán trước bao lâu, sửa hằng số này nếu khác.
const SO_NGAY_MO_BAN_TRUOC = 45

// *** owner PHẢI set 2 biến env này trên Vercel (Production) bằng giờ chạy THẬT ***, định dạng
// "HH:mm". Giá trị fallback dưới đây CHỈ là placeholder tạm để không crash lúc chưa set —
// TUYỆT ĐỐI không coi đây là giờ chạy chính thức.
function docGioEnv(bien, fallback) {
    const raw = process.env[bien] || fallback
    const m = /^(\d{1,2}):(\d{2})$/.exec(raw)
    if (!m) return { h: 0, m: 0 }
    return { h: Number(m[1]), m: Number(m[2]) }
}

function ngayVN(date) {
    // Ngày dương lịch tại VN (UTC+7) của 1 mốc thời gian, dùng để tính lịch + so sánh "hôm nay".
    const vn = new Date(date.getTime() + 7 * 60 * 60 * 1000)
    return { dd: vn.getUTCDate(), mm: vn.getUTCMonth() + 1, yy: vn.getUTCFullYear(), hh: vn.getUTCHours(), mi: vn.getUTCMinutes() }
}

export default async function handler(req, res) {
    if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }

    const gioBac = docGioEnv('GIO_KHOI_HANH_BAC', '19:30')
    const gioNam = docGioEnv('GIO_KHOI_HANH_NAM', '19:30')

    const now = new Date()
    const homNay = ngayVN(now)
    const homNayStr = `${homNay.yy}-${String(homNay.mm).padStart(2, '0')}-${String(homNay.dd).padStart(2, '0')}`
    const nowMs = now.getTime()

    // Giờ khởi hành SỚM NHẤT trong 2 chiều — dùng làm mốc loại "hôm nay" ra khỏi lịch nếu đã
    // qua giờ đó (2026-09-19, đổi từ loại RIÊNG TỪNG CHIỀU sang loại CẢ NGÀY theo mốc sớm nhất —
    // đơn giản hoá cho giao diện lịch dạng lưới, 1 ô ngày chỉ có đúng 1 trạng thái hợp lệ/không,
    // không còn khái niệm "ngày hợp lệ nhưng chỉ 1 trong 2 chiều bán được" như bản danh sách cũ).
    const gioSomNhat = (gioBac.h * 60 + gioBac.m <= gioNam.h * 60 + gioNam.m) ? gioBac : gioNam

    // TRẢ VỀ TOÀN BỘ ngày trong khoảng (kể cả ngày KHÔNG chạy) — frontend tự vẽ lịch dạng lưới,
    // ngày lẻ âm vẫn phải hiện ô (mờ/khoá) để đúng vị trí trên lịch, không chỉ lọc sẵn ngày hợp lệ
    // như bản danh sách phẳng trước đây.
    const tatCaNgay = []
    for (let i = 0; i <= SO_NGAY_MO_BAN_TRUOC; i++) {
        const d = new Date(Date.UTC(homNay.yy, homNay.mm - 1, homNay.dd + i, 12, 0, 0)) // trưa UTC, tránh lệch ngày do DST/giờ biên
        const { dd, mm, yy } = ngayVN(d)
        const am = convertSolar2Lunar(dd, mm, yy, 7)
        const ngayStr = `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
        const isToday = ngayStr === homNayStr
        let hopLe = am.day % 2 === 0
        if (hopLe && isToday) {
            const gioChayUTC = Date.UTC(yy, mm - 1, dd, gioSomNhat.h - 7, gioSomNhat.m) // giờ VN -> UTC (UTC+7)
            hopLe = nowMs < gioChayUTC
        }
        tatCaNgay.push({ ngay: ngayStr, lunar_day: am.day, lunar_month: am.month, hop_le: hopLe })
    }

    const ngayHopLe = tatCaNgay.filter(x => x.hop_le)
    if (!ngayHopLe.length) { res.status(200).json({ lich: tatCaNgay }); return }

    const sbAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    const tuNgay = ngayHopLe[0].ngay
    const denNgay = ngayHopLe[ngayHopLe.length - 1].ngay
    const { data: chuyenCoSan, error } = await sbAdmin
        .from('chuyen')
        .select('id, chieu, khoi_hanh')
        .in('trang_thai', ['dat_truoc', 'dang_chay'])
        .gte('khoi_hanh', tuNgay)
        .lte('khoi_hanh', denNgay + 'T23:59:59')
    if (error) { res.status(500).json({ error: error.message }); return }

    // Khớp chuyến có sẵn với đúng (ngày VN, chiều) — dùng cùng cách quy đổi ngày VN như DB
    // (chuyen_ngay_vn, xem migration) để không lệch múi giờ giữa client/DB.
    function ngayVNCuaChuyen(khoiHanhIso) {
        const { yy, mm, dd } = ngayVN(new Date(khoiHanhIso))
        return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
    }
    const mapCoSan = new Map() // key: `${ngay}|${chieu}` -> chuyen_id
    for (const c of chuyenCoSan || []) {
        mapCoSan.set(`${ngayVNCuaChuyen(c.khoi_hanh)}|${c.chieu}`, c.id)
    }

    // `ten` = ĐÚNG điểm đi → điểm đến, KHÔNG dùng chữ "Ra Bắc"/"Vào Nam" nữa (đổi 2026-09-19, theo
    // yêu cầu — khách không cần biết/quan tâm khái niệm hướng Bắc/Nam của tuyến, chỉ cần thấy rõ
    // đi từ đâu tới đâu).
    const lich = tatCaNgay.map(({ ngay, lunar_day, lunar_month, hop_le }) => hop_le ? {
        ngay, lunar_day, lunar_month, hop_le,
        bac: { chuyen_id: mapCoSan.get(`${ngay}|bac`) || null, ten: 'Đắk Lắk → Hải Dương' },
        nam: { chuyen_id: mapCoSan.get(`${ngay}|nam`) || null, ten: 'Hải Dương → Đắk Lắk' },
    } : { ngay, lunar_day, lunar_month, hop_le })

    res.status(200).json({ lich })
}

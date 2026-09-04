// EaKar Hàng — shared utilities
// Yêu cầu: load supabase-js trước file này

const SUPABASE_URL = 'https://ycifioonjzrdasofdmjb.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_Mz8G341RU_k3PqOFLiCKjg_8ClEsdhR'

function createSb() {
    return supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
}

// === Formatting ===
function formatBienSo(bien_so) {
    if (!bien_so) return bien_so
    const s = bien_so.toUpperCase().replace(/[-. ]/g, '')
    const match = s.match(/^([A-Z0-9]{2,4})([0-9]{3})([0-9]{2})$/)
    if (!match) return bien_so
    return match[1] + '-' + match[2] + '.' + match[3]
}

function formatMoney(n) {
    const amount = Number(n)
    return (Number.isFinite(amount) ? amount : 0).toLocaleString('vi-VN') + ' đ'
}

// === Auth ===
// Bảo vệ trang: chỉ cần có session Supabase Auth hợp lệ (Google OAuth hoặc bridge
// Zalo qua verifyOtp — xem login.html + api/zalo-callback.js), không phân biệt
// provider. Redirect login.html nếu chưa đăng nhập. Trả về { user } hoặc null.
async function requireSession(sb) {
    try {
        const { data, error } = await sb.auth.getSession()
        if (!error && data?.session?.user) {
            return { user: data.session.user }
        }
    } catch {
        // Ignore and treat as no session
    }
    window.location.href = 'login.html'
    return null
}

// Tự động redirect về login khi user logout từ tab khác.
function setupLogoutListener(sb) {
    sb.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
            window.location.href = 'login.html'
        }
    })
}

// === Navigation ===
// Menu trượt phải dùng chung cho cả 3 trang (hang.html/manifest-hang.html/
// lich-su-chuyen.html) — thay cho các link header-nav-desktop rời rạc 2 bên
// header trước đây. Nhận `sb` làm tham số (thay vì tự tạo) vì mỗi trang đã có
// sẵn 1 instance `sb` riêng — dùng chung instance đó để signOut() cho đúng session.
function renderSideMenu(sb) {
    const currentPage = location.pathname.split('/').pop()
    const menuItems = [
        { href: 'hang.html', label: '📦 Nhập kiện' },
        { href: 'manifest-hang.html', label: '📋 Danh sách kiện' },
        { href: 'lich-su-chuyen.html', label: '🕐 Lịch sử' },
    ]

    const drawer = document.createElement('div')
    drawer.className = 'side-drawer'
    drawer.innerHTML = `
        <div class="side-drawer-backdrop"></div>
        <div class="side-drawer-panel">
            <button class="side-drawer-close" type="button" aria-label="Đóng">✕</button>
            <nav>
                ${menuItems.map(item => `
                    <a href="${item.href}" class="${item.href === currentPage ? 'active' : ''}">${item.label}</a>
                `).join('')}
                <hr>
                <a href="#" id="side-drawer-logout">Đăng xuất</a>
            </nav>
        </div>
    `
    document.body.appendChild(drawer)

    const open = () => drawer.classList.add('open')
    const close = () => drawer.classList.remove('open')
    drawer.querySelector('.side-drawer-backdrop').addEventListener('click', close)
    drawer.querySelector('.side-drawer-close').addEventListener('click', close)
    drawer.querySelector('#side-drawer-logout').addEventListener('click', async (e) => {
        e.preventDefault()
        await sb.auth.signOut()
        location.href = 'login.html'
    })

    return { open, close }
}

// === Âm lịch (thuật toán Hồ Ngọc Đức, múi giờ VN = UTC+7) ===
function _int(d) { return Math.floor(d); }

function _jdFromDate(dd, mm, yy) {
    const a = _int((14 - mm) / 12);
    const y = yy + 4800 - a;
    const m = mm + 12 * a - 3;
    let jd = dd + _int((153 * m + 2) / 5) + 365 * y + _int(y / 4) - _int(y / 100) + _int(y / 400) - 32045;
    if (jd < 2299161) {
        jd = dd + _int((153 * m + 2) / 5) + 365 * y + _int(y / 4) - 32083;
    }
    return jd;
}

function _newMoon(k) {
    const T = k / 1236.85, T2 = T * T, T3 = T2 * T, dr = Math.PI / 180;
    let Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
    Jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
    const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
    const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
    const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
    let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
    C1 = C1 - 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr);
    C1 = C1 - 0.0004 * Math.sin(dr * 3 * Mpr);
    C1 = C1 + 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
    C1 = C1 - 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
    C1 = C1 - 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
    C1 = C1 + 0.0010 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
    const deltat = T < -11
        ? 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3
        : -0.000278 + 0.000265 * T + 0.000262 * T2;
    return Jd1 + C1 - deltat;
}

function _sunLongitude(jdn) {
    const T = (jdn - 2451545.0) / 36525, T2 = T * T, dr = Math.PI / 180;
    const M = 357.52910 + 35999.05030 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
    const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
    let DL = (1.914600 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
    DL = DL + (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.000290 * Math.sin(dr * 3 * M);
    let L = (L0 + DL) * dr;
    L = L - Math.PI * 2 * _int(L / (Math.PI * 2));
    return _int(L / Math.PI * 6);
}

function _getSunLongitude(dayNumber, timeZone) {
    return _sunLongitude(dayNumber - 0.5 - timeZone / 24);
}

function _getNewMoonDay(k, timeZone) {
    return _int(_newMoon(k) + 0.5 + timeZone / 24);
}

function _getLunarMonth11(yy, timeZone) {
    const off = _jdFromDate(31, 12, yy) - 2415021;
    const k = _int(off / 29.530588853);
    let nm = _getNewMoonDay(k, timeZone);
    const sunLong = _getSunLongitude(nm, timeZone);
    if (sunLong >= 9) {
        nm = _getNewMoonDay(k - 1, timeZone);
    }
    return nm;
}

function _getLeapMonthOffset(a11, timeZone) {
    const k = _int((a11 - 2415021.076998695) / 29.530588853 + 0.5);
    let last = 0, i = 1;
    let arc = _getSunLongitude(_getNewMoonDay(k + i, timeZone), timeZone);
    do {
        last = arc;
        i++;
        arc = _getSunLongitude(_getNewMoonDay(k + i, timeZone), timeZone);
    } while (arc != last && i < 14);
    return i - 1;
}

function convertSolar2Lunar(dd, mm, yy, timeZone) {
    const dayNumber = _jdFromDate(dd, mm, yy);
    const k = _int((dayNumber - 2415021.076998695) / 29.530588853);
    let monthStart = _getNewMoonDay(k + 1, timeZone);
    if (monthStart > dayNumber) {
        monthStart = _getNewMoonDay(k, timeZone);
    }
    let a11 = _getLunarMonth11(yy, timeZone);
    let b11 = a11;
    let lunarYear;
    if (a11 >= monthStart) {
        lunarYear = yy;
        a11 = _getLunarMonth11(yy - 1, timeZone);
    } else {
        lunarYear = yy + 1;
        b11 = _getLunarMonth11(yy + 1, timeZone);
    }
    const lunarDay = dayNumber - monthStart + 1;
    const diff = _int((monthStart - a11) / 29);
    let lunarLeap = 0;
    let lunarMonth = diff + 11;
    if (b11 - a11 > 365) {
        const leapMonthDiff = _getLeapMonthOffset(a11, timeZone);
        if (diff >= leapMonthDiff) {
            lunarMonth = diff + 10;
            if (diff == leapMonthDiff) {
                lunarLeap = 1;
            }
        }
    }
    if (lunarMonth > 12) {
        lunarMonth -= 12;
    }
    if (lunarMonth >= 11 && diff < 4) {
        lunarYear -= 1;
    }
    return { day: lunarDay, month: lunarMonth, year: lunarYear, leap: lunarLeap };
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const vn = new Date(d.getTime() + 7 * 60 * 60 * 1000);
    const hh = String(vn.getUTCHours()).padStart(2, '0');
    const mm = String(vn.getUTCMinutes()).padStart(2, '0');
    const dd = String(vn.getUTCDate()).padStart(2, '0');
    const mo = String(vn.getUTCMonth() + 1).padStart(2, '0');
    const yy = String(vn.getUTCFullYear()).slice(2);
    const am = convertSolar2Lunar(vn.getUTCDate(), vn.getUTCMonth() + 1, vn.getUTCFullYear(), 7);
    const amLabel = `${am.day}/${am.month}${am.leap ? ' nhuận' : ''} ÂL`;
    return `${hh}:${mm} - ${amLabel} - ${dd}/${mo}/${yy}`;
}
function getLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Thiết bị không hỗ trợ GPS'))
            return
        }
        navigator.geolocation.getCurrentPosition(
            pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            err => reject(new Error('Không lấy được vị trí. Vui lòng bật GPS và thử lại.')),
            { timeout: 10000, maximumAge: 0, enableHighAccuracy: true }
        )
    })
}

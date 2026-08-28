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
    return `${hh}:${mm} - ${dd}/${mo}/${yy}`;
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

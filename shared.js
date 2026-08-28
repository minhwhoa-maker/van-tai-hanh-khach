// EaKar Hàng — shared utilities
// Yêu cầu: load supabase-js trước file này

// TODO: điền URL + anon key của project Supabase MỚI (eakar-hang), khác project eakar-logistics
const SUPABASE_URL = 'https://YOUR-NEW-PROJECT-REF.supabase.co'
const SUPABASE_ANON_KEY = 'YOUR-NEW-ANON-KEY'

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
async function getUserRole(sb, email) {
    const { data, error } = await sb
        .from('users')
        .select('role')
        .eq('email', email)
        .maybeSingle()
    if (error) throw new Error(error.message)
    return data?.role ?? null
}

async function getUserProfile(sb, email) {
    const { data, error } = await sb
        .from('users')
        .select('id, role, owner_id')
        .eq('email', email)
        .maybeSingle()
    if (error) throw new Error(error.message)
    return data
}

// Bảo vệ trang admin: kiểm tra session + role, redirect login-sdt nếu không khớp.
// Trả về { user, profile } hoặc null.
async function requireRole(sb, expectedRole) {
    const allowedRoles = Array.isArray(expectedRole) ? expectedRole : [expectedRole]
    let session = null
    try {
        const { data, error } = await sb.auth.getSession()
        if (!error && data?.session?.user?.email) {
            session = data.session
        }
    } catch {
        // Ignore and treat as no session
    }

    if (session) {
        try {
            const profile = await getUserProfile(sb, session.user.email)
            if (profile && allowedRoles.includes(profile.role)) {
                return { user: session.user, profile }
            } else {
                window.location.href = 'login-sdt.html'
                return null
            }
        } catch {
            window.location.href = 'login-sdt.html'
            return null
        }
    } else {
        const loginRedirect = 'login-sdt.html'

        const token = localStorage.getItem('driver_token')
        if (!token) {
            window.location.href = loginRedirect
            return null
        }

        const showRetryOverlay = () => {
            if (document.getElementById('connretry-overlay')) return
            const ov = document.createElement('div')
            ov.id = 'connretry-overlay'
            ov.style.cssText = 'position:fixed; inset:0; z-index:99999; background:#fff; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; font-size:16px; color:#444;'
            ov.innerHTML = '<div id="connretry-spinner" style="width:40px; height:40px; border:4px solid #e0e0e0; border-top-color:#1565c0; border-radius:50%; animation:connretry-spin 0.8s linear infinite;"></div><div id="connretry-text">Đang kết nối lại...</div><style>@keyframes connretry-spin{to{transform:rotate(360deg)}}</style>'
            document.body.appendChild(ov)
        }
        const removeOverlay = () => {
            const el = document.getElementById('connretry-overlay')
            if (el) el.remove()
        }

        const MAX_TRIES = 3
        for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
            const controller = new AbortController()
            const timer = setTimeout(() => controller.abort(), 8000)
            let needRetry = false
            try {
                const res = await fetch('/api/verify-session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token }),
                    signal: controller.signal
                })
                if (res.ok) {
                    const data = await res.json()
                    removeOverlay()
                    if (!data || !allowedRoles.includes(data.role)) {
                        window.location.href = 'login-sdt.html'
                        return null
                    }
                    return {
                        user: { id: data.id },
                        profile: {
                            id: data.id,
                            role: data.role,
                            full_name: data.full_name,
                            sdt: data.sdt,
                            owner_id: data.owner_id
                        }
                    }
                } else if (res.status >= 500) {
                    needRetry = true   // lỗi server tạm — giữ token, thử lại
                } else {
                    // 401 / 4xx — token không hợp lệ hoặc request sai
                    removeOverlay()
                    localStorage.removeItem('driver_token')
                    window.location.href = loginRedirect
                    return null
                }
            } catch {
                // fetch throw / AbortError timeout / res.json() throw — giữ token, thử lại
                needRetry = true
            } finally {
                clearTimeout(timer)
            }

            if (needRetry && attempt < MAX_TRIES) {
                showRetryOverlay()
                await new Promise(r => setTimeout(r, 1500))
            }
        }

        // Hết 3 vòng vẫn fail (toàn ≥500 / throw) — giữ token, không redirect.
        showRetryOverlay()
        const spin = document.getElementById('connretry-spinner')
        if (spin) spin.remove()
        const textEl = document.getElementById('connretry-text')
        if (textEl) textEl.textContent = 'Lỗi kết nối, vui lòng thử lại'
        const ov = document.getElementById('connretry-overlay')
        if (ov && !document.getElementById('connretry-btn')) {
            const btn = document.createElement('button')
            btn.id = 'connretry-btn'
            btn.textContent = 'Thử lại'
            btn.style.cssText = 'padding:10px 24px; background:#1565c0; color:#fff; border:none; border-radius:8px; font-size:15px; cursor:pointer;'
            btn.onclick = () => location.reload()
            ov.appendChild(btn)
        }
        return null
    }
}

// Tự động redirect về login-sdt khi user logout từ tab khác.
function setupLogoutListener(sb) {
    if (localStorage.getItem('driver_token')) return
    sb.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
            window.location.href = 'login-sdt.html'
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

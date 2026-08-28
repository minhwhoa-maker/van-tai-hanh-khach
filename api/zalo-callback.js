// api/zalo-callback.js — bước 2 của bridge Zalo Login.
// 1. Đổi authorization code lấy access_token (Zalo OAuth v4 + PKCE)
// 2. Gọi graph.zalo.me/v2.0/me lấy zalo_id/name/picture — đây chính là bước "verify token"
// 3. supabase.auth.admin.generateLink(magiclink, email_gia_dinh_theo_zalo_id) — dùng cơ chế
//    chính thức của Supabase (KHÔNG tự ký JWT tay) để lấy hashed_token
// 4. Redirect trình duyệt sang auth-callback.html?email=...&token_hash=... để verifyOtp() phía
//    client và thiết lập session — cùng cơ chế cho cả Google lẫn Zalo từ đó về sau.
//
// TODO: đối chiếu chính xác endpoint/tên tham số exchange token với
// https://developers.zalo.me/docs trước khi go-live.
import { createClient } from '@supabase/supabase-js'

function parseCookie(header, name) {
    if (!header) return null
    const match = header.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))
    return match ? match.slice(name.length + 1) : null
}

export default async function handler(req, res) {
    const { code, error: zaloError } = req.query
    if (zaloError) {
        res.status(400).send(`Đăng nhập Zalo bị hủy hoặc lỗi: ${zaloError}`)
        return
    }
    if (!code) {
        res.status(400).send('Thiếu authorization code từ Zalo')
        return
    }

    const codeVerifier = parseCookie(req.headers.cookie, 'zalo_pkce')
    if (!codeVerifier) {
        res.status(400).send('Thiếu PKCE code_verifier (cookie hết hạn hoặc bị chặn) — thử đăng nhập lại')
        return
    }

    const appId = process.env.ZALO_APP_ID
    const appSecret = process.env.ZALO_APP_SECRET
    if (!appId || !appSecret) {
        res.status(500).send('Thiếu ZALO_APP_ID / ZALO_APP_SECRET trên server')
        return
    }

    try {
        // Bước 1: đổi code lấy access_token
        const tokenRes = await fetch('https://oauth.zaloapp.com/v4/access_token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                secret_key: appSecret
            },
            body: new URLSearchParams({
                app_id: appId,
                code,
                grant_type: 'authorization_code',
                code_verifier: codeVerifier
            })
        })
        const tokenData = await tokenRes.json()
        if (!tokenData.access_token) {
            res.status(400).send('Đổi access_token thất bại: ' + JSON.stringify(tokenData))
            return
        }

        // Bước 2: lấy profile — đồng thời là bước verify access_token hợp lệ
        const profileRes = await fetch('https://graph.zalo.me/v2.0/me?fields=id,name,picture', {
            headers: { access_token: tokenData.access_token }
        })
        const profile = await profileRes.json()
        if (!profile.id) {
            res.status(400).send('Lấy profile Zalo thất bại: ' + JSON.stringify(profile))
            return
        }

        // Bước 3: tìm/tạo user Supabase Auth ứng với zalo_id qua email giả định
        const sbAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
        const syntheticEmail = `zalo-${profile.id}@zalo.eakar-hang.local`

        const { data: linkData, error: linkErr } = await sbAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email: syntheticEmail,
            options: {
                data: {
                    zalo_id: profile.id,
                    full_name: profile.name || null,
                    avatar_url: profile.picture?.data?.url || null,
                    provider: 'zalo'
                }
            }
        })
        if (linkErr) {
            res.status(500).send('Lỗi tạo session Supabase: ' + linkErr.message)
            return
        }

        const hashedToken = linkData.properties.hashed_token
        const proto = req.headers['x-forwarded-proto'] || 'https'
        const host = req.headers['x-forwarded-host'] || req.headers.host
        const redirectUrl = `${proto}://${host}/auth-callback.html?email=${encodeURIComponent(syntheticEmail)}&token_hash=${encodeURIComponent(hashedToken)}`

        res.setHeader('Set-Cookie', 'zalo_pkce=; Path=/api/zalo-callback; HttpOnly; Max-Age=0')
        res.writeHead(302, { Location: redirectUrl })
        res.end()
    } catch (err) {
        res.status(500).send('Lỗi bridge Zalo Login: ' + err.message)
    }
}

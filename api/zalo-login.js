// api/zalo-login.js — bước 1 của bridge Zalo Login: redirect user sang Zalo OAuth v4
// authorize endpoint, dùng PKCE (Zalo OAuth v4 bắt buộc code_challenge).
// TODO: đối chiếu chính xác endpoint/tên tham số với https://developers.zalo.me/docs
// trước khi go-live — trang doc là SPA nên không fetch trực tiếp được lúc viết file này.
import crypto from 'crypto'

function base64url(buf) {
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export default function handler(req, res) {
    const appId = process.env.ZALO_APP_ID
    if (!appId) {
        res.status(500).json({ error: 'Thiếu ZALO_APP_ID trên server' })
        return
    }

    const codeVerifier = base64url(crypto.randomBytes(32))
    const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest())

    const proto = req.headers['x-forwarded-proto'] || 'https'
    const host = req.headers['x-forwarded-host'] || req.headers.host
    const redirectUri = `${proto}://${host}/api/zalo-callback`

    const authorizeUrl = new URL('https://oauth.zaloapp.com/v4/permission')
    authorizeUrl.searchParams.set('app_id', appId)
    authorizeUrl.searchParams.set('redirect_uri', redirectUri)
    authorizeUrl.searchParams.set('code_challenge', codeChallenge)
    authorizeUrl.searchParams.set('state', base64url(crypto.randomBytes(16)))

    // code_verifier lưu qua httpOnly cookie ngắn hạn để zalo-callback đọc lại
    res.setHeader('Set-Cookie', `zalo_pkce=${codeVerifier}; Path=/api/zalo-callback; HttpOnly; Secure; SameSite=Lax; Max-Age=300`)
    res.writeHead(302, { Location: authorizeUrl.toString() })
    res.end()
}

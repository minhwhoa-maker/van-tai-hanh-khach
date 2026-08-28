import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

async function sendZnsWithToken(phone, code, token) {
    const response = await fetch('https://business.openapi.zalo.me/message/template', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'access_token': token
        },
        body: JSON.stringify({
            phone: phone,
            template_id: '586307',
            template_data: { otp: code },
            tracking_id: `otp_${Date.now()}`
        })
    })
    if (!response.ok) throw new Error('Zalo HTTP ' + response.status)
    return response.json()
}

async function refreshZaloToken() {
    const response = await fetch('https://oauth.zaloapp.com/v4/oa/access_token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'secret_key': process.env.ZALO_APP_SECRET
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            app_id: process.env.ZALO_APP_ID,
            refresh_token: process.env.ZALO_REFRESH_TOKEN
        }).toString()
    })
    if (!response.ok) throw new Error('Token refresh failed')
    const data = await response.json()
    if (!data.access_token) throw new Error('Token refresh failed')
    process.env.ZALO_ACCESS_TOKEN = data.access_token
    return data.access_token
}

async function sendZaloZns(sdt, code) {
    if (!process.env.ZALO_ACCESS_TOKEN) {
        console.log('[DEV] OTP:', code)
        return
    }

    const phone = sdt.startsWith('0') ? '84' + sdt.slice(1) : sdt

    const result = await sendZnsWithToken(phone, code, process.env.ZALO_ACCESS_TOKEN)

    if (result.error === -216) {
        const newToken = await refreshZaloToken()
        const retryResult = await sendZnsWithToken(phone, code, newToken)
        if (retryResult.error !== 0) throw new Error(retryResult.message)
        return
    }

    if (result.error !== 0) throw new Error(result.message)
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    // 1. Validate sdt
    let { sdt } = req.body || {}
    if (!sdt || typeof sdt !== 'string') {
        return res.status(400).json({ error: 'Thiếu số điện thoại' })
    }
    sdt = String(sdt).trim()

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

    // 2. Check SĐT thuộc về một driver đã đăng ký
    const { data: user, error: userErr } = await sb
        .from('users')
        .select('id, role')
        .eq('sdt', sdt)
        .maybeSingle()
    if (userErr) {
        return res.status(500).json({ error: userErr.message })
    }
    if (!user) {
        return res.status(404).json({ error: 'Số điện thoại chưa được đăng ký. Liên hệ chủ xe.' })
    }
    if (user.role !== 'driver' && user.role !== 'supervisor') {
        return res.status(403).json({ error: 'Tài khoản này không hỗ trợ đăng nhập bằng SĐT' })
    }

    const now = Date.now()

    // 3. Rate limit lớp 1 — chống spam 60 giây
    const { data: lastCode, error: lastErr } = await sb
        .from('otp_codes')
        .select('created_at')
        .eq('sdt', sdt)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    if (lastErr) {
        return res.status(500).json({ error: lastErr.message })
    }
    if (lastCode && now - new Date(lastCode.created_at).getTime() < 60 * 1000) {
        return res.status(429).json({ error: 'Vui lòng đợi 60 giây trước khi xin mã mới' })
    }

    // 4. Rate limit lớp 2 — chống spam 5 mã/ngày
    const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString()
    const { count, error: countErr } = await sb
        .from('otp_codes')
        .select('id', { count: 'exact', head: true })
        .eq('sdt', sdt)
        .gte('created_at', since24h)
    if (countErr) {
        return res.status(500).json({ error: countErr.message })
    }
    if (count >= 5) {
        return res.status(429).json({ error: 'Đã xin quá nhiều mã hôm nay. Thử lại sau 24 giờ.' })
    }

    // 5. Vô hiệu hóa mọi mã cũ chưa dùng của SĐT này
    const { error: invalidateErr } = await sb
        .from('otp_codes')
        .update({ used: true })
        .eq('sdt', sdt)
        .eq('used', false)
    if (invalidateErr) {
        return res.status(500).json({ error: invalidateErr.message })
    }

    // 6. Tạo mã 6 chữ số (không bắt đầu bằng 0)
    const code = String(crypto.randomInt(100000, 1000000))

    // 7. INSERT mã mới
    const expires_at = new Date(now + 5 * 60 * 1000).toISOString()
    const { error: insertErr } = await sb
        .from('otp_codes')
        .insert({ sdt, code, expires_at, used: false, wrong_attempts: 0 })
    if (insertErr) {
        return res.status(500).json({ error: insertErr.message })
    }

    // 8. Gửi SMS (bọc try/catch để không vỡ flow nếu SMS fail)
    try {
        await sendZaloZns(sdt, code)
    } catch (e) {
        console.error('sendZaloZns failed:', e?.message)
    }

    // 9. Thành công — TUYỆT ĐỐI KHÔNG trả code về client
    return res.status(200).json({ ok: true })
}

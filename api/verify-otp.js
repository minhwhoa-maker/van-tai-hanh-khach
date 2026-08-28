import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    // 1. Validate sdt + code
    let { sdt, code: rawCode } = req.body || {}
    if (typeof sdt !== 'string') {
        return res.status(400).json({ error: 'Thiếu số điện thoại' })
    }
    sdt = sdt.trim()
    const code = String(rawCode ?? '').trim()
    if (!/^\d{6}$/.test(code)) {
        return res.status(400).json({ error: 'Mã OTP không hợp lệ' })
    }

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

    // 2. Lấy mã chưa dùng mới nhất của SĐT này
    const { data: rows, error: rowErr } = await sb
        .from('otp_codes')
        .select('*')
        .eq('sdt', sdt)
        .eq('used', false)
        .order('created_at', { ascending: false })
        .limit(1)
    if (rowErr) {
        return res.status(500).json({ error: rowErr.message })
    }
    const row = rows && rows[0]
    if (!row) {
        return res.status(400).json({ error: 'Mã OTP không hợp lệ' })
    }

    // 3. Hết hạn
    if (new Date(row.expires_at).getTime() < Date.now()) {
        return res.status(400).json({ error: 'Mã OTP đã hết hạn' })
    }

    // 4. Sai quá nhiều lần
    if (row.wrong_attempts >= 5) {
        return res.status(400).json({ error: 'Quá nhiều lần thử sai' })
    }

    // 5. So sánh mã (cùng kiểu text — code đã coerce String ở trên)
    if (code !== row.code) {
        await sb
            .from('otp_codes')
            .update({ wrong_attempts: row.wrong_attempts + 1 })
            .eq('id', row.id)
        return res.status(400).json({ error: 'Mã OTP không đúng' })
    }

    // 6. Lấy users.id (KHÔNG dùng Auth UUID)
    const { data: user, error: userErr } = await sb
        .from('users')
        .select('id, role')
        .eq('sdt', sdt)
        .maybeSingle()
    if (userErr) {
        return res.status(500).json({ error: userErr.message })
    }
    if (!user) {
        return res.status(400).json({ error: 'Số điện thoại không tồn tại' })
    }

    // 7. Đánh dấu mã đã dùng
    const { error: usedErr } = await sb
        .from('otp_codes')
        .update({ used: true })
        .eq('id', row.id)
    if (usedErr) {
        return res.status(500).json({ error: usedErr.message })
    }

    // 8. Tạo session token
    const token = crypto.randomBytes(32).toString('hex')

    // 9. INSERT sessions
    const { error: sessErr } = await sb
        .from('sessions')
        .insert({ token, user_id: user.id })
    if (sessErr) {
        return res.status(500).json({ error: sessErr.message })
    }

    // 10. Trả token về client
    return res.status(200).json({ ok: true, token, role: user.role })
}

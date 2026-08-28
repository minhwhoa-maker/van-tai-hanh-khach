import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
    // 1. Check req.method !== 'POST' → 405
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    // 2. Validate
    let { token } = req.body || {}
    if (typeof token !== 'string' || !token.trim()) {
        return res.status(400).json({ error: 'Thiếu token' })
    }
    token = token.trim()

    // Initialize Supabase client
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

    // 3. Query sessions join users
    const { data, error } = await sb
        .from('sessions')
        .select('user_id, users!user_id(id, role, full_name, sdt, owner_id)')
        .eq('token', token)
        .maybeSingle()

    if (error) {
        return res.status(500).json({ error: 'Lỗi server' })
    }

    if (!data) {
        return res.status(401).json({ error: 'Session không hợp lệ' })
    }

    // 4. Return 200: data.users
    return res.status(200).json(data.users)
}

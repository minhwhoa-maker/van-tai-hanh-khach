// api/cong-khai-xac-thuc-otp.js (POST, body {sdt, ma_otp}) — xác thực mã OTP đã gửi qua
// api/cong-khai-gui-otp.js. Đúng mã → set dat_ve_otp.da_dung=true + xac_thuc_luc=now(), làm mốc
// cho api/cong-khai-dat-ve.js kiểm tra lại (server tự tin cậy DB, không tin cờ "đã verify" từ
// client) — xem SPEC "OTP bắt buộc mọi lượt đặt vé" trong CLAUDE.md.
import { createClient } from '@supabase/supabase-js'

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

    const { sdt, ma_otp } = req.body || {}
    const sdtChuan = chuanHoaSdt(sdt)
    if (!laSdtHopLe(sdtChuan)) { res.status(400).json({ error: 'Số điện thoại không hợp lệ' }); return }
    const maSach = (ma_otp || '').trim()
    if (!/^\d{6}$/.test(maSach)) { res.status(400).json({ error: 'Mã xác thực phải gồm 6 số' }); return }

    const sbAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

    // Lấy dòng OTP MỚI NHẤT của SĐT này chưa dùng, chưa hết hạn — mã cũ hơn (nếu khách bấm gửi
    // lại nhiều lần) không còn hiệu lực dù chưa hết 5 phút.
    const { data: row, error: findErr } = await sbAdmin
        .from('dat_ve_otp').select('id, ma_otp, het_han, so_lan_sai')
        .eq('sdt', sdtChuan).eq('da_dung', false)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (findErr) { res.status(500).json({ error: findErr.message }); return }

    if (!row || new Date(row.het_han).getTime() < Date.now()) {
        res.status(400).json({ error: 'Mã hết hạn, gửi lại' }); return
    }
    if (row.so_lan_sai >= 5) {
        res.status(400).json({ error: 'Nhập sai quá nhiều, gửi lại mã mới' }); return
    }

    if (row.ma_otp !== maSach) {
        await sbAdmin.from('dat_ve_otp').update({ so_lan_sai: row.so_lan_sai + 1 }).eq('id', row.id)
        const conLai = 5 - (row.so_lan_sai + 1)
        res.status(400).json({ error: conLai > 0 ? `Mã không đúng, còn ${conLai} lần thử` : 'Nhập sai quá nhiều, gửi lại mã mới' }); return
    }

    const { error: updErr } = await sbAdmin
        .from('dat_ve_otp').update({ da_dung: true, xac_thuc_luc: new Date().toISOString() }).eq('id', row.id)
    if (updErr) { res.status(500).json({ error: updErr.message }); return }

    res.status(200).json({ ok: true })
}

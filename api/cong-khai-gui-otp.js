// api/cong-khai-gui-otp.js (POST, body {sdt, kenh}) — gửi mã OTP 6 số xác thực SĐT trước khi đặt
// vé công khai ở dat-ve.html. TÁCH BIỆT HOÀN TOÀN với auth crew (`auth.users`/Zalo Login OAuth) —
// bảng `dat_ve_otp` chỉ phục vụ xác thực SĐT khách, không liên quan đăng nhập. Xem SPEC "OTP bắt
// buộc mọi lượt đặt vé" trong CLAUDE.md.
//
// chuanHoaSdt/laSdtHopLe COPY từ api/doi-chieu-sdt.js — cố ý KHÔNG import chéo giữa các route
// serverless độc lập (convention chung của app).
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

function sinhMaOtp() {
    return String(Math.floor(100000 + Math.random() * 900000))
}

// Zalo ZNS (Zalo Notification Service) — KHÁC HẲN Zalo Login OAuth đã có ở api/zalo-login.js/
// api/zalo-callback.js (đó là đăng nhập crew, cái này là gửi tin nhắn mẫu đã duyệt). Cần
// ZALO_OA_ACCESS_TOKEN (access token của Official Account, có hạn, thường refresh định kỳ) +
// ZALO_ZNS_TEMPLATE_ID (mẫu tin OTP đã được Zalo duyệt nội dung trước) — 2 env này CHƯA có, owner
// phải đăng ký ZNS template trước (xem CLAUDE.md mục OTP). Throw lỗi RÕ RÀNG thay vì fail âm thầm
// nếu thiếu env, để dễ debug khi bật kênh này lên mà quên set.
async function guiOtpZalo(sdt, ma) {
    const accessToken = process.env.ZALO_OA_ACCESS_TOKEN
    const templateId = process.env.ZALO_ZNS_TEMPLATE_ID
    if (!accessToken || !templateId) {
        throw new Error('Kênh Zalo chưa cấu hình (thiếu ZALO_OA_ACCESS_TOKEN/ZALO_ZNS_TEMPLATE_ID)')
    }
    const resp = await fetch('https://business.openapi.zalo.me/message/template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', access_token: accessToken },
        body: JSON.stringify({
            phone: sdt,
            template_id: templateId,
            template_data: { otp: ma }
        })
    })
    const data = await resp.json()
    if (data.error && data.error !== 0) {
        throw new Error(`Zalo ZNS lỗi: ${data.message || data.error}`)
    }
}

// SMS Brandname — tên hàm để generic, chưa gắn nhà cung cấp cụ thể (owner chưa chốt eSMS/
// SpeedSMS/nhà mạng). SMS_PROVIDER_API_KEY/SMS_PROVIDER_BRANDNAME là placeholder tên env, ĐỔI LẠI
// theo đúng tên biến nhà cung cấp thật khi tích hợp — hiện throw lỗi rõ ràng để không fail âm thầm.
async function guiOtpSms(sdt, ma) {
    const apiKey = process.env.SMS_PROVIDER_API_KEY
    if (!apiKey) {
        throw new Error('Kênh SMS chưa cấu hình (chưa chọn nhà cung cấp SMS Brandname)')
    }
    throw new Error('Kênh SMS chưa tích hợp xong (chờ owner chốt nhà cung cấp)')
}

export default async function handler(req, res) {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

    const { sdt, kenh } = req.body || {}
    const sdtChuan = chuanHoaSdt(sdt)
    if (!laSdtHopLe(sdtChuan)) { res.status(400).json({ error: 'Số điện thoại không hợp lệ' }); return }
    if (kenh !== 'zalo' && kenh !== 'sms') { res.status(400).json({ error: 'Vui lòng chọn kênh nhận mã' }); return }

    const sbAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

    // Rate limit chống lạm dụng chi phí (mỗi lần gửi tốn tiền thật ở cả 2 kênh) — đếm số lần đã
    // GỬI (không phải xác thực) trong 10 phút và 24h gần nhất cho đúng SĐT này.
    const now = Date.now()
    const muoiPhutTruoc = new Date(now - 10 * 60 * 1000).toISOString()
    const motNgayTruoc = new Date(now - 24 * 60 * 60 * 1000).toISOString()

    const { count: dem10Phut, error: dem10Err } = await sbAdmin
        .from('dat_ve_otp').select('id', { count: 'exact', head: true })
        .eq('sdt', sdtChuan).gte('created_at', muoiPhutTruoc)
    if (dem10Err) { res.status(500).json({ error: dem10Err.message }); return }
    if ((dem10Phut || 0) >= 3) { res.status(429).json({ error: 'Gửi quá nhiều lần, thử lại sau' }); return }

    const { count: dem24h, error: dem24hErr } = await sbAdmin
        .from('dat_ve_otp').select('id', { count: 'exact', head: true })
        .eq('sdt', sdtChuan).gte('created_at', motNgayTruoc)
    if (dem24hErr) { res.status(500).json({ error: dem24hErr.message }); return }
    if ((dem24h || 0) >= 10) { res.status(429).json({ error: 'Số điện thoại này đã bị khoá gửi mã trong hôm nay' }); return }

    const maOtp = sinhMaOtp()
    const hetHan = new Date(now + 5 * 60 * 1000).toISOString()

    const { error: insErr } = await sbAdmin.from('dat_ve_otp').insert({
        sdt: sdtChuan, ma_otp: maOtp, kenh, het_han: hetHan
    })
    if (insErr) { res.status(500).json({ error: insErr.message }); return }

    // OTP_TEST_MODE — bỏ qua bước gửi thật (Zalo ZNS/SMS Brandname CHƯA có credential thật lúc
    // viết tính năng này), dùng để test hết luồng đặt vé mà không phải chờ 2 cái đó xong. So sánh
    // ĐÚNG CHUỖI 'true' (KHÔNG dùng truthy-check trần) — env var Vercel luôn là string, set
    // "false" mà check truthy sẽ bị coi là BẬT, đây là bug rất dễ mắc. Mặc định KHÔNG set biến này
    // ở đâu cả → hành vi y hệt trước (gọi thật, throw nếu chưa cấu hình). Dòng OTP đã INSERT xong
    // ở trên (trước khối này) bất kể test mode bật hay tắt — mã vẫn tồn tại trong DB để tra tay.
    // ⚠️ PHẢI xoá/set về false ở Vercel Production TRƯỚC KHI cho khách thật dùng dat-ve.html — xem
    // CLAUDE.md mục "TODO trước khi go-live".
    if (process.env.OTP_TEST_MODE === 'true') {
        console.log(`[OTP_TEST_MODE] Bỏ qua gửi thật cho ${sdtChuan}, kenh=${kenh}`)
    } else {
        try {
            if (kenh === 'zalo') await guiOtpZalo(sdtChuan, maOtp)
            else await guiOtpSms(sdtChuan, maOtp)
        } catch (err) {
            console.error('[gui-otp] Lỗi gửi mã:', err.message)
            res.status(502).json({ error: 'Không gửi được mã, thử lại hoặc chọn kênh khác' }); return
        }
    }

    // KHÔNG BAO GIỜ trả mã OTP trong response — chỉ báo đã gửi thành công.
    res.status(200).json({ ok: true })
}

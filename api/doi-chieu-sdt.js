// api/doi-chieu-sdt.js — đọc/đối chiếu SĐT người nhận viết tay trên ảnh kiện hàng, dùng model
// OCR chuyên dụng qwen-vl-ocr qua Alibaba Cloud Model Studio (DashScope). 2 mode:
//   - 'compare': đối chiếu SĐT đã gõ tay với ảnh đã upload (anh_url), xử lý theo LÔ nhiều kiện
//     — dùng bởi nút "🔍 Đối chiếu SĐT bằng AI" ở manifest-hang.html. Xem CLAUDE.md mục đó để
//     biết lý do chia lô (tránh timeout serverless) và cách chọn kích thước lô.
//   - 'read': đọc SĐT trực tiếp từ ảnh CHƯA upload (base64), dùng bởi hang.html bước 3 ngay lúc
//     chụp ảnh để tự điền #kien-sdt — chạy nền, có timeout ngắn (8s) vì đây là lệnh gọi phụ trợ
//     không được chặn/làm chậm crew đang thao tác tiếp.
// Xử lý TUẦN TỰ từng ảnh trong 1 lô 'compare', lỗi 1 item không chặn các item còn lại.

const DASHSCOPE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions'
const PROMPT_TEXT = 'Đọc số điện thoại viết tay trên kiện hàng trong ảnh này. Trả lời CHỈ bằng chuỗi số (không khoảng trắng, không dấu gạch, không giải thích gì thêm). Nếu không thấy số điện thoại nào trên ảnh, trả lời đúng 1 từ: KHONG_DOC_DUOC.'

function chuanHoaSdt(s) {
    let d = (s || '').replace(/\D/g, '')
    if (d.startsWith('84')) {
        const rest = d.slice(2)
        d = rest.startsWith('0') ? rest : '0' + rest
    }
    return d
}

async function docSdtTuAnh(imageUrl, apiKey, timeoutMs) {
    const controller = timeoutMs ? new AbortController() : null
    const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null
    try {
        const res = await fetch(DASHSCOPE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'qwen-vl-ocr',
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: PROMPT_TEXT },
                        { type: 'image_url', image_url: { url: imageUrl } }
                    ]
                }]
            }),
            signal: controller?.signal
        })
        if (!res.ok) {
            const bodyText = await res.text().catch(() => '')
            throw new Error(`DashScope HTTP ${res.status}: ${bodyText.slice(0, 500)}`)
        }
        const data = await res.json()
        const raw = (data?.choices?.[0]?.message?.content || '').trim()
        if (raw === 'KHONG_DOC_DUOC') return { khong_doc_duoc: true }
        return { sdt_ai_doc: raw }
    } finally {
        if (timer) clearTimeout(timer)
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

    const apiKey = process.env.DASHSCOPE_API_KEY
    if (!apiKey) { res.status(500).json({ error: 'Thiếu DASHSCOPE_API_KEY trên server' }); return }

    const mode = req.body?.mode === 'read' ? 'read' : 'compare'

    if (mode === 'read') {
        const { anh_base64, mime_type } = req.body || {}
        if (!anh_base64) { res.status(400).json({ error: 'Thiếu anh_base64' }); return }
        const dataUrl = anh_base64.startsWith('data:') ? anh_base64 : `data:${mime_type || 'image/jpeg'};base64,${anh_base64}`
        try {
            const { sdt_ai_doc, khong_doc_duoc } = await docSdtTuAnh(dataUrl, apiKey, 8000)
            res.status(200).json(khong_doc_duoc ? { khong_doc_duoc: true } : { sdt_ai_doc })
        } catch (err) {
            console.error('[doi-chieu-sdt:read]', err.message)
            res.status(200).json({ loi: true })
        }
        return
    }

    // mode 'compare' — hành vi cũ, giữ nguyên 100%.
    const items = Array.isArray(req.body?.items) ? req.body.items : []
    if (!items.length) { res.status(400).json({ error: 'Thiếu items' }); return }

    const ketQua = []
    for (const item of items) {
        const { kien_id, anh_url, sdt_da_nhap } = item
        try {
            const { sdt_ai_doc, khong_doc_duoc } = await docSdtTuAnh(anh_url, apiKey)
            if (khong_doc_duoc) {
                ketQua.push({ kien_id, khong_doc_duoc: true, khop: false })
            } else {
                const khop = chuanHoaSdt(sdt_ai_doc) === chuanHoaSdt(sdt_da_nhap)
                ketQua.push({ kien_id, sdt_ai_doc, khop })
            }
        } catch (err) {
            console.error('[doi-chieu-sdt:compare]', kien_id, err.message)
            ketQua.push({ kien_id, loi: true })
        }
    }

    res.status(200).json({ ketQua })
}

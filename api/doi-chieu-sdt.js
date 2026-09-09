// api/doi-chieu-sdt.js — đối chiếu SĐT người nhận gõ tay với số viết tay trên ảnh kiện hàng,
// dùng model OCR chuyên dụng qwen-vl-ocr qua Alibaba Cloud Model Studio (DashScope).
// Nhận 1 LÔ NHỎ kiện mỗi lần gọi (client tự chia lô) — xem CLAUDE.md mục "Đối chiếu SĐT bằng AI"
// để biết lý do chia lô (tránh timeout serverless) và cách chọn kích thước lô.
// Xử lý TUẦN TỰ từng ảnh trong lô, lỗi 1 item không chặn các item còn lại trong CÙNG lô.

const DASHSCOPE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions'

function chuanHoaSdt(s) {
    let d = (s || '').replace(/\D/g, '')
    if (d.startsWith('84')) {
        const rest = d.slice(2)
        d = rest.startsWith('0') ? rest : '0' + rest
    }
    return d
}

async function docSdtTuAnh(anhUrl, apiKey) {
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
                    { type: 'text', text: 'Đọc số điện thoại viết tay trên kiện hàng trong ảnh này. Trả lời CHỈ bằng chuỗi số (không khoảng trắng, không dấu gạch, không giải thích gì thêm). Nếu không thấy số điện thoại nào trên ảnh, trả lời đúng 1 từ: KHONG_DOC_DUOC.' },
                    { type: 'image_url', image_url: { url: anhUrl } }
                ]
            }]
        })
    })
    if (!res.ok) {
        const bodyText = await res.text().catch(() => '')
        throw new Error(`DashScope HTTP ${res.status}: ${bodyText.slice(0, 500)}`)
    }
    const data = await res.json()
    const raw = (data?.choices?.[0]?.message?.content || '').trim()
    if (raw === 'KHONG_DOC_DUOC') return { khong_doc_duoc: true }
    return { sdt_ai_doc: raw }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

    const apiKey = process.env.DASHSCOPE_API_KEY
    if (!apiKey) { res.status(500).json({ error: 'Thiếu DASHSCOPE_API_KEY trên server' }); return }

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
            console.error('[doi-chieu-sdt]', kien_id, err.message)
            ketQua.push({ kien_id, loi: true })
        }
    }

    res.status(200).json({ ketQua })
}

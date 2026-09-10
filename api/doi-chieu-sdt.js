// api/doi-chieu-sdt.js — đọc/đối chiếu SĐT người nhận viết tay trên ảnh kiện hàng, dùng model
// OCR chuyên dụng qwen-vl-ocr qua Alibaba Cloud Model Studio (DashScope). 2 mode:
//   - 'compare': đối chiếu SĐT đã gõ tay với ảnh đã upload (anh_url), xử lý theo LÔ nhiều kiện
//     (`items: [{kien_id, anh_url, sdt_da_nhap}]`) — dùng bởi nút "🔍 Đối chiếu SĐT bằng AI" ở
//     manifest-hang.html cho kiện ĐÃ CÓ sdt_da_nhap. Xem CLAUDE.md mục đó để biết lý do chia lô
//     (tránh timeout serverless) và cách chọn kích thước lô.
//   - 'read': đọc SĐT, KHÔNG so khớp gì (không có sdt_da_nhap) — 2 hình thức input tuỳ nơi gọi:
//     (a) `{anh_base64, mime_type}` — 1 ảnh CHƯA upload (base64), dùng bởi hang.html bước 3 ngay
//         lúc chụp ảnh để tự điền #kien-sdt, chạy nền, timeout ngắn (8s) vì là lệnh gọi phụ trợ
//         không được chặn/làm chậm crew đang thao tác tiếp;
//     (b) `items: [{kien_id, anh_url}]` — LÔ nhiều kiện ĐÃ có anh_url (đã upload), dùng bởi
//         manifest-hang.html cho kiện thiếu hẳn nguoi_nhan_sdt (không có gì để so khớp qua mode
//         'compare') — cùng lô 'read' này với (a) chỉ khác input, không phải mode riêng.
// Xử lý TUẦN TỰ từng ảnh trong 1 lô ('compare' hoặc 'read' dạng items), lỗi 1 item không chặn
// các item còn lại.
//
// Độ tin cậy đọc số — 2 lớp phòng vệ (phát hiện sau khi test batch thật gặp: cùng 1 ảnh đọc ra
// 2 số KHÁC NHAU giữa các lần gọi, và 1 lần model trả về chuỗi 13 số không thể là SĐT VN nhưng
// vẫn lọt ra UI như gợi ý hợp lệ):
//   1. `temperature: 0` trong request DashScope — giảm ngẫu nhiên, đọc cùng 1 ảnh nhiều lần ra
//      cùng 1 kết quả (không đảm bảo ĐÚNG, chỉ đảm bảo NHẤT QUÁN — cần thiết để self-consistency
//      ở lớp 3 có ý nghĩa).
//   2. `laSdtHopLe()` validate CỨNG sau `chuanHoaSdt()` — đúng 10 số, đầu số di động VN hợp lệ
//      (03/05/07/08/09). Không khớp → LUÔN coi như không đọc được, bất kể model "tự tin" thế
//      nào — áp dụng ở server (không phải chỉ client) nên nhánh gọi thẳng từ hang.html cũng được
//      bảo vệ.
//   3. `docSdtTinCay()` gọi model 2 LẦN cho cùng 1 ảnh, so kết quả sau chuẩn hoá — khớp nhau mới
//      trả về như kết quả đáng tin; lệch nhau (hoặc chỉ 1 trong 2 lần đọc ra số hợp lệ) → trả
//      `khong_chac: true` kèm cả 2 lần đọc, KHÔNG tự chọn liều 1 trong 2. Chi phí tăng gấp đôi
//      nhưng vẫn không đáng kể (~$0.0003/ảnh).

const DASHSCOPE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions'
const PROMPT_TEXT = 'Trong ảnh có 1 số điện thoại di động Việt Nam viết tay (10 chữ số, bắt đầu bằng 03/05/07/08/09). Đọc CHÍNH XÁC từng chữ số viết tay trong ảnh, không tự suy luận hay "làm tròn" thành 1 số nghe hợp lý nếu nét chữ không rõ ràng. Chú ý các cặp chữ số viết tay dễ nhầm: 3 và 8, 4 và 9, 1 và 7, 0 và 6. Nếu không chắc chắn về BẤT KỲ chữ số nào, hoặc ảnh không có số điện thoại nào, trả lời "KHONG_DOC_DUOC". Nếu đọc được, CHỈ trả về đúng 10 chữ số, không thêm khoảng trắng, dấu chấm, hay chữ giải thích nào khác.'

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
                temperature: 0,
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
        const chuan = chuanHoaSdt(raw)
        if (!laSdtHopLe(chuan)) return { khong_doc_duoc: true } // sai định dạng → coi như không đọc được, không lộ ra UI
        return { sdt_ai_doc: chuan }
    } finally {
        if (timer) clearTimeout(timer)
    }
}

// Gọi model 2 LẦN cho cùng 1 ảnh, chỉ tin kết quả nếu cả 2 lần khớp nhau — xem ghi chú lớp 3 ở
// đầu file. Lỗi mạng/timeout ở 1 trong 2 lần gọi → coi cả phép thử là lỗi (`loi: true`), không
// cố gọi bù — giữ đơn giản, lỗi mạng vốn đã hiếm và không nên kéo dài thêm latency để retry.
async function docSdtTinCay(imageUrl, apiKey, timeoutMs) {
    const [a, b] = await Promise.all([
        docSdtTuAnh(imageUrl, apiKey, timeoutMs),
        docSdtTuAnh(imageUrl, apiKey, timeoutMs)
    ])
    if (a.khong_doc_duoc && b.khong_doc_duoc) return { khong_doc_duoc: true }
    if (a.sdt_ai_doc && b.sdt_ai_doc && a.sdt_ai_doc === b.sdt_ai_doc) return { sdt_ai_doc: a.sdt_ai_doc }
    // 1 trong 2 đọc ra số, 1 không, HOẶC cả 2 đọc ra nhưng khác nhau — không đủ tin cậy để chọn
    // liều 1 bên, trả về cả 2 để hiển thị "không chắc" thay vì tự quyết định thay crew.
    return { khong_chac: true, sdt_lan_1: a.sdt_ai_doc || null, sdt_lan_2: b.sdt_ai_doc || null }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

    const apiKey = process.env.DASHSCOPE_API_KEY
    if (!apiKey) { res.status(500).json({ error: 'Thiếu DASHSCOPE_API_KEY trên server' }); return }

    const mode = req.body?.mode === 'read' ? 'read' : 'compare'

    if (mode === 'read') {
        const readItems = Array.isArray(req.body?.items) ? req.body.items : null

        // Dạng (b): lô nhiều kiện đã có anh_url (manifest-hang.html, kiện thiếu hẳn SĐT) — cùng
        // pattern xử lý tuần tự + lỗi từng item như mode 'compare', chỉ khác không có khop.
        if (readItems) {
            if (!readItems.length) { res.status(400).json({ error: 'Thiếu items' }); return }
            const ketQua = []
            for (const item of readItems) {
                const { kien_id, anh_url } = item
                try {
                    const kq = await docSdtTinCay(anh_url, apiKey)
                    ketQua.push({ kien_id, ...kq })
                } catch (err) {
                    console.error('[doi-chieu-sdt:read-batch]', kien_id, err.message)
                    ketQua.push({ kien_id, loi: true })
                }
            }
            res.status(200).json({ ketQua })
            return
        }

        // Dạng (a): 1 ảnh chưa upload (hang.html) — timeout 8s/lần gọi (x2 lần ~16s tối đa,
        // vẫn chạy nền không chặn UI).
        const { anh_base64, mime_type } = req.body || {}
        if (!anh_base64) { res.status(400).json({ error: 'Thiếu anh_base64 hoặc items' }); return }
        const dataUrl = anh_base64.startsWith('data:') ? anh_base64 : `data:${mime_type || 'image/jpeg'};base64,${anh_base64}`
        try {
            const kq = await docSdtTinCay(dataUrl, apiKey, 8000)
            res.status(200).json(kq)
        } catch (err) {
            console.error('[doi-chieu-sdt:read]', err.message)
            res.status(200).json({ loi: true })
        }
        return
    }

    // mode 'compare' — so khớp SĐT đã gõ tay với ảnh, có self-consistency + validate như 'read'.
    const items = Array.isArray(req.body?.items) ? req.body.items : []
    if (!items.length) { res.status(400).json({ error: 'Thiếu items' }); return }

    const ketQua = []
    for (const item of items) {
        const { kien_id, anh_url, sdt_da_nhap } = item
        try {
            const kq = await docSdtTinCay(anh_url, apiKey)
            if (kq.khong_doc_duoc) {
                ketQua.push({ kien_id, khong_doc_duoc: true, khop: false })
            } else if (kq.khong_chac) {
                ketQua.push({ kien_id, ...kq, khop: false })
            } else {
                const khop = kq.sdt_ai_doc === chuanHoaSdt(sdt_da_nhap)
                ketQua.push({ kien_id, sdt_ai_doc: kq.sdt_ai_doc, khop })
            }
        } catch (err) {
            console.error('[doi-chieu-sdt:compare]', kien_id, err.message)
            ketQua.push({ kien_id, loi: true })
        }
    }

    res.status(200).json({ ketQua })
}

// api/doi-chieu-sdt.js — đọc/đối chiếu SĐT người gửi + người nhận viết tay trên ảnh kiện hàng,
// dùng model OCR chuyên dụng qwen3.5-ocr qua Alibaba Cloud Model Studio (DashScope). 2 mode:
//   - 'compare': đối chiếu SĐT NGƯỜI NHẬN đã gõ tay với ảnh đã upload (anh_url), xử lý theo LÔ
//     nhiều kiện (`items: [{kien_id, anh_url, sdt_da_nhap}]`) — dùng bởi nút "🔍 Đối chiếu SĐT
//     bằng AI" ở manifest-hang.html cho kiện ĐÃ CÓ sdt_da_nhap (người nhận). SĐT người gửi KHÔNG
//     có gì để so khớp ở nhánh này (chưa có sdt_da_nhap của người gửi) nhưng response VẪN trả
//     kèm kết quả đọc người gửi — xem "Response shape" bên dưới, đây là điểm quan trọng để nhánh
//     compare (đa số kiện thật, đã có sẵn SĐT người nhận) cũng sinh ra gợi ý SĐT người gửi.
//   - 'read': đọc SĐT (cả 2 vai trò), KHÔNG so khớp gì — 2 hình thức input tuỳ nơi gọi:
//     (a) `{anh_base64, mime_type}` — 1 ảnh CHƯA upload (base64), dùng bởi hang.html bước 3 ngay
//         lúc chụp ảnh để tự điền #kien-sdt + #kien-nguoi-gui-sdt, chạy nền, timeout ngắn (8s) vì
//         là lệnh gọi phụ trợ không được chặn/làm chậm crew đang thao tác tiếp;
//     (b) `items: [{kien_id, anh_url}]` — LÔ nhiều kiện ĐÃ có anh_url (đã upload), dùng bởi
//         manifest-hang.html cho kiện thiếu hẳn nguoi_nhan_sdt (không có gì để so khớp qua mode
//         'compare') — cùng lô 'read' này với (a) chỉ khác input, không phải mode riêng.
// Xử lý TUẦN TỰ từng ảnh trong 1 lô ('compare' hoặc 'read' dạng items), lỗi 1 item không chặn
// các item còn lại.
//
// Response shape — tách riêng 2 vai trò, KHÔNG còn field `sdt_ai_doc` phẳng ở gốc:
//   { nguoi_nhan: <role-result>, nguoi_gui: <role-result> }
// <role-result> là 1 trong 3 dạng (giống hệt shape cũ, chỉ khác giờ lồng theo vai trò):
//   { sdt_ai_doc }                              — đọc được, tin cậy
//   { khong_doc_duoc: true }                    — không đọc được / sai định dạng
//   { khong_chac: true, sdt_lan_1, sdt_lan_2 }  — 2 lần gọi model không thống nhất
// Ở mode 'compare', `nguoi_nhan` có thêm field `khop` (so với sdt_da_nhap); `nguoi_gui` không có
// `khop` (không có gì để so).
//
// Độ tin cậy đọc số — 3 lớp phòng vệ (phát hiện sau khi test batch thật gặp: cùng 1 ảnh đọc ra
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
//      nhưng vẫn không đáng kể (~$0.0003/ảnh). Áp dụng ĐỘC LẬP cho từng vai trò — 2 lần gọi có
//      thể thống nhất ở người nhận nhưng không chắc ở người gửi (hoặc ngược lại), mỗi vai trò tự
//      có trạng thái tin cậy riêng.
//
// HẠN CHẾ ĐÃ BIẾT, KHÔNG THUỘC PHẠM VI SỬA Ở ĐÂY: gán NHẦM vai trò (đọc đúng cả 2 số, nhưng gán
// ngược người gửi ↔ người nhận) là lỗi ngữ nghĩa — cả 2 số vẫn hợp lệ về định dạng, `laSdtHopLe`
// không bắt được, và vì `temperature: 0` khiến model gần như quyết định nên nếu model nhất quán
// gán nhầm thì cả 2 lần gọi self-consistency vẫn khớp nhau (đồng ý với chính lỗi của nó). Đây là
// lý do KHÔNG cho phép tự động ghi thẳng DB cho SĐT người gửi (xem CLAUDE.md/manifest-hang.html).

// Domain theo workspace (khuyến nghị Alibaba thay cho domain chung dashscope-intl.aliyuncs.com cũ)
// — bắt buộc để gọi được model qwen3.5-ocr, domain cũ trả 404 model_not_found dù model tồn tại.
const DASHSCOPE_URL = 'https://ws-snuz1pka1sqyqip2.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions'

// Yêu cầu model trả đúng 2 dòng theo thứ tự cố định — chọn format 2-dòng-cố-định thay vì JSON để
// giữ gần nhất có thể với sentinel đơn giản cũ (đã chứng minh ổn định với model OCR chuyên dụng
// này) — JSON có nguy cơ model thêm markdown code-fence/giải thích thừa, khó parse tin cậy hơn.
const PROMPT_TEXT = [
    'Trong ảnh là 1 nhãn kiện hàng có thể chứa TỐI ĐA 2 số điện thoại di động Việt Nam viết tay',
    '(mỗi số 10 chữ số, bắt đầu bằng 03/05/07/08/09): 1 số của NGƯỜI GỬI, 1 số của NGƯỜI NHẬN.',
    'Đọc CHÍNH XÁC từng chữ số viết tay, không tự suy luận hay "làm tròn" thành số nghe hợp lý',
    'nếu nét chữ không rõ ràng. Chú ý các cặp chữ số viết tay dễ nhầm: 3 và 8, 4 và 9, 1 và 7, 0',
    'và 6.',
    'Nếu ảnh có nhãn chữ ghi rõ vai trò (vd "Người gửi"/"Gửi"/"NG", "Người nhận"/"Nhận"/"NN"),',
    'luôn gán số theo đúng nhãn đó, không suy diễn thêm.',
    'Nếu ảnh CHỈ có ĐÚNG 1 số điện thoại duy nhất và KHÔNG có nhãn nào cho số đó: mặc định đây là',
    'số NGƯỜI NHẬN (vì thực tế đa số nhãn dán kiện hàng chỉ ghi 1 số để gọi lúc giao) — trả',
    'NGUOI_GUI là "KHONG_XAC_DINH".',
    'Nếu ảnh có TỪ 2 số trở lên mà không có nhãn phân biệt rõ số nào của ai: trả CẢ NGUOI_GUI lẫn',
    'NGUOI_NHAN là "KHONG_XAC_DINH" — TUYỆT ĐỐI KHÔNG đoán vai trò theo vị trí hay thứ tự viết',
    'trước/sau trong trường hợp này, vì gán nhầm vai trò nguy hiểm hơn không đọc được số.',
    'Nếu không đọc được / không có số nào cho 1 vai trò → "KHONG_XAC_DINH" cho đúng dòng đó,',
    'không đoán bừa để lấp đầy.',
    'Trả lời CHÍNH XÁC đúng 2 dòng theo mẫu sau, không thêm chữ giải thích/markdown nào khác:',
    'NGUOI_GUI: <10 chữ số hoặc KHONG_XAC_DINH>',
    'NGUOI_NHAN: <10 chữ số hoặc KHONG_XAC_DINH>'
].join(' ')

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

// Chuẩn hoá + validate 1 giá trị thô (chuỗi số hoặc "KHONG_XAC_DINH") thành 1 role-result.
function chuanHoaKetQuaVaiTro(raw) {
    if (!raw || raw.trim().toUpperCase() === 'KHONG_XAC_DINH') return { khong_doc_duoc: true }
    const chuan = chuanHoaSdt(raw)
    if (!laSdtHopLe(chuan)) return { khong_doc_duoc: true } // sai định dạng → coi như không đọc được, không lộ ra UI
    return { sdt_ai_doc: chuan }
}

// Parse output 2 dòng cố định của model thành { nguoi_gui: <role-result>, nguoi_nhan: <role-result> }.
// Không giả định thứ tự dòng tuyệt đối khớp — tìm theo tiền tố từng dòng, phòng model lỡ đảo
// thứ tự hoặc thêm dòng trống. Không tìm thấy dòng nào → coi vai trò đó là không đọc được.
function parseKetQua2VaiTro(raw) {
    const lines = (raw || '').split('\n')
    const layGiaTri = prefix => {
        const dong = lines.find(l => l.trim().toUpperCase().startsWith(prefix))
        if (!dong) return null
        return dong.slice(dong.indexOf(':') + 1).trim()
    }
    return {
        nguoi_gui: chuanHoaKetQuaVaiTro(layGiaTri('NGUOI_GUI')),
        nguoi_nhan: chuanHoaKetQuaVaiTro(layGiaTri('NGUOI_NHAN'))
    }
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
                model: 'qwen3.5-ocr',
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
        return parseKetQua2VaiTro(raw)
    } finally {
        if (timer) clearTimeout(timer)
    }
}

// Gộp 2 lần đọc CỦA CÙNG 1 VAI TRÒ thành 1 role-result đáng tin hay không — logic self-consistency
// tách ra thành hàm riêng để áp dụng ĐỘC LẬP cho người gửi và người nhận (1 vai trò có thể thống
// nhất giữa 2 lần gọi trong khi vai trò kia không).
function gopKetQuaVaiTro(a, b) {
    if (a.khong_doc_duoc && b.khong_doc_duoc) return { khong_doc_duoc: true }
    if (a.sdt_ai_doc && b.sdt_ai_doc && a.sdt_ai_doc === b.sdt_ai_doc) return { sdt_ai_doc: a.sdt_ai_doc }
    // 1 trong 2 đọc ra số, 1 không, HOẶC cả 2 đọc ra nhưng khác nhau — không đủ tin cậy để chọn
    // liều 1 bên, trả về cả 2 để hiển thị "không chắc" thay vì tự quyết định thay crew.
    return { khong_chac: true, sdt_lan_1: a.sdt_ai_doc || null, sdt_lan_2: b.sdt_ai_doc || null }
}

// Gọi model 2 LẦN cho cùng 1 ảnh, gộp riêng từng vai trò — xem ghi chú lớp 3 ở đầu file. Lỗi
// mạng/timeout ở 1 trong 2 lần gọi → coi cả phép thử là lỗi (`loi: true`), không cố gọi bù — giữ
// đơn giản, lỗi mạng vốn đã hiếm và không nên kéo dài thêm latency để retry.
async function docSdtTinCay(imageUrl, apiKey, timeoutMs) {
    const [a, b] = await Promise.all([
        docSdtTuAnh(imageUrl, apiKey, timeoutMs),
        docSdtTuAnh(imageUrl, apiKey, timeoutMs)
    ])
    return {
        nguoi_gui: gopKetQuaVaiTro(a.nguoi_gui, b.nguoi_gui),
        nguoi_nhan: gopKetQuaVaiTro(a.nguoi_nhan, b.nguoi_nhan)
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

    const apiKey = process.env.DASHSCOPE_API_KEY
    if (!apiKey) { res.status(500).json({ error: 'Thiếu DASHSCOPE_API_KEY trên server' }); return }

    const mode = req.body?.mode === 'read' ? 'read' : 'compare'

    if (mode === 'read') {
        const readItems = Array.isArray(req.body?.items) ? req.body.items : null

        // Dạng (b): lô nhiều kiện đã có anh_url (manifest-hang.html, kiện thiếu hẳn SĐT người
        // nhận) — cùng pattern xử lý tuần tự + lỗi từng item như mode 'compare', chỉ khác không
        // có khop.
        if (readItems) {
            if (!readItems.length) { res.status(400).json({ error: 'Thiếu items' }); return }
            const ketQua = []
            for (const item of readItems) {
                const { kien_id, anh_url } = item
                try {
                    const kq = await docSdtTinCay(anh_url, apiKey)
                    ketQua.push({ kien_id, nguoi_nhan: kq.nguoi_nhan, nguoi_gui: kq.nguoi_gui })
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
            res.status(200).json({ nguoi_nhan: kq.nguoi_nhan, nguoi_gui: kq.nguoi_gui })
        } catch (err) {
            console.error('[doi-chieu-sdt:read]', err.message)
            res.status(200).json({ loi: true })
        }
        return
    }

    // mode 'compare' — so khớp SĐT NGƯỜI NHẬN đã gõ tay với ảnh, có self-consistency + validate
    // như 'read'. SĐT người gửi vẫn được đọc + trả kèm (không có `khop`, không có gì để so) — đa
    // số kiện thật đã có sẵn nguoi_nhan_sdt nên đi qua nhánh này, nếu bỏ dữ liệu người gửi ở đây
    // thì tính năng gợi ý SĐT người gửi ở manifest-hang.html sẽ chỉ có tác dụng cho thiểu số kiện
    // (nhóm thiếu hẳn SĐT người nhận, đi qua nhánh 'read' ở trên) — xem CLAUDE.md.
    const items = Array.isArray(req.body?.items) ? req.body.items : []
    if (!items.length) { res.status(400).json({ error: 'Thiếu items' }); return }

    const ketQua = []
    for (const item of items) {
        const { kien_id, anh_url, sdt_da_nhap } = item
        try {
            const kq = await docSdtTinCay(anh_url, apiKey)
            let nguoiNhan
            if (kq.nguoi_nhan.khong_doc_duoc) {
                nguoiNhan = { khong_doc_duoc: true, khop: false }
            } else if (kq.nguoi_nhan.khong_chac) {
                nguoiNhan = { ...kq.nguoi_nhan, khop: false }
            } else {
                nguoiNhan = { sdt_ai_doc: kq.nguoi_nhan.sdt_ai_doc, khop: kq.nguoi_nhan.sdt_ai_doc === chuanHoaSdt(sdt_da_nhap) }
            }
            ketQua.push({ kien_id, nguoi_nhan: nguoiNhan, nguoi_gui: kq.nguoi_gui })
        } catch (err) {
            console.error('[doi-chieu-sdt:compare]', kien_id, err.message)
            ketQua.push({ kien_id, loi: true })
        }
    }

    res.status(200).json({ ketQua })
}

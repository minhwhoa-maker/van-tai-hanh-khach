// scripts/so-sanh-model-ocr.js — so sánh độ chính xác đọc SĐT viết tay giữa qwen-vl-ocr (đang
// dùng trong api/doi-chieu-sdt.js) và qwen3.5-ocr (ứng viên, Alibaba quảng cáo chuyên tối ưu
// nội dung viết tay) — xem spec-so-sanh-model-ocr.md.
//
// Cách chạy:
//   DASHSCOPE_API_KEY=sk-... node scripts/so-sanh-model-ocr.js input.csv [output.csv]
//
// input.csv: 3 cột id,anh_url,nguoi_nhan_sdt — export từ Supabase SQL Editor theo query trong
// spec (CHỈ lấy kiện có nguoi_nhan_sdt do crew gõ tay xác nhận thật, xem lưu ý trong spec —
// KHÔNG lấy số do "⚡ Điền tất cả" tự động ghi, sẽ làm con số đo được vô nghĩa).
// output.csv (mặc định "ket-qua-so-sanh.csv"): chi tiết từng dòng cho cả 2 model, để tra lại.
//
// Gọi MỖI model ĐÚNG 1 LẦN/ảnh (không dùng self-consistency 2-lần-gọi như production) — mục
// đích ở đây là đo độ chính xác NỘI TẠI của từng model, không phải đo hiệu quả của lớp
// self-consistency (đã có sẵn trong api/doi-chieu-sdt.js, đo riêng nếu cần sau).

import { readFileSync, writeFileSync } from 'fs'

const DASHSCOPE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions'
// Giữ Y HỆT prompt đang dùng trong api/doi-chieu-sdt.js — nếu sửa 1 bên nhớ sửa cả 2, không
// import chung vì đây là script chạy tay 1 lần, không phải phần chạy production.
const PROMPT_TEXT = 'Trong ảnh có 1 số điện thoại di động Việt Nam viết tay (10 chữ số, bắt đầu bằng 03/05/07/08/09). Đọc CHÍNH XÁC từng chữ số viết tay trong ảnh, không tự suy luận hay "làm tròn" thành 1 số nghe hợp lý nếu nét chữ không rõ ràng. Chú ý các cặp chữ số viết tay dễ nhầm: 3 và 8, 4 và 9, 1 và 7, 0 và 6. Nếu không chắc chắn về BẤT KỲ chữ số nào, hoặc ảnh không có số điện thoại nào, trả lời "KHONG_DOC_DUOC". Nếu đọc được, CHỈ trả về đúng 10 chữ số, không thêm khoảng trắng, dấu chấm, hay chữ giải thích nào khác.'
const MODELS = ['qwen-vl-ocr', 'qwen3.5-ocr']

function chuanHoaSdt(s) {
    let d = (s || '').replace(/\D/g, '')
    if (d.startsWith('84')) {
        const rest = d.slice(2)
        d = rest.startsWith('0') ? rest : '0' + rest
    }
    return d
}

function laSdtHopLe(d) {
    return /^0(3|5|7|8|9)\d{8}$/.test(d)
}

// Parser CSV tối giản, hỗ trợ field trong dấu ngoặc kép (Supabase SQL Editor export có thể tự
// quote mọi cột text) — đủ dùng cho đúng 3 cột id/anh_url/nguoi_nhan_sdt, không cần thư viện.
function parseCsv(text) {
    const lines = text.split(/\r?\n/).filter(l => l.length)
    const parseLine = line => {
        const out = []
        let cur = '', trongQuote = false
        for (let i = 0; i < line.length; i++) {
            const c = line[i]
            if (trongQuote) {
                if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
                else if (c === '"') trongQuote = false
                else cur += c
            } else if (c === '"') trongQuote = true
            else if (c === ',') { out.push(cur); cur = '' }
            else cur += c
        }
        out.push(cur)
        return out
    }
    const header = parseLine(lines[0]).map(h => h.trim())
    return lines.slice(1).map(line => {
        const cells = parseLine(line)
        const row = {}
        header.forEach((h, i) => { row[h] = cells[i] })
        return row
    })
}

async function docSdt(anhUrl, model, apiKey) {
    const bdMs = Date.now()
    const res = await fetch(DASHSCOPE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
            model,
            temperature: 0,
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: PROMPT_TEXT },
                    { type: 'image_url', image_url: { url: anhUrl } }
                ]
            }]
        })
    })
    const latencyMs = Date.now() - bdMs
    if (!res.ok) {
        const bodyText = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status}: ${bodyText.slice(0, 300)}`)
    }
    const data = await res.json()
    const raw = (data?.choices?.[0]?.message?.content || '').trim()
    const usage = data?.usage || {}
    if (raw === 'KHONG_DOC_DUOC') return { khong_doc_duoc: true, latencyMs, usage }
    const chuan = chuanHoaSdt(raw)
    if (!laSdtHopLe(chuan)) return { sai_dinh_dang: true, raw, latencyMs, usage }
    return { sdt_ai_doc: chuan, latencyMs, usage }
}

function taoThongKe() {
    return { tong: 0, dung: 0, khongDocDuoc: 0, saiTuTin: 0, loi: 0, tongLatency: 0, tongTokenIn: 0, tongTokenOut: 0 }
}

function capNhatThongKe(tk, kq, dungHay) {
    tk.tong++
    if (kq.loi) { tk.loi++; return }
    tk.tongLatency += kq.latencyMs || 0
    tk.tongTokenIn += kq.usage?.prompt_tokens || 0
    tk.tongTokenOut += kq.usage?.completion_tokens || 0
    if (kq.khong_doc_duoc) { tk.khongDocDuoc++; return }
    // sai_dinh_dang (model trả về chuỗi không thể là SĐT VN) cũng tính là "sai tự tin" — model
    // vẫn đưa ra 1 câu trả lời như đang chắc chắn, chỉ là sai định dạng rõ ràng.
    if (dungHay) tk.dung++
    else tk.saiTuTin++
}

function inThongKe(ten, tk) {
    const p = n => tk.tong ? (100 * n / tk.tong).toFixed(1) : '0.0'
    console.log(`\n=== ${ten} ===`)
    console.log(`Tổng: ${tk.tong}`)
    console.log(`Đúng: ${tk.dung} (${p(tk.dung)}%)`)
    console.log(`Không đọc được (model tự từ chối): ${tk.khongDocDuoc} (${p(tk.khongDocDuoc)}%)`)
    console.log(`Sai nhưng tự tin đưa ra số (NGUY HIỂM): ${tk.saiTuTin} (${p(tk.saiTuTin)}%)`)
    console.log(`Lỗi gọi API: ${tk.loi} (${p(tk.loi)}%)`)
    const soDaGoi = tk.tong - tk.loi
    console.log(`Latency trung bình: ${soDaGoi ? (tk.tongLatency / soDaGoi).toFixed(0) : '?'}ms`)
    console.log(`Token trung bình: ${soDaGoi ? (tk.tongTokenIn / soDaGoi).toFixed(0) : '?'} input / ${soDaGoi ? (tk.tongTokenOut / soDaGoi).toFixed(0) : '?'} output`)
    console.log(`(Chưa tính chi phí — tra giá thực tế mỗi model trong Model Studio console rồi tự nhân với tổng token: ${tk.tongTokenIn} input / ${tk.tongTokenOut} output)`)
}

async function main() {
    const apiKey = process.env.DASHSCOPE_API_KEY
    if (!apiKey) { console.error('Thiếu biến môi trường DASHSCOPE_API_KEY'); process.exit(1) }
    const inputPath = process.argv[2]
    if (!inputPath) { console.error('Dùng: node scripts/so-sanh-model-ocr.js input.csv [output.csv]'); process.exit(1) }
    const outputPath = process.argv[3] || 'ket-qua-so-sanh.csv'

    const rows = parseCsv(readFileSync(inputPath, 'utf8'))
    if (!rows.length) { console.error('CSV rỗng hoặc sai định dạng'); process.exit(1) }
    console.log(`Đọc được ${rows.length} dòng từ ${inputPath}`)
    if (rows.length < 20) {
        console.log(`⚠️  Chỉ có ${rows.length} dòng (< 20) — coi kết quả lần này là THỬ NGHIỆM SƠ BỘ, chưa đủ để kết luận đổi model, xem "Lưu ý về quy mô mẫu" trong spec.`)
    }

    const thongKe = {}
    MODELS.forEach(m => thongKe[m] = taoThongKe())
    const chiTiet = []

    for (const [i, row] of rows.entries()) {
        const groundTruth = chuanHoaSdt(row.nguoi_nhan_sdt)
        process.stdout.write(`\r[${i + 1}/${rows.length}] ${row.id}...`)
        const dongChiTiet = { id: row.id, ground_truth: groundTruth }
        for (const model of MODELS) {
            let kq
            try {
                kq = await docSdt(row.anh_url, model, apiKey)
            } catch (err) {
                kq = { loi: true, error: err.message }
            }
            const dungHay = kq.sdt_ai_doc === groundTruth
            capNhatThongKe(thongKe[model], kq, dungHay)
            dongChiTiet[`${model}_ket_qua`] = kq.sdt_ai_doc || (kq.khong_doc_duoc ? 'KHONG_DOC_DUOC' : kq.sai_dinh_dang ? `SAI_DINH_DANG(${kq.raw})` : kq.loi ? `LOI(${kq.error})` : '?')
            dongChiTiet[`${model}_dung`] = kq.sdt_ai_doc ? (dungHay ? 'dung' : 'sai') : ''
            dongChiTiet[`${model}_latency_ms`] = kq.latencyMs ?? ''
        }
        chiTiet.push(dongChiTiet)
    }
    console.log('\nXong.')

    MODELS.forEach(m => inThongKe(m, thongKe[m]))

    const cols = ['id', 'ground_truth', ...MODELS.flatMap(m => [`${m}_ket_qua`, `${m}_dung`, `${m}_latency_ms`])]
    const csvOut = [cols.join(',')]
        .concat(chiTiet.map(r => cols.map(c => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(',')))
        .join('\n')
    writeFileSync(outputPath, csvOut, 'utf8')
    console.log(`\nĐã ghi chi tiết từng dòng vào ${outputPath}`)
}

main()

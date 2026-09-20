// api/_lib/nha-xe.js — resolve tenant (nhà xe) từ query param `nx` + verify quyền sở hữu id client
// gửi lên. NGOẠI LỆ CÓ CHỦ ĐÍCH so với convention "không import chéo giữa route" (xem các file
// cong-khai-*.js khác, copy chuanHoaSdt/laSdtHopLe/convertSolar2Lunar thay vì import): đây là code
// BẢO MẬT (resolve tenant + verify ownership) dùng bởi cả 4 route công khai + route manifest động
// — copy 4-5 bản dễ lệch nhau, 1 bản sai là rò data chéo giữa nhà xe. Xem SPEC "Multi-tenant Giai
// đoạn 5" trong CLAUDE.md.
//
// File/thư mục bắt đầu bằng `_` trong api/ không được Vercel coi là 1 Serverless Function riêng —
// chỉ là module thường để các route khác import (đã verify: không xuất hiện trong danh sách
// function sau deploy).

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/

function loi(status, message) {
    const e = new Error(message)
    e.status = status
    return e
}

// GET đọc query, POST đọc body (fallback query nếu có, vd đổi ý dùng query cho POST sau này).
export function docNx(req) {
    const raw = req.query?.nx ?? req.body?.nx
    return typeof raw === 'string' ? raw.trim() : ''
}

// Validate format trước (không cần query DB nếu sai rõ ràng), rồi tra `nha_xe` theo slug.
// KHÔNG có default ngầm — thiếu/sai/không tồn tại/tạm ngưng đều throw lỗi có `status` + message
// tiếng Việt, KHÔNG BAO GIỜ fallback về 1 nhà xe cụ thể nào.
export async function layNhaXe(sbAdmin, nx) {
    if (!nx) throw loi(400, 'Thiếu mã nhà xe')
    if (nx.length < 2 || nx.length > 40 || !SLUG_REGEX.test(nx)) throw loi(400, 'Mã nhà xe không hợp lệ')

    const { data, error } = await sbAdmin
        .from('nha_xe')
        .select('id, ten, slug, trang_thai, gio_khoi_hanh_bac, gio_khoi_hanh_nam')
        .eq('slug', nx)
        .maybeSingle()
    if (error) throw loi(500, error.message)
    if (!data) throw loi(404, 'Nhà xe không tồn tại')
    if (data.trang_thai !== 'hoat_dong') throw loi(403, 'Nhà xe tạm ngưng nhận đặt vé')
    return data
}

// Chỉ dùng cho lookup theo PK `id` (chuyen/giuong/diem_khach — cả 6 bảng nghiệp vụ đều có PK
// `id`). KHÔNG dùng cho tinh_len_ma/tinh_xuong_ma (đó là tuyen_tinh.tinh_ma, không phải
// tuyen_tinh.id) — chỗ đó phải tự viết query riêng.
// Không phân biệt "không tồn tại" với "thuộc nhà xe khác" trong response (luôn 404) — tránh lộ
// thông tin về việc 1 id có tồn tại hay không ở nhà xe khác.
export async function xacMinhThuocNhaXe(sbAdmin, bang, id, nhaXeId) {
    const { data, error } = await sbAdmin.from(bang).select('id').eq('id', id).eq('nha_xe_id', nhaXeId).maybeSingle()
    if (error) throw loi(500, error.message)
    if (!data) throw loi(404, `Không tìm thấy bản ghi trong bảng ${bang}`)
    return data
}

export function guiLoiNhaXe(res, err) {
    if (err && err.status) {
        res.status(err.status).json({ error: err.message })
        return true
    }
    return false
}

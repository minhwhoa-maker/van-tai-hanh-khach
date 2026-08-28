// point-match.js — browser-compatible (no CommonJS)
// Gợi ý chống trùng khi gõ tên điểm nhận/giao hàng, dựa trên so khớp bỏ dấu.
// KHÔNG chứa data tỉnh/tuyến — bảng tỉnh/tuyến lấy từ Supabase (tinh_tuyen).

function boDau(s) {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase().trim();
}

// Tìm điểm trùng/gần trùng trong danh sách điểm đã có của 1 tỉnh.
// diemList: [{ id, ten, ... }]; ten: chuỗi gốc có dấu.
// Trả về mảng điểm khớp (so khớp bỏ dấu, chứa chuỗi tìm kiếm).
function timDiemTrung(diemList, tenNhap) {
  const key = boDau(tenNhap);
  if (!key) return [];
  return diemList.filter(d => boDau(d.ten).includes(key));
}

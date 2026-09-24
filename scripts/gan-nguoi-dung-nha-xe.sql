-- scripts/gan-nguoi-dung-nha-xe.sql — Gán 1 user vào 1 nhà xe qua nguoi_dung_nha_xe.
--
-- ⚠️ CHỈ CHẠY SAU KHI nhân viên nhà xe đã ĐĂNG NHẬP ÍT NHẤT 1 LẦN qua login.html (Google hoặc
-- Zalo) — user_id tra theo email trong auth.users, script này KHÔNG tạo user mới. Chạy sớm hơn thì
-- không tìm thấy dòng nào, không insert được gì (không lỗi, chỉ 0 rows affected).
--
-- resolveNhaXeId (shared.js) đọc nguoi_dung_nha_xe KHÔNG có ORDER BY tường minh — nếu user thuộc
-- NHIỀU nhà xe, nhà xe nào được chọn là KHÔNG XÁC ĐỊNH (tuỳ thứ tự Postgres/PostgREST trả về, có
-- thể đổi giữa các lần gọi). CHỈ gán 1 user vào nhiều hơn 1 nhà xe nếu chắc chắn chấp nhận hành vi
-- này — nếu cần chọn nhà xe rõ ràng, phải tự thêm UI chọn nhà xe trước (chưa có, xem CLAUDE.md
-- mục "Onboard nhà xe mới" phần "Giai đoạn 6 — CHƯA LÀM").
--
-- Sửa 3 giá trị dưới đây rồi chạy nguyên khối:
--   email    — email đăng nhập của user (Google), hoặc zalo-<zalo_id>@zalo.eakar-hang.local (Zalo)
--   slug     — slug nhà xe, vd 'thai-vuong'
--   vai_tro  — 'crew' hoặc 'admin'

insert into nguoi_dung_nha_xe (user_id, nha_xe_id, vai_tro)
select u.id, n.id, 'crew'                      -- <-- sửa vai_tro ở đây: 'crew' hoặc 'admin'
from auth.users u, nha_xe n
where u.email = 'thay-email-that-vao-day@example.com'   -- <-- sửa email ở đây
  and n.slug = 'thai-vuong'                              -- <-- sửa slug ở đây
on conflict (user_id, nha_xe_id) do update set vai_tro = excluded.vai_tro;

-- Verify
select u.email, n.slug, ndx.vai_tro
from nguoi_dung_nha_xe ndx
join auth.users u on u.id = ndx.user_id
join nha_xe n on n.id = ndx.nha_xe_id
where n.slug = 'thai-vuong';

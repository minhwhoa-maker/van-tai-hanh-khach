-- scripts/onboard-nha-xe.sql — Seed 1 nhà xe mới (nha_xe + tuyen_tinh + giuong).
--
-- DÙNG LẠI cho nhà xe sau: copy file này, đổi các giá trị trong khối DECLARE ở đầu DO block (tên,
-- slug, SĐT, logo, giờ khởi hành, danh sách tỉnh, layout giường), rồi chạy lại nguyên văn phần còn
-- lại. KHÔNG tự đoán/copy giá trị của nhà xe khác — luôn hỏi người yêu cầu onboard trước khi điền.
--
-- Idempotent: `on conflict ... do nothing` ở cả 3 bước — chạy lại nhiều lần không tạo trùng dòng.
-- MỘT transaction (`begin`/`commit` bao ngoài) — lỗi giữa chừng thì rollback sạch, không để lại
-- state nửa vời (vd có nha_xe nhưng thiếu tuyen_tinh).
--
-- ⚠️ MỌI insert đặt `nha_xe_id` TƯỜNG MINH, KHÔNG dựa vào DEFAULT của cột — 6 cột `nha_xe_id`
-- (diem/chuyen/kien/giuong/diem_khach/ve) hiện VẪN CÒN `DEFAULT` trỏ về nhà xe `eakar` (đặt tạm ở
-- Multi-tenant Giai đoạn 2, chưa `DROP DEFAULT` — xem CLAUDE.md mục "Onboard nhà xe mới"). Quên đặt
-- tường minh ở bất kỳ insert nào bên dưới sẽ ÂM THẦM ghi dữ liệu của nhà xe mới vào `eakar` — không
-- có lỗi nào báo, chỉ phát hiện được nếu chủ động đếm lại số dòng theo `nha_xe_id`.
--
-- Nhà xe được tạo ở trạng thái 'tam_dung' — KHÔNG public cho tới khi người yêu cầu onboard tự
-- UPDATE trang_thai='hoat_dong' (xem cuối file, hoặc mục "Onboard nhà xe mới" trong CLAUDE.md).

begin;

do $$
declare
    -- ═══ Thông tin nhà xe — SỬA CÁC GIÁ TRỊ NÀY khi onboard nhà xe khác ═══
    v_ten           text := 'Thái Vương';
    v_slug          text := 'thai-vuong';
    v_sdt_lien_he   text := '0943233733';
    v_logo_url      text := null;  -- NULL cho tới khi có URL logo thật đã upload lên bucket
                                    -- nha-xe-logo VÀ đã verify bằng curl trả 200 — KHÔNG set URL
                                    -- suy đoán/chưa xác nhận, sẽ ra ảnh vỡ ở header dat-ve.html/
                                    -- xem-ve.html (fallback chữ cái đầu vẫn hoạt động đúng khi null).
    v_gio_bac       time := '07:00';
    v_gio_nam       time := '02:00';

    -- ═══ Tuyến tỉnh — mã + thu_tu GIỮ NGUYÊN giá trị gốc từ tinh_tuyen (không renumber liên tục,
    -- chỉ cần unique trong phạm vi nha_xe_id này — đã verify UNIQUE(nha_xe_id, thu_tu)). gia_moc
    -- LUÔN null lúc seed — KHÔNG bao giờ copy gia_moc của nhà xe khác, nhà xe tự báo giá sau qua
    -- modal "💰 Giá vé theo tỉnh" ở khach.html. ═══
    v_tuyen_tinh    jsonb := '[
        {"ma":"DLK","thu_tu":1},
        {"ma":"HTI","thu_tu":11},
        {"ma":"NAN","thu_tu":12},
        {"ma":"THA","thu_tu":13},
        {"ma":"NBH","thu_tu":14},
        {"ma":"HNI","thu_tu":16},
        {"ma":"HYN","thu_tu":17},
        {"ma":"HDG","thu_tu":18}
    ]'::jsonb;

    -- ═══ Layout giường — mỗi tầng 1 danh sách {hang, vi_tri:[...]}, ÁP DỤNG GIỐNG HỆT cho MỌI
    -- tầng (không hỗ trợ layout khác nhau giữa các tầng ở bản script này — nếu cần khác nhau, sửa
    -- tay phần INSERT giuong bên dưới thay vì dùng chung 1 layout cho vòng lặp tầng). Giường tính
    -- CHECK constraint `giuong_tang_check` chỉ cho phép tang ∈ {1,2} — KHÔNG hỗ trợ 3+ tầng ở tầng
    -- schema, xem CLAUDE.md mục "Onboard nhà xe mới" phần "UI/schema giả định 2 tầng". ═══
    v_so_tang       smallint := 2;
    v_layout        jsonb := '[
        {"hang":1,"vi_tri":[1,3,5]},
        {"hang":2,"vi_tri":[1,3,5]},
        {"hang":3,"vi_tri":[1,3,5]},
        {"hang":4,"vi_tri":[1,3,5]},
        {"hang":5,"vi_tri":[1,3,5]},
        {"hang":6,"vi_tri":[1,5]},
        {"hang":7,"vi_tri":[1,2,3,4,5]}
    ]'::jsonb;

    v_nha_xe_id     uuid;
    v_tang          smallint;
    v_row           jsonb;
    v_vt            smallint;
    v_seq           int;
    v_tt            jsonb;
begin
    -- 1. nha_xe — trang_thai LUÔN 'tam_dung' lúc seed, KHÔNG public cho tới khi tự bật tay.
    insert into nha_xe (ten, slug, trang_thai, sdt_lien_he, logo_url, gio_khoi_hanh_bac, gio_khoi_hanh_nam)
    values (v_ten, v_slug, 'tam_dung', v_sdt_lien_he, v_logo_url, v_gio_bac, v_gio_nam)
    on conflict (slug) do nothing;

    select id into v_nha_xe_id from nha_xe where slug = v_slug;

    -- 2. tuyen_tinh
    for v_tt in select * from jsonb_array_elements(v_tuyen_tinh) loop
        insert into tuyen_tinh (nha_xe_id, tinh_ma, thu_tu, gia_moc)
        values (v_nha_xe_id, v_tt->>'ma', (v_tt->>'thu_tu')::smallint, null)
        on conflict (nha_xe_id, tinh_ma) do nothing;
    end loop;

    -- 3. giuong — ma = T{tang}-{nn}, đánh số liên tục theo (hang, vi_tri) TRONG TỪNG TẦNG (reset
    -- v_seq về 0 mỗi tầng), khớp đúng convention `ma` hiện có của eakar (xem CLAUDE.md mục "Sơ đồ
    -- 44 giường tĩnh" ở khach.html — "ma LUÔN = thứ tự đọc trái→phải, xuống hàng").
    for v_tang in 1..v_so_tang loop
        v_seq := 0;
        for v_row in select * from jsonb_array_elements(v_layout) loop
            for v_vt in select jsonb_array_elements_text(v_row->'vi_tri')::smallint loop
                v_seq := v_seq + 1;
                insert into giuong (nha_xe_id, tang, hang, vi_tri, ma, hoat_dong)
                values (v_nha_xe_id, v_tang, (v_row->>'hang')::smallint, v_vt,
                        'T' || v_tang || '-' || lpad(v_seq::text, 2, '0'), true)
                on conflict (nha_xe_id, ma) do nothing;
            end loop;
        end loop;
    end loop;

    raise notice 'Onboard xong % (slug=%, nha_xe_id=%)', v_ten, v_slug, v_nha_xe_id;
end $$;

commit;

-- ═══ Verify sau khi chạy — dán kết quả vào báo cáo ═══
select n.slug, 'giuong' as bang, count(*) from giuong g join nha_xe n on n.id=g.nha_xe_id where n.slug in ('eakar','thai-vuong') group by n.slug
union all
select n.slug, 'tuyen_tinh', count(*) from tuyen_tinh t join nha_xe n on n.id=t.nha_xe_id where n.slug in ('eakar','thai-vuong') group by n.slug
order by 1, 2;

-- ═══ Bật public khi nhà xe sẵn sàng dùng thật (KHÔNG chạy tự động ở đây) ═══
-- update nha_xe set trang_thai = 'hoat_dong' where slug = 'thai-vuong';

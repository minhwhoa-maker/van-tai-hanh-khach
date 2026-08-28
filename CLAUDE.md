# CLAUDE.md

App quản lý kiện hàng crew xe khách giường nằm, tuyến Đắk Lắk ↔ Hải Dương. Fork từ `eakar-logistics` — tái dùng auth Zalo OTP, `shared.js`, CSS, PWA shell.

## Stack

Vanilla HTML/CSS/JS + Supabase (Postgres + Storage) + Vercel. Không build step, không test runner.

## Pages

- `login-sdt.html` — đăng nhập Zalo OTP (nguyên xi từ eakar-logistics)
- `hang.html` — nhập kiện: chọn/tạo **chuyến** (chiều bắc/nam) → chọn tỉnh → chọn/tạo điểm → chụp ảnh + SĐT người nhận + ghi chú → lưu offline-first vào IndexedDB (`idb-queue.js`), tự đồng bộ khi có mạng
- `manifest-hang.html` — chọn 1 chuyến, xem kiện gom theo tỉnh (thứ tự theo `tinh_tuyen.thu_tu`, chiều lấy từ `chuyen.chieu`: bac = ASC, nam = DESC)

## Database (đối chiếu `eakar_hang_v1.sql`)

```
tinh_tuyen (ma text PK, ten, ten_moi, thu_tu smallint)
diem       (id uuid PK, ten, ten_norm, tinh_ma FK -> tinh_tuyen.ma,
            huyen_cu, lat, lng, km_moc, so_lan_giao, created_at)
           -- UNIQUE(tinh_ma, ten_norm): DB tự chặn trùng điểm trong cùng tỉnh
           -- ten_norm = boDau(ten), tính ở client khi insert (point-match.js)
chuyen     (id uuid PK, chieu 'bac'|'nam', khoi_hanh, trang_thai 'dang_chay'|'xong',
            ghi_chu, tao_boi, created_at)
kien       (id uuid PK — CLIENT TỰ SINH qua crypto.randomUUID() để offline-first,
            chuyen_id FK -> chuyen.id, diem_id FK -> diem.id,
            anh_path, anh_url, nguoi_nhan_sdt, trang_thai 'chua_giao'|'da_giao',
            ghi_chu, created_at)
```

- Trigger DB: insert vào `kien` tự +1 `diem.so_lan_giao` — app không tự cộng tay.
- **RLS: DISABLED trên cả 4 bảng.** Lý do: login qua Zalo OTP + bảng `sessions` riêng (xem `api/verify-session.js`), KHÔNG tạo Supabase Auth session thật → `auth.uid()` luôn null → mọi request qua anon key là role `anon`, không phải `authenticated`. Policy "authenticated CRUD" sẽ chặn hết nếu bật RLS. Nếu sau này cần bật lại, phải chuyển toàn bộ read/write sang proxy qua `api/*.js` dùng `SUPABASE_SERVICE_KEY`.

## Storage

Bucket `kien` (Public). Path: `{kien.id}.jpg`. `idb-queue.js` upload khi đồng bộ, set `anh_path`/`anh_url`.

## Offline write-queue (`idb-queue.js`)

IndexedDB store `kien_queue`, keyPath `id`. `hang.html` luôn ghi vào đây trước (không insert thẳng Supabase), rồi gọi `trySyncQueue(sb)` — upload ảnh + upsert `kien`, đánh dấu `da_sync=true` khi xong. Tự sync khi có event `online` + fallback interval 30s (`setupQueueAutoSync`).

## Env / Vercel

Giống `eakar-logistics` nhưng **project Supabase khác** — điền `SUPABASE_URL`/`SUPABASE_ANON_KEY` trong `shared.js`, và set (không hardcode) trong Vercel: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ZALO_ACCESS_TOKEN`, `ZALO_REFRESH_TOKEN`, `ZALO_APP_ID`, `ZALO_APP_SECRET` cho `api/send-otp.js`/`verify-otp.js`/`verify-session.js`.

## Chưa làm (theo kế hoạch v1)

- `diem-quan-ly.html` — màn quản lý/seed điểm ngoài luồng nhập kiện
- Không giá vé/cước hàng, không sơ đồ ghế/khách, không AI/OCR đọc ảnh, không chia doanh thu crew

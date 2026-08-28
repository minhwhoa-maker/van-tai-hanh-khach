# CLAUDE.md

App quản lý kiện hàng crew xe khách giường nằm, tuyến Đắk Lắk ↔ Hải Dương. Fork từ `eakar-logistics` — tái dùng `shared.js`, CSS, PWA shell; auth viết lại hoàn toàn (Supabase Auth thật, không phải Zalo-OTP-tự-viết của repo gốc).

## Stack

Vanilla HTML/CSS/JS + Supabase (Postgres + Auth + Storage) + Vercel. Không build step, không test runner.

## Auth — Supabase Auth built-in, 2 provider song song

**KHÔNG có bảng `users`/`otp_codes`/`sessions` tự viết** (khác `eakar-logistics`). Auth = `auth.users` + `auth.uid()` có sẵn của Supabase, khớp với `chuyen.tao_boi default auth.uid()` trong DDL. `requireSession(sb)` (`shared.js`) chỉ check `sb.auth.getSession()` — không phân biệt provider, không có khái niệm role.

- **`login.html`** — 2 nút, độc lập nhau:
  - **Google** — `sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: origin + '/hang.html' } })`. Chuẩn OAuth, Supabase JS tự parse session từ URL hash khi `hang.html` load — không cần callback riêng. Cấu hình: Supabase Dashboard → Authentication → Providers → Google (Client ID/Secret từ Google Cloud Console, redirect URI `https://ycifioonjzrdasofdmjb.supabase.co/auth/v1/callback`).
  - **Zalo** — Zalo KHÔNG phải provider chuẩn của Supabase và không hỗ trợ OIDC (đã tra `developers.zalo.me`/`oauth.zaloapp.com`: chỉ có OAuth v4 access_token thường, không có id_token) → phải tự bắc cầu:
    1. `login.html` redirect `/api/zalo-login` → server tạo PKCE (`code_verifier`/`code_challenge`), set cookie `zalo_pkce` (httpOnly, scope path `/api/zalo-callback`), 302 sang `oauth.zaloapp.com/v4/permission`
    2. Zalo redirect về `/api/zalo-callback?code=...` → server đổi `code` lấy `access_token` (`POST oauth.zaloapp.com/v4/access_token`, header `secret_key`), gọi `graph.zalo.me/v2.0/me` lấy `zalo_id`/`name`/`picture` (bước này đồng thời verify token hợp lệ)
    3. Server dùng `SUPABASE_SERVICE_KEY` gọi `sbAdmin.auth.admin.generateLink({ type: 'magiclink', email: zalo-<zalo_id>@zalo.eakar-hang.local, options: { data: {...} } })` — cơ chế **chính thức** của Supabase, KHÔNG tự ký JWT tay — lấy `hashed_token`
    4. Redirect trình duyệt sang `auth-callback.html?email=...&token_hash=...`
  - **`auth-callback.html`** — chỉ dùng cho nhánh Zalo: gọi `sb.auth.verifyOtp({ email, token: token_hash, type: 'magiclink' })` client-side để thiết lập session thật, rồi vào `hang.html`.
  - **⚠️ TODO trước khi go-live**: endpoint/tên tham số Zalo OAuth v4 trong `api/zalo-login.js`/`api/zalo-callback.js` viết theo hiểu biết chung (doc `developers.zalo.me` là SPA, không fetch được nội dung lúc viết) — đối chiếu lại với doc thật + test end-to-end bằng 2 tài khoản Zalo khác nhau trước khi dùng thật.

## Pages

- `login.html` — màn đăng nhập (2 nút Google/Zalo)
- `auth-callback.html` — bridge verifyOtp cho nhánh Zalo, không dùng cho Google
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
            ghi_chu, tao_boi default auth.uid(), created_at)
           -- tao_boi KHÔNG gửi từ client, để DB default tự điền
kien       (id uuid PK — CLIENT TỰ SINH qua crypto.randomUUID() để offline-first,
            chuyen_id FK -> chuyen.id, diem_id FK -> diem.id,
            anh_path, anh_url, nguoi_nhan_sdt, trang_thai 'chua_giao'|'da_giao',
            ghi_chu, created_at)
```

- Trigger DB: insert vào `kien` tự +1 `diem.so_lan_giao` — app không tự cộng tay.
- **RLS: DISABLED trên cả 4 bảng.** Quyết định của owner (2026-08-29) — đơn giản hóa giai đoạn đầu, giống pattern `eakar-logistics`. Giờ auth đã là Supabase Auth thật (`auth.uid()` có giá trị với cả Google lẫn Zalo-bridge) nên có thể bật RLS + policy `TO authenticated` bất cứ lúc nào sau này mà không cần đổi kiến trúc — không còn bị chặn bởi vấn đề dual-auth như trước.

## Storage

Bucket `kien` (Public). Path: `{kien.id}.jpg`. `idb-queue.js` upload khi đồng bộ, set `anh_path`/`anh_url`.

## Offline write-queue (`idb-queue.js`)

IndexedDB store `kien_queue`, keyPath `id`. `hang.html` luôn ghi vào đây trước (không insert thẳng Supabase), rồi gọi `trySyncQueue(sb)` — upload ảnh + upsert `kien`, đánh dấu `da_sync=true` khi xong. Tự sync khi có event `online` + fallback interval 30s (`setupQueueAutoSync`).

## Env / Vercel

- Supabase project **`van-tai-hanh-khach`** (ref `ycifioonjzrdasofdmjb`) — khác project `eakar-logistics`. `SUPABASE_URL`/`SUPABASE_ANON_KEY` đã điền trong `shared.js`.
- Vercel env (KHÔNG lộ ra client): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (secret key `sb_secret_...`, dùng trong `api/zalo-callback.js` để gọi Admin API), `ZALO_APP_ID`, `ZALO_APP_SECRET`.
- Google Client ID/Secret nằm trong Supabase Dashboard (Authentication → Providers), không cần set ở Vercel.

## Chưa làm (theo kế hoạch v1)

- `diem-quan-ly.html` — màn quản lý/seed điểm ngoài luồng nhập kiện
- Không giá vé/cước hàng, không sơ đồ ghế/khách, không AI/OCR đọc ảnh, không chia doanh thu crew

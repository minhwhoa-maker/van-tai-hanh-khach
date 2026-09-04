# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

App quản lý kiện hàng crew xe khách giường nằm, tuyến Đắk Lắk ↔ Hải Dương. Fork từ `eakar-logistics` — tái dùng `shared.js`, CSS, PWA shell; auth viết lại hoàn toàn (Supabase Auth thật, không phải Zalo-OTP-tự-viết của repo gốc).

## Stack

Vanilla HTML/CSS/JS + Supabase (Postgres + Auth + Storage) + Vercel. Không build step, không test runner, không lint.

## Commands

- **Preview local**:
  - Windows dev machine (không có python/node/php sẵn cho việc này): `powershell -File .static-server.ps1 -Port 8765` — custom static file server, serve `.` lên `http://localhost:8765/login.html`.
  - Máy có Python/Node sẵn (vd Linux): `python3 -m http.server 8765` cũng phục vụ tốt, không cần script riêng.
  - Không dùng `file://` trực tiếp vì service worker/relative path sẽ lỗi.
  - **Lưu ý**: OAuth (Google + Zalo) không chạy được qua `localhost:8765` — cả 2 provider cần redirect URI thật đã đăng ký (Supabase Dashboard / Zalo App console). Server này chỉ dùng để xem giao diện tĩnh, không test được luồng đăng nhập.
- **`npm install`**: chỉ cần khi sửa `api/*.js` (cài `@supabase/supabase-js`, `web-push` — `web-push` hiện chưa được dùng ở đâu trong code, còn lại từ lúc fork). Không cần chạy lại khi chỉ sửa HTML/CSS/JS frontend.
- **Deploy**: `git push origin main` → Vercel auto-deploy (khi đã nối remote). Có thể deploy trực tiếp từ code local không cần push GitHub trước: `vercel --prod` (đã link sẵn project `van-tai-hanh-khach`, xem `.vercel/project.json`).
- **DB schema changes**: vào Supabase dashboard project `van-tai-hanh-khach` (ref `ycifioonjzrdasofdmjb`) chỉnh tay (SQL editor).

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

- Header của `hang.html`/`manifest-hang.html` đặt link điều hướng (back, "Đăng xuất", "+ Nhập kiện") trong class `.header-nav-desktop` — tên gọi là tàn dư từ fork `eakar-logistics` (nơi có hamburger menu riêng thay thế trên mobile) nhưng **repo này không có hamburger menu nào implement**, nên `style.css` không còn ẩn class này dưới 600px nữa (đã sửa — trước đó `display: none !important` khiến header trống trơn, mất hết back-nav trên điện thoại). Đừng thêm lại rule ẩn `.header-nav-desktop` trên mobile trừ khi đồng thời xây hamburger menu thay thế.
- `login.html` — màn đăng nhập (2 nút Google/Zalo)
- `auth-callback.html` — bridge verifyOtp cho nhánh Zalo, không dùng cho Google
- `hang.html` — nhập kiện: chọn/tạo **chuyến** (chiều bắc/nam) → chọn tỉnh → chọn/tạo điểm → chụp ảnh + SĐT người nhận + ghi chú → lưu offline-first vào IndexedDB (`idb-queue.js`), tự đồng bộ khi có mạng
  - **Danh sách "1. Chọn tỉnh" loại bỏ Đắk Lắk và Khánh Hòa** (`loadTinh()`, lọc bằng `ma !== 'DLK'` và `ten !== 'Khánh Hòa'`) — hàng luôn được bốc ở Đắk Lắk (là điểm xuất phát, không phải điểm giao nên không cần chọn) và xe không chạy tuyến qua Khánh Hòa. Đây là filter cứng ở client, không phải xoá khỏi bảng `tinh_tuyen` — cả 2 tỉnh vẫn còn trong DB, chỉ ẩn khỏi UI chọn tỉnh giao hàng. Lưu ý `data/tinh_km_range.json` cũng không có entry cho Khánh Hòa (đi thẳng `DLK` → `PYN`), khớp với việc tuyến không qua đó.
  - **Bước 3 (chụp ảnh) có nút "💰 Thu hộ (COD)"** (`#btn-thu-ho-toggle`) — bật lên mới hiện ô nhập `#kien-thu-ho`, bắt buộc số dương nếu bật (validate trước khi `queueKien`). Lưu vào `record.tien_thu_ho`, đi qua `idb-queue.js` như các field khác (khác với `tien_thu` — field đó chỉ nhập được ở `manifest-hang.html` sau khi giao, không có trong hàng đợi offline).
- `manifest-hang.html` — chọn 1 chuyến, xem kiện gom theo tỉnh (thứ tự theo `tinh_tuyen.thu_tu`, chiều lấy từ `chuyen.chieu`: bac = ASC, nam = DESC). Mỗi dòng kiện chuyển đổi tại chỗ trong cùng 1 `.kien-row` (không điều hướng trang) qua các hàm `renderKienRowView` / `renderKienRowEdit` / `renderKienRowThuTien` / `renderKienRowViTri`:
  - **Sửa** — sửa nhanh SĐT người nhận + ghi chú (`renderKienRowEdit`)
  - **Hoàn thành** — `toggleDaGiao` chuyển UI sang `renderKienRowThuTien` (nhập tiền thu) **ngay lập tức, không chờ mạng/GPS** — set `k.trang_thai = 'da_giao'` optimistic trước, rồi mới bắt GPS (nếu `diem` chưa có toạ độ, có thể mất tới 15s — xem mục "Toạ độ điểm giao + km_moc") và `UPDATE kien.trang_thai` chạy ngầm phía sau; nếu update DB lỗi thì revert `k.trang_thai` về `chua_giao` + render lại `renderKienRowView` kèm toast lỗi. Bấm lại "Hủy giao" (nhánh `chua_giao`, không có GPS nên vẫn update đồng bộ như cũ) quay về `renderKienRowView`. Tiền đã thu hiện lại được qua nút "Sửa tiền"
  - **`renderKienRowViTri`** (sửa tay `lat`/`lng` của `diem`, tính lại `km_moc` khi lưu) — code vẫn còn nguyên nhưng **nút "Sửa vị trí / Định vị điểm" đã bị ẩn khỏi `renderKienRowView`** theo yêu cầu đơn giản hoá UI mobile, nên hàm này hiện không có đường gọi tới từ UI (dead code có chủ đích, giữ lại phòng khi cần bật lại lối sửa tay toạ độ)
  - **Cảnh báo thu hộ (COD)** — `renderCodSummary` hiện banner `#cod-summary` phía trên danh sách CHỈ KHI còn kiện `tien_thu_ho > 0` mà `tien_thu < tien_thu_ho` (chưa thu đủ): tổng cần thu, tổng đã thu, số kiện chưa thu đủ. Đã thu đủ hết (hoặc chuyến không có kiện COD) → banner tự ẩn, không còn gì để cảnh báo. Mỗi dòng kiện có `tien_thu_ho` cũng hiện badge màu `--warning` "💰 Thu hộ: Xđ" (kèm "⚠ chưa thu đủ" nếu đã giao mà `tien_thu < tien_thu_ho`) — badge này hiện cả khi chưa giao, không tự ẩn như banner. Số tiền cần thu hộ cũng hiện lại trong `renderKienRowThuTien` lúc nhập tiền thực thu để đối chiếu.
  - Bấm vào ảnh thumbnail mở lightbox phóng to (`#lightbox`)
  - **Dưới 600px** (`@media (max-width: 600px)` trong `<style>` của trang): `.kien-row` chuyển `flex-wrap: wrap` — ảnh/tên điểm/badge giữ 1 hàng, `.kien-actions` (Sửa/Hoàn thành/Thu tiền) xuống hàng riêng full-width, mỗi nút to hơn (padding/font lớn hơn) cho dễ bấm tay trên xe. Trước đó 4 nút (gồm cả "Sửa vị trí") nhồi chung 1 hàng flex nowrap với ảnh+tên khiến chữ vỡ từng ký tự và nút cuối bị cắt ngoài viewport trên điện thoại.

### Toạ độ điểm giao + km_moc (`km-moc.js`, `data/*.json`)

Mục đích: trong `manifest-hang.html`, sắp xếp thứ tự kiện *bên trong 1 tỉnh* theo đúng thứ tự đi trên đường (tránh xe chạy ngược xuôi khi giao nhiều điểm cùng tỉnh) — dùng `diem.km_moc` (km tích lũy từ Đắk Lắk).

- **KHÔNG bắt GPS lúc tạo điểm** (`hang.html`) — điểm được tạo lúc bốc hàng ở Đắk Lắk, bắt GPS lúc đó sẽ ra toạ độ sai hoàn toàn cho điểm giao ở ngoài Bắc.
- **Bắt GPS lúc bấm "Hoàn thành"** (`manifest-hang.html`, `toggleDaGiao`) — đúng lúc xe đang đứng tại điểm giao. Chỉ bắt khi `diem.lat`/`lng` đang NULL (không ghi đè điểm đã định vị từ lần giao trước), chỉ nhận nếu `pos.coords.accuracy <= 50` (mét). Từ chối quyền/lỗi/timeout/độ chính xác kém → bỏ qua lặng lẽ, không chặn luồng "Hoàn thành" chính, toạ độ bị mất (không lưu tạm) — **quyết định có chủ đích**: `kien.trang_thai` vẫn là UPDATE trực tiếp lên Supabase (cần mạng, giống code cũ), phần GPS/km_moc KHÔNG đi qua `idb-queue.js` (việc mở rộng hàng đợi offline cho "cập nhật bản ghi đã tồn tại" bị cất lại, xem TODO bên dưới) — nếu bước update `trang_thai` thất bại vì mất mạng, giữ nguyên hành vi lỗi hiện tại, toạ độ GPS vừa bắt bị bỏ luôn.
- `diemMap` trong `loadManifest` gộp mọi kiện cùng `diem_id` về chung 1 object — bắt/sửa toạ độ 1 lần thì mọi dòng kiện cùng điểm trong phiên hiện tại tự thấy giá trị mới, tránh xin quyền GPS lặp lại.
- `tinhKmMoc(lat, lng, tinhMa, tuyenChuan, tinhKmRange)` (`km-moc.js`) — nearest-neighbor thuần nhưng **giới hạn tìm kiếm theo `tinh_ma` đã biết** (qua `data/tinh_km_range.json`) để tránh nhảy nhầm sang đoạn tuyến khác xa hàng trăm km (đèo, khúc cua, vòng qua thành phố). `data/tuyen_chuan_bactien.json` là tuyến chuẩn rút gọn (2644 điểm `{lat,lng,km}`, ~500m/điểm) tính từ GPX thật — dùng chung cho cả 2 chiều, `sapXepTrongTinh(dsKien, chieu)` chỉ đảo ASC/DESC theo `chieu`, null luôn xuống cuối bất kể chiều.
- 2 file JSON tĩnh nạp qua `fetch()` (không nhúng vào JS) — `sw.js` có logic cache-on-fetch cho 2 file này trong `STATIC_ASSETS`, nhưng **`sw.js` hiện chưa được `navigator.serviceWorker.register()` ở đâu cả** (không có trong `login.html`/`hang.html`/`manifest-hang.html`/`shared.js`) — PWA/offline-cache thực chất chưa active, dù `manifest.json` đã được link. Cần thêm bước register nếu muốn phần cache-on-fetch/offline-first này thật sự chạy.
- **TODO cất lại cho sau (Phương án B)**: làm "Hoàn thành" chạy offline-first hoàn toàn (cả `trang_thai` lẫn toạ độ) — cần mở rộng `idb-queue.js` với khái niệm "cập nhật bản ghi đã tồn tại" (hiện chỉ có tạo mới), nạp `idb-queue.js` + gọi `setupQueueAutoSync` trong `manifest-hang.html` (hiện chưa nạp), và UI hiển thị trạng thái "chờ đồng bộ". Khối lượng việc lớn hơn đáng kể so với phạm vi ban đầu nên tách riêng.

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
            ghi_chu, tien_thu numeric, tien_thu_ho numeric, created_at)
           -- tien_thu: thêm sau v1 (alter table), nullable — số tiền THỰC thu khi giao xong,
           -- nhập ngay trong bước "Hoàn thành" ở manifest-hang.html, không có trong idb-queue.js
           -- tien_thu_ho: thêm sau v1 (alter table), nullable — số tiền CẦN thu hộ (COD) do
           -- người gửi yêu cầu, nhập lúc chụp ảnh ở hang.html (bước 3), CÓ trong idb-queue.js
```

- Trigger DB: insert vào `kien` tự +1 `diem.so_lan_giao` — app không tự cộng tay.
- **RLS: DISABLED trên cả 4 bảng.** Quyết định của owner (2026-08-29) — đơn giản hóa giai đoạn đầu, giống pattern `eakar-logistics`. Giờ auth đã là Supabase Auth thật (`auth.uid()` có giá trị với cả Google lẫn Zalo-bridge) nên có thể bật RLS + policy `TO authenticated` bất cứ lúc nào sau này mà không cần đổi kiến trúc — không còn bị chặn bởi vấn đề dual-auth như trước.

## Storage

Bucket `kien` (Public). Path: `{kien.id}.jpg`. `idb-queue.js` upload khi đồng bộ, set `anh_path`/`anh_url`.

- **Public bucket chỉ cấp quyền đọc (SELECT), không tự cấp ghi.** `storage.objects` luôn tự có RLS riêng, độc lập với quyết định "RLS disabled" ở 4 bảng app phía trên. Muốn `sb.storage.from('kien').upload(...)` chạy được từ client phải tạo thêm Storage Policy cho phép INSERT/UPDATE (role `authenticated`, `bucket_id = 'kien'`) — thiếu bước này thì upload throw lỗi, kéo theo cả record `kien` không insert được (xem `trySyncQueue` bên dưới).

## Offline write-queue (`idb-queue.js`)

IndexedDB store `kien_queue`, keyPath `id`. `hang.html` luôn ghi vào đây trước (không insert thẳng Supabase), rồi gọi `trySyncQueue(sb)` — upload ảnh + upsert `kien`, đánh dấu `da_sync=true` khi xong. Tự sync khi có event `online` + fallback interval 30s (`setupQueueAutoSync`).

## Env / Vercel

- Supabase project **`van-tai-hanh-khach`** (ref `ycifioonjzrdasofdmjb`) — khác project `eakar-logistics`. `SUPABASE_URL`/`SUPABASE_ANON_KEY` đã điền trong `shared.js`.
- Vercel env (KHÔNG lộ ra client): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (secret key `sb_secret_...`, dùng trong `api/zalo-callback.js` để gọi Admin API), `ZALO_APP_ID`, `ZALO_APP_SECRET`.
- Google Client ID/Secret nằm trong Supabase Dashboard (Authentication → Providers), không cần set ở Vercel.

## Chưa làm (theo kế hoạch v1)

- `diem-quan-ly.html` — màn quản lý/seed điểm ngoài luồng nhập kiện
- Không giá vé/cước hàng, không sơ đồ ghế/khách, không AI/OCR đọc ảnh, không chia doanh thu crew

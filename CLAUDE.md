# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

App quản lý kiện hàng crew xe khách giường nằm, tuyến Đắk Lắk ↔ Hải Dương. Fork từ `eakar-logistics` — tái dùng `shared.js`, CSS, PWA shell; auth viết lại hoàn toàn (Supabase Auth thật, không phải Zalo-OTP-tự-viết của repo gốc).

## TODO trước khi go-live

Checklist việc BẮT BUỘC xác nhận trước khi cho khách/crew thật dùng các luồng liên quan — không
phải nợ kỹ thuật thông thường, mà là thứ sẽ ÂM THẦM SAI nếu quên, không có lỗi rõ ràng nào báo
hiệu lúc go-live. Đọc mục này TRƯỚC khi trả lời "đã sẵn sàng dùng thật chưa" cho bất kỳ tính năng
nào bên dưới.

- **`OTP_TEST_MODE` (env Vercel) — ĐANG BẬT (`true`) ở Production kể từ 2026-09-23, PHẢI xoá/set
  về `false` trước khi cho khách thật dùng `dat-ve.html`** — xem cơ chế chi tiết ở mục "OTP bắt
  buộc mọi lượt đặt vé công khai". Bật để test luồng OTP/đặt vé trong lúc Zalo ZNS/SMS Brandname
  chưa có credential thật (`ZALO_OA_ACCESS_TOKEN`/`ZALO_ZNS_TEMPLATE_ID`/nhà cung cấp SMS đều chưa
  có). Nếu quên tắt: khách thật bấm "Gửi mã xác thực" sẽ nhận `{ok:true}` như bình thường nhưng
  KHÔNG có gì gửi đi thật (bước gửi bị bỏ qua âm thầm, chỉ log ra Vercel function logs) — khách
  không có quyền vào Supabase để tự tra mã, coi như không bao giờ đặt được vé, không có lỗi nào
  hiện ra để biết nguyên nhân. Kiểm tra bằng `vercel env ls --scope minhwhoa-makers-projects` (hoặc
  Vercel Dashboard → Settings → Environment Variables), xoá/sửa xong phải `vercel --prod` lại để có
  hiệu lực (đổi env không tự động redeploy).
- **Zalo OAuth login (crew, `login.html`)** — endpoint/tên tham số Zalo OAuth v4 trong
  `api/zalo-login.js`/`api/zalo-callback.js` viết theo hiểu biết chung (doc `developers.zalo.me` là
  SPA, không fetch được nội dung lúc viết) — đối chiếu lại với doc thật + test end-to-end bằng 2 tài
  khoản Zalo khác nhau trước khi dùng thật. Xem chi tiết ở mục "Auth" bên dưới.
- **Zalo ZNS + SMS Brandname (đặt vé công khai)** — chưa có credential nào (`ZALO_OA_ACCESS_TOKEN`/
  `ZALO_ZNS_TEMPLATE_ID` chưa đăng ký; nhà cung cấp SMS chưa chốt) — cả 2 kênh gửi OTP thật đều sẽ
  throw lỗi nếu gọi lúc này (đang được che bởi `OTP_TEST_MODE`, xem bullet trên). Xem mục "OTP bắt
  buộc mọi lượt đặt vé công khai".

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

## Tối ưu mobile / PWA (checklist khi thêm UI mới)

Sau 1 đợt audit toàn bộ 5 trang HTML, các quy ước sau áp dụng xuyên suốt app — giữ nguyên khi
thêm form/nút mới:

- **Mọi `<input>`/`<textarea>`/`<select>` phải `font-size: 16px` trở lên** — dưới 16px khiến
  Safari iOS tự động zoom vào khi focus (hành vi mặc định của iOS, không tắt được bằng
  `user-scalable=no` một cách đáng tin cậy). Không áp dụng cho chip/button dạng text (`.chip`,
  `.btn-cod-toggle`...) vì đó không phải ô nhập, không kích hoạt zoom.
- **Nút icon-only (không có text, vd hamburger `☰`) phải đạt tối thiểu 44×44px vùng chạm**
  (khuyến nghị Apple HIG/Material Design) — dùng class `.btn-icon` (định nghĩa ở `style.css`,
  dùng chung cho `#btn-open-menu` ở cả 3 trang `hang.html`/`manifest-hang.html`/
  `lich-su-chuyen.html`). Từng có bug thật: class `.btn-icon` được gán trong HTML nhưng
  KHÔNG có rule CSS nào cho tới khi audit này phát hiện — vùng chạm trước đó chỉ bằng đúng
  kích thước glyph icon (~22px), dưới ngưỡng khuyến nghị.
- **Input trong form sửa tại chỗ của `manifest-hang.html`** (`.kien-row-edit input`,
  `.kien-row-edit textarea` — dùng chung cho cả 3 hàm `renderKienRowEdit`/`renderKienRowThuTien`/
  `renderKienRowViTri`) — 1 rule CSS duy nhất áp cho toàn bộ, padding `12px 14px`, font-size
  `16px`. Từng bị đặt quá nhỏ (padding `8px 10px`, font-size `14px`) — đã bump lên cùng chuẩn
  với input ở `hang.html`.
- **Cả 5 trang đều có đủ bộ thẻ PWA/iOS trong `<head>`** (ngay sau viewport meta):
  `theme-color` (khớp `var(--primary)` `#1565c0`), `apple-mobile-web-app-capable`,
  `apple-mobile-web-app-status-bar-style`, `apple-touch-icon` (trỏ `icons/icon-192.png`).
  Thiếu bộ này thì "Thêm vào màn hình chính" trên iOS dùng ảnh chụp màn hình làm icon (thay vì
  icon app thật) và có thể mở kèm thanh địa chỉ Safari thay vì standalone — `manifest.json`
  (`display: standalone`) chỉ đủ cho Android/Chrome, iOS Safari cần thêm các meta tag riêng này.
  Lưu ý `manifest.json` khai `theme_color: #2563eb` (khác `#1565c0` của CSS/meta tag) — lệch nhẹ
  có từ trước, chưa đồng bộ lại vì đổi giá trị trong `manifest.json` ảnh hưởng icon/theme đã cài
  trên máy crew, cần cân nhắc riêng chứ không sửa tuỳ tiện.

### Tối ưu tablet (2026-09-21)

Mục tiêu: dùng được thoải mái trên tablet (dọc + ngang), Android lẫn iPad, **điện thoại không đổi**.
Chỉ đổi layout CSS/JS phía client — không đụng DB/API/RLS/logic nghiệp vụ/`idb-queue.js`.

- **Nguyên tắc**: chỉ THÊM rule mới trong media query riêng, không sửa rule mobile hiện có
  (`@media (max-width: 600px)` ở `manifest-hang.html` giữ nguyên 100%). Layout theo CHIỀU RỘNG
  VÙNG HIỂN THỊ, không theo loại thiết bị — tablet split-screen/cửa sổ nhỏ vẫn phải đúng.
- **2 breakpoint, LUÔN kèm điều kiện chiều cao**: `(min-width: 768px) and (min-height: 480px)` và
  `(min-width: 1024px) and (min-height: 480px)`. Điều kiện `min-height` bắt buộc để loại điện
  thoại xoay ngang (~844×390 — rộng hơn 768px nhưng thấp) khỏi rule tablet, nếu không nó sẽ vô tình
  ăn layout tablet dù thực chất vẫn là 1 điện thoại nhỏ cầm ngang. Đã verify bằng Playwright: ở
  844×390, `body` vẫn giữ đúng hành vi mobile ở mọi trang.
- **Bộ viewport test chuẩn** (dùng khi audit/verify lại sau này): `360×800` (baseline điện thoại),
  `844×390` (điện thoại ngang — phải KHÔNG ăn rule tablet), `768×1024`/`820×1180` (tablet dọc),
  `1024×768`/`1280×800` (tablet ngang), `800×1280` (tablet Android dọc).
- **Container cap — áp thẳng lên `<body>`, KHÔNG bọc thêm div nào** (`hang.html`/`manifest-hang.html`/
  `khach.html`/`lich-su-chuyen.html` vốn không có div wrapper content — header/step là con trực
  tiếp của body, nên cap ngay ở body là cách ít đụng DOM nhất). Giá trị: 720px trang form/nhập liệu
  (`hang.html`), 960px trang danh sách (`manifest-hang.html`/`khach.html`/`lich-su-chuyen.html`),
  640px `dat-ve.html` (nới từ 480px gốc, riêng lịch 2 cột nới thêm lên 880px ở 1024px — xem bên
  dưới). `login.html` không cần sửa — card riêng đã tự `max-width:400px` centered từ trước, đã
  verify ảnh thật không có vấn đề gì ở tablet. **Phát hiện lúc audit**: `.container{max-width:900px}`
  trong `style.css` (leftover từ fork `eakar-logistics`) là **CSS CHẾT** — không trang crew nào
  dùng `class="container"` (đã `grep` xác nhận 0 kết quả cả 5 trang) — đây là lý do phải cap trực
  tiếp lên `body` thay vì "chỉ cần dùng `.container` có sẵn".
- **Modal/bottom-sheet → hộp giữa màn hình từ 768px**: `.ve-modal-card`/`.diemkhach-modal-card`/
  `.gia-tinh-modal-card` (`khach.html`), `.dia-diem-picker-card` (`dat-ve.html`) — đổi
  `align-items: flex-end` → `center`, bo đủ 4 góc (`border-radius: var(--radius)` thay vì chỉ 2 góc
  trên), `max-width: 520px`. Giữ nguyên `max-height`/`overflow-y` (cuộn nội bộ) và mọi hành vi đóng
  hiện có (bấm ra ngoài, nút Back qua `popstate`/`history`) — chỉ đổi CSS. `.confirm-dialog*`
  (shared, `style.css`) **ĐÃ SẴN LÀ hộp giữa màn hình** từ trước (`align-items:center`, bo đủ 4
  góc) — không cần sửa gì, liệt kê ở đây chỉ để xác nhận đã kiểm tra.
- **Sơ đồ giường to hơn**: `--seat-cell` (biến CSS set trên `.giuong-hang`, kế thừa xuống
  `.giuong-icon` con qua CSS custom property — không cần sửa `.giuong-icon`/JS) đổi 28px (mobile,
  xem đính chính "54px" sai ở mục `khach.html`) → 44px (≥768px) → 52px (≥1024px), cả
  `khach.html` lẫn `dat-ve.html`. Vẫn xếp theo `vi_tri` thật/giữ khoảng trống lối cầu thang — không
  đổi cách render dữ liệu, chỉ đổi kích thước ô.
- **Nhận diện iPad** (`hang.html:784`, `openCameraFlow`) — iPadOS 13+ báo User-Agent giống macOS
  Safari, regex `/iPad|iPhone|iPod/` không bắt được → thêm điều kiện phụ
  `navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1`. Đây là UA-sniffing DUY NHẤT
  trong repo (đã `grep` xác nhận ở lúc audit, không có chỗ khác cần sửa tương tự).
- **Camera nhúng trên tablet** (`hang.html`, `#camera-live video`) — thêm `max-height: 45vh;
  object-fit: cover` từ 768px, tránh video tỉ lệ rộng cao gần hết viewport ở tablet NGANG (đẩy nút
  "📸 Chụp"/"Hủy" ra ngoài tầm nhìn).
- **`manifest-hang.html` GIỮ 1 CỘT, không chia lưới** — thứ tự tỉnh dọc tuyến (`tinh_tuyen.thu_tu`,
  gắn với `km_moc`) là dữ liệu NGHIỆP VỤ, crew cần đọc tuần tự đúng thứ tự đi trên đường trong 1
  tỉnh; chia 2 cột sẽ làm lẫn thứ tự đọc. Chỉ tăng `.kien-row` gap/padding + thumbnail 44px→64px.
  `.kien-menu` (toạ độ tính bằng JS, tự kẹp theo `innerWidth`/`innerHeight`) và lightbox không cần
  sửa gì — đã tự thích ứng viewport động từ lúc viết.
- **Lịch `dat-ve.html` — 2 tháng cạnh nhau từ 1024px** (dưới đó giữ 1 tháng như từ trước, xem lịch
  sử đổi qua lại ở mục "Lịch dạng lưới") — chỉ khối tháng ĐẦU TIÊN có nút `‹›` (khối 2 chỉ hiện tiêu
  đề), tránh 2 cặp nút cùng chỉnh 1 biến `baseMonthOffset` dùng chung. `matchMedia('(min-width:
  1024px)...')` đăng ký DUY NHẤT 1 lần, gọi lại `renderLichThang()` khi xoay màn hình qua lại
  ngưỡng — `ngayDangChonTam` (biến JS module-level) tự động giữ nguyên vì không bị đụng lúc render
  lại, không cần xử lý gì thêm để "giữ ngày đang chọn tạm".
- **Đã verify bằng Playwright thật (không chỉ đọc code)**: 42 tổ hợp (6 trang × 7 viewport) — 0 lỗi
  console, không request nào ngoài các API/asset hiện có; resize giữa chừng lúc đã chọn ngày+giường
  ở `dat-ve.html` và lúc đang ở bước 3 `hang.html` (đã điền SĐT/ghi chú/loại hàng) — mọi state giữ
  nguyên qua resize, không mất dữ liệu đang nhập dở.
- **Đề xuất, KHÔNG LÀM ở đợt này** (chờ owner duyệt riêng nếu muốn):
  - Sidebar cố định thay `renderSideMenu` (side drawer) ở tablet.
  - Giao diện master-detail (sơ đồ trái/danh sách phải hiện đồng thời ở `khach.html` ≥1024px, thay
    vì bật/tắt qua `currentView` như hiện tại) — cần đổi logic `currentView`, chỉ nên làm nếu audit
    sau này cho thấy hợp lý và owner đồng ý.
  - Lưới card 2 cột cho `lich-su-chuyen.html` nếu thấy trang quá trống ở tablet.
  - Tách bản giao diện riêng cho tablet — chỉ dùng responsive, không tách file/route riêng.
  - Đổi `theme_color` trong `manifest.json` (đã biết lệch nhẹ với CSS từ trước, xem mục "Tối ưu
    mobile/PWA" phía trên — không sửa tuỳ tiện, ảnh hưởng icon/theme đã cài trên máy crew).
- **Nợ, CHỈ TEST ĐƯỢC TRÊN TABLET THẬT** (headless không kiểm chứng được):
  1. Camera nhúng (Android tablet) và luồng `capture` (iPad, gồm camera trước/sau) — sau khi sửa
     nhận diện iPad ở trên, cần xác nhận iPad THẬT rơi đúng nhánh `<input capture>`, không lọt vào
     `getUserMedia`.
  2. Cài PWA lên tablet (Android Chrome và iPad Safari) — mở từ icon, đúng tên/icon, đúng
     `orientation` (xem dưới).
  3. Xoay màn hình THẬT (không phải resize cửa sổ) giữa chừng lúc đang nhập kiện — cảm biến xoay
     vật lý có thể có độ trễ/hành vi khác `matchMedia` giả lập qua resize.
  4. Chế độ chia đôi màn hình/cửa sổ nổi (Android split-screen, Samsung DeX...).

**`orientation` — ĐÃ SỬA (2026-09-21), không phải nợ**: audit Phase 1 phát hiện CẢ `manifest.json`
(crew) lẫn `api/manifest-dat-ve.js` (booking) đều khoá `orientation: 'portrait'` — tablet gắn cố
định NGANG sẽ bị hệ điều hành ép xoay dọc khi mở app standalone. Owner quyết định: `manifest.json`
đổi `portrait` → `any` (crew thao tác trên tablet có thể gắn ngang); `api/manifest-dat-ve.js` GIỮ
NGUYÊN `portrait` (khách lẻ dùng điện thoại, ít khi gắn cố định ngang, giữ đơn giản cho trải nghiệm
đặt vé). Vẫn còn trong mục "nợ test trên thiết bị thật" ở trên (mục 2 — cài PWA) vì đổi
`orientation` chỉ verify được đầy đủ khi cài thật trên tablet, chưa test qua headless.

## Tiện ích dùng chung (`shared.js`)

- `formatDate(dateStr)` — hiện giờ + ngày âm lịch + ngày dương, vd `13:03 - 20/7 ÂL - 01/09/26`, dùng cho label chuyến ở cả `hang.html` và `manifest-hang.html`. Âm lịch tính bằng thuật toán Hồ Ngọc Đức viết thuần JS ngay trong file (`convertSolar2Lunar` + các hàm phụ trợ `_jdFromDate`/`_newMoon`/`_sunLongitude`/...), không phụ thuộc thư viện ngoài, múi giờ cố định UTC+7 (khớp app chỉ chạy tuyến trong nước).
- `soTienBangChu(n)` — đọc số tiền bằng chữ tiếng Việt (vd `200000` → `Hai trăm nghìn đồng`), thuật toán tự viết (nhóm 3 chữ số + đơn vị nghìn/triệu/tỷ), không phụ thuộc thư viện ngoài. Dùng làm dòng chữ xác nhận (`.tien-chu`/`#kien-thu-ho-chu`) bên dưới các ô nhập tiền ở `hang.html` (`#kien-thu-ho`) và `manifest-hang.html` (`renderKienRowThuTien`) — 2 ô này giờ **nhập theo đơn vị nghìn đồng** (vd gõ `200` = 200.000đ, giá trị thực = input × 1000) để giảm số lượng số 0 phải gõ, và hiện chữ đọc số ngay bên dưới để crew đối chiếu trước khi lưu, tránh gõ nhầm/thiếu số 0. Cả nơi hiển thị lại giá trị đã lưu (`value` mặc định của ô sửa tiền) cũng chia lại cho 1000 để khớp quy ước nhập.
- `confirmDialog(message, { danger, okText, cancelText })` — thay cho `confirm()` gốc trình duyệt (dialog gốc hiện tên miền "xxx says" ở đầu, nhìn không giống 1 phần của app, đặc biệt khó hiểu khi chạy PWA standalone không có thanh địa chỉ). Trả về `Promise<boolean>`, dựng DOM 1 lần rồi tái dùng (giống pattern `renderSideMenu`), style `.confirm-dialog*` ở `style.css`. `danger: true` tô đỏ nút xác nhận (dùng cho hành động không hoàn tác được như "Hủy đơn"). Đang thay thế toàn bộ 3 chỗ gọi `confirm()` trong app: "Kết thúc chuyến"/"Hủy đơn" (`manifest-hang.html`), "Đã có điểm gần giống, vẫn tạo?" (`hang.html`). `prompt()` (loại hàng "Khác...") KHÔNG đổi, vẫn dùng native — chỉ `confirm()` bị thay vì đó mới là thứ gây khó chịu thực tế trên PWA.
- `renderSideMenu(sb)` — menu trượt từ trái (`.side-drawer*` trong `style.css`, panel `left:0` + `translateX(-100%→ 0)`), dùng chung cho cả 3 trang `hang.html`/`manifest-hang.html`/`lich-su-chuyen.html`. Thay thế hoàn toàn cách cũ (link `header-nav-desktop` rời rạc nhét trực tiếp 2 bên header — class này và toàn bộ CSS của nó **đã bị xoá khỏi `style.css`**, không còn dùng nữa). Header mỗi trang giờ chỉ còn nút `#btn-open-menu` (☰) bên trái + `h2` tiêu đề (absolute-center) + `<div></div>` rỗng bên phải (giữ chỗ cho `justify-content:space-between` đẩy nút sang trái — ban đầu nút từng ở bên phải/trượt từ phải, đã đổi sang trái theo yêu cầu sau). Nhận `sb` làm tham số thay vì tự `createSb()` — mỗi trang đã có sẵn instance `sb` riêng, dùng chung để `signOut()` đúng session. Tự so `location.pathname` để bôi đậm (`.active`) link trỏ tới trang hiện tại, không ẩn link đó đi. Mỗi trang gọi 1 lần: `const { open } = renderSideMenu(sb)` rồi gắn `open` vào `#btn-open-menu`.

## Pages

- Cả 3 trang `hang.html` ↔ `manifest-hang.html` ↔ `lich-su-chuyen.html` nối vòng qua menu trượt `renderSideMenu` (xem trên) — không còn link rời rạc trong header.
- `login.html` — màn đăng nhập (2 nút Google/Zalo)
- `auth-callback.html` — bridge verifyOtp cho nhánh Zalo, không dùng cho Google
- `hang.html` — nhập kiện: chọn/tạo **chuyến** (chiều bắc/nam) → chọn tỉnh → chọn/tạo điểm → chụp ảnh + SĐT người nhận + ghi chú → lưu offline-first vào IndexedDB (`idb-queue.js`), tự đồng bộ khi có mạng
  - **Danh sách "1. Chọn tỉnh" loại Đắk Lắk theo chiều, luôn loại Khánh Hòa** (`loadTinh()`) — chiều `bac`: hàng bốc ở Đắk Lắk (điểm xuất phát, không phải điểm giao) nên ẩn khỏi danh sách chọn; chiều `nam`: Đắk Lắk lại là điểm đến cuối cùng (order by `thu_tu` DESC nên tự nhiên rơi xuống cuối danh sách) nên **giữ lại** để chọn giao hàng — filter là `(currentChuyen.chieu === 'nam' || t.ma !== 'DLK')`. Khánh Hòa loại bỏ ở cả 2 chiều vì xe không chạy tuyến qua đó. Đây là filter cứng ở client, không phải xoá khỏi bảng `tinh_tuyen` — cả 2 tỉnh vẫn còn trong DB, chỉ ẩn/hiện có điều kiện khỏi UI chọn tỉnh giao hàng. Lưu ý `data/tinh_km_range.json` cũng không có entry cho Khánh Hòa (đi thẳng `DLK` → `PYN`), khớp với việc tuyến không qua đó.
  - **Bước 3 (chụp ảnh) hiện lại "📍 Tên điểm — Tên tỉnh" đã chọn** (`#anh-diem-info`, ngay trên khung chụp ảnh) — bước 3 cách bước chọn điểm 1 màn hình, crew dễ quên đang nhập cho điểm nào sau khi cuộn xuống lâu để chụp ảnh/chọn loại hàng/nhập tiền. Cập nhật tập trung trong `renderStep(id)` (không phải tại từng nơi gọi `goToStep('step-anh')`) — mọi đường vào step-anh (chọn điểm có sẵn, tạo điểm mới, "Sửa lại kiện này") đều đã set xong `selectedTinh`/`selectedDiem` trước khi `renderStep` chạy nên chỉ cần 1 chỗ đọc lại 2 biến này.
  - **Gợi ý SĐT người nhận theo điểm giao (`#sdt-goi-y-chips`/`loadSdtGoiY`/`renderSdtGoiYChips`) ĐÃ BỊ GỠ BỎ** (2026-09-12, theo yêu cầu) — không còn chip gợi ý SĐT cũ theo điểm giao khi vào bước 3, crew chỉ còn gõ tay hoặc dùng "AI tự đọc SĐT từ ảnh" (bullet ngay dưới). Không ảnh hưởng tính năng AI tự điền — 2 tính năng độc lập, chỉ dùng chung `#kien-sdt`/`#sdt-ai-hint`.
  - **AI tự đọc SĐT từ ảnh, tự điền `#kien-sdt` nếu đang trống** (`tryAutoReadSdt`, hook cuối `resizeImage(...).then(...)` trong `handleNewPhotoBlob`) — giải quyết vấn đề gà-và-trứng: nút "🔍 Đối chiếu SĐT bằng AI" ở `manifest-hang.html` (mode `compare`) chỉ ĐỐI CHIẾU số đã có sẵn trong DB, kiện nào crew quên gõ SĐT thì bị loại thẳng dù ảnh chụp rõ số — tính năng này đọc thẳng từ ảnh ngay lúc chụp để phần lớn kiện có sẵn `nguoi_nhan_sdt` trước khi sync, không phụ thuộc crew nhớ gõ tay. **Đây là mở rộng phạm vi gửi dữ liệu cho AI provider bên thứ 3 từ "theo yêu cầu, hàng loạt" sang "tự động, mọi kiện, mọi lúc chụp ảnh" — owner đã xác nhận chấp nhận đánh đổi này (2026-09-10), tách biệt với quyết định trước đó vốn chỉ áp dụng cho tính năng đối chiếu theo yêu cầu.**
    - Gọi `api/doi-chieu-sdt.js` với `mode: 'read'` (khác `mode: 'compare'` dùng ở `manifest-hang.html`) — gửi `anh_base64` (Data URL, từ `FileReader.readAsDataURL` trên bản ĐÃ RESIZE, không phải ảnh gốc) thay vì `anh_url`, vì lúc này ảnh CHƯA upload lên Supabase Storage (chỉ upload lúc `idb-queue.js` sync nền) nên chưa có URL public để gửi. Route có timeout riêng 8s cho nhánh `read` (`AbortController`) — đây là lệnh gọi CHẠY NGẦM lúc crew đang thao tác tiếp, không được để treo lâu nếu mạng yếu ở điểm bốc hàng.
    - **Race-condition guard dùng `kienSessionToken` (biến đếm module-level), KHÔNG PHẢI token riêng theo ảnh** — điểm quan trọng nhất của tính năng này, phát hiện qua 1 vòng review spec trước khi implement: nếu chỉ bump token lúc có ẢNH MỚI (`handleNewPhotoBlob`), sẽ lọt 1 race-condition thật — crew chụp ảnh kiện A → AI đang đọc ngầm (chậm hơn nếu mạng yếu, đúng lúc dễ xảy ra nhất) → crew lưu kiện A, `#kien-sdt` reset rỗng cho kiện B, nhưng CHƯA chụp ảnh nào cho B nên token-theo-ảnh không đổi → kết quả trễ của A về, thấy token khớp + ô đang rỗng → điền NHẦM SĐT kiện A vào kiện B. Sửa bằng cách bump `kienSessionToken` ở MỌI điểm làm mới ngữ cảnh nhập liệu, không chỉ lúc chụp ảnh: `handleNewPhotoBlob` (ảnh mới/chụp lại), khối reset field ngay sau khi `queueKien` xong (bump SỚM ở đây, không đợi tới lúc bấm "+ Nhập kiện tiếp theo" — đóng luôn khoảng hở từ lúc reset tới lúc crew thật sự bấm nút), `#btn-review-next` (bump thêm lần nữa, vô hại), và `#btn-review-edit` (chặn kết quả trễ từ 1 lần chụp-lại trước đó lúc đang sửa). So token lúc gửi request với `kienSessionToken` hiện tại lúc nhận kết quả — lệch thì bỏ, không điền vào bất kỳ ô nào.
    - **KHÔNG ghi đè `#kien-sdt` đã có giá trị** (crew gõ tay trước, hoặc đã bấm chip gợi ý ở bullet trên) — cùng nguyên tắc với chip gợi ý. Kết quả hợp lệ qua `sdtDocDuocHopLe()` (chuẩn hoá `+84`/số `0` dư giống `chuanHoaSdt` phía server, validate đúng dạng `0` + 9 số) mới được điền, kèm `sdtInput.dataset.nguon = 'ai'` + hiện `#sdt-ai-hint` ("✨ AI đọc từ ảnh — kiểm tra lại trước khi lưu") — cả 2 bị xoá ngay khi crew gõ tay vào ô (listener `input`) hoặc bấm chip gợi ý (giá trị không còn chắc chắn là do AI đọc nữa). `data-nguon` KHÔNG lưu xuống DB (không đổi schema `kien`), chỉ là gợi ý hiển thị tại chỗ.
    - **Lỗi mạng/model đọc không ra/ảnh mờ → im lặng bỏ qua** (không toast, không `console.error` — khác `chayDoiChieuSdt` ở `manifest-hang.html` vốn là thao tác chủ động của crew nên có thể log lỗi chi tiết) — giữ đúng triết lý "tính năng phụ trợ không được chặn luồng chính" đã áp dụng cho GPS và chip gợi ý SĐT. Không ảnh hưởng offline-first: `queueKien`/`idb-queue.js` vẫn lưu kiện hoàn toàn không phụ thuộc mạng/AI, tính năng này chỉ là lớp phụ trợ chạy song song.
  - **`selectTinh(tinh, chipEl)` xoá sạch `#diem-search` + danh sách gợi ý NGAY LẬP TỨC trước khi gọi `loadDiem(tinh.ma)` (async)** — trước đây cả ô tìm kiếm lẫn `allDiemInTinh`/`#diem-list` giữ nguyên giá trị của lượt chọn điểm TRƯỚC cho tới khi request tải điểm mới trả về, nên giữa lúc chờ mạng (đặc biệt sau "+ Nhập kiện tiếp theo" → quay lại bước 1 chọn tỉnh cho kiện kế tiếp), crew vẫn thấy tạm thời text đã gõ + điểm đã chọn của kiện TRƯỚC, dễ hiểu nhầm là hệ thống "tự gợi ý" điểm sai. `loadDiem` cũng thêm guard so `selectedTinh.ma === tinhMa` trước khi áp kết quả — phòng đổi tỉnh liên tiếp nhanh khiến request cũ trả về SAU request mới (race condition) và ghi đè nhầm danh sách của tỉnh đang chọn bằng dữ liệu tỉnh đã rời khỏi.
  - **Bước 2 (chọn điểm), danh sách gợi ý dưới ô "Gõ tên điểm..." thụt vào trong** (`.diem-list`, `margin-left` lớn hơn ô nhập phía trên + nền xám nhạt `#f5f7fa` + chữ màu `--text-muted`, font nhỏ hơn `14px`) — trước đó `.diem-item` dùng chung style với `.chuyen-item` (border 1.5px, nền trắng, y hệt ô nhập phía trên) khiến ô nhập và danh sách gợi ý nhìn giống nhau, không rõ cái nào là input cái nào là kết quả gợi ý. `.chuyen-item` (danh sách chọn chuyến ở bước 0, không phải gợi ý phụ thuộc ô nhập) giữ nguyên style cũ.
  - **Bước 0 chỉ hiện chuyến `dang_chay`** (`loadChuyenList`, render qua `renderChuyenItem`) — từng thử hiện thêm nhóm "Chuyến đã hoàn thành" ở đây (bấm để xem lại) nhưng đã bỏ theo yêu cầu: nhập kiện mới không cần thấy chuyến cũ, xem lại chuyến đã xong thì qua `lich-su-chuyen.html`. `lich-su-chuyen.html` vẫn giữ nguyên 2 nhóm (xem bên dưới) — 2 trang khác nhau ở điểm này, không phải bug.
  - **`.current-chuyen-bar` (thanh hiện tên chuyến đang chọn, phía trên các bước) — bar TĨNH trong flow bình thường, KHÔNG phải `position:fixed`** (đính chính lúc audit tablet 2026-09-21 — dễ nhầm vì nó "trông giống" 1 thanh cố định, nhưng CSS thực tế chỉ là 1 div thường ngay dưới header, full-width theo container cha; không cần xử lý gì riêng khi container cha đổi độ rộng ở tablet). Có nút "📋 Xem danh sách" (`updateChuyenBar()`) — link `manifest-hang.html?chuyen_id=<id>`, mở `target="_blank"` (tab/cửa sổ mới) để không mất luồng nhập kiện đang dở ở `hang.html`. Thêm vì sau khi lưu 1 kiện, app tự reset về bước 1 mà không có cách xem lại kiện vừa nhập tại chỗ — trước đó phải rời hẳn trang hoặc gõ URL tay sang `manifest-hang.html`. Dùng chung convention `?chuyen_id=` với chỗ điều hướng cũ ở `lich-su-chuyen.html`. Cố ý KHÔNG làm danh sách/preview kiện ngay trong `hang.html` — chỉ là link tắt sang trang đã có sẵn.
  - **Tạo chuyến mới có 2 field: Chiều + Ngày giờ khởi hành** (`#new-chuyen-khoi-hanh`, `type="datetime-local"`, ĐỔI 2026-09-17 — trước đó chỉ có Chiều, `khoi_hanh` luôn cứng = `new Date()` lúc bấm "Tạo chuyến", không cho nhập tay) — cho phép crew LÊN LỊCH TRƯỚC nhiều chuyến ở các ngày khác nhau, phục vụ tính năng "Bước 0 — Chọn ngày đi" ở `dat-ve.html` (xem mục đó). Prefill = giờ hiện tại mỗi lần MỞ form (`toDatetimeLocalValue(new Date())`, tính theo giờ ĐỊA PHƯƠNG chứ không phải `toISOString()` — tránh lệch múi giờ hiển thị trong ô nhập), để trống lúc lưu thì fallback về `new Date()` (giữ hành vi cũ làm lưới an toàn). `chuyen.ghi_chu` vẫn còn cột trong DB, chỉ không thu thập ở form này, luôn `null` cho chuyến mới.
  - **"+ Tạo chuyến mới" LUÔN hiện, không còn tự ẩn khi đã có chuyến `dang_chay`** (đổi 2026-09-17 cùng lúc với ô ngày giờ ở trên) — trước đó ẩn hẳn nút này nếu ĐÃ có 1 chuyến `dang_chay` bất kỳ, dựa trên giả định "chỉ chạy 1 chuyến tại 1 thời điểm". Giả định đó không còn đúng khi cho khách chọn ngày đi — crew cần tạo được NHIỀU chuyến `dang_chay` cùng lúc (mỗi chuyến 1 ngày/chiều khác nhau) để khách có gì đó thật sự để chọn ở `dat-ve.html`. Danh sách "0. Chọn chuyến đang chạy" (`loadChuyenList`) đổi `order by` từ `created_at desc` sang `khoi_hanh` TĂNG DẦN (chuyến gần nhất lên đầu, hợp lý hơn cho crew chọn đúng chuyến sắp chạy khi có nhiều chuyến cùng lúc).
  - **Bước 3 (chụp ảnh) có nút "💰 Thu hộ (COD)"** (`#btn-thu-ho-toggle`) — bật lên mới hiện ô nhập `#kien-thu-ho`, bắt buộc số dương nếu bật (validate trước khi `queueKien`). Lưu vào `record.tien_thu_ho`, đi qua `idb-queue.js` như các field khác.
  - **Bước 3 có thêm nút "✅ Đã thu cước"** (`#btn-cuoc-toggle`, cạnh nút COD, cùng class `.btn-cod-toggle`) — cho khách trả cước (phí vận chuyển) ngay lúc gửi thay vì để crew thu lúc giao. Bật lên mới hiện ô `#kien-cuoc`, bắt buộc số dương nếu bật, validate y hệt `tien_thu_ho`. **Ghi thẳng vào `record.tien_thu`** (KHÔNG tạo cột riêng — `tien_thu` vốn chỉ nhập được ở `manifest-hang.html` sau khi giao, giờ có thêm đường ghi thứ 2 từ lúc gửi; đi qua `idb-queue.js` giống các field khác, khác trước đây khi `tien_thu` không có trong hàng đợi offline). Độc lập hoàn toàn với `tien_thu_ho` — 1 kiện có thể vừa trả cước trước vừa có COD, không trừ vào nhau. Cả `#kien-thu-ho` lẫn `#kien-cuoc` đều nhập theo nghìn đồng + hiện chữ đọc số, xem `soTienBangChu` ở mục "Tiện ích dùng chung".
  - **Bước 3 có mục "Số lượng / Loại hàng" (`#loaihang-chips` + `#loaihang-items`, biến `loaiHangItems`)** — thay cho stepper số lượng đơn lẻ trước đây, vì 1 khách có thể gửi cùng lúc nhiều LOẠI khác nhau với số lượng riêng từng loại (vd 2 thùng giấy + 3 thùng xốp), không thể gộp vào 1 số lượng tổng duy nhất. Bấm chip "Thùng giấy"/"Thùng xốp"/"Bao" (tạm thời cứng trong HTML, chưa có bảng danh mục riêng trong DB) thêm 1 dòng vào `loaiHangItems` (hoặc +1 số lượng nếu loại đó đã có trong danh sách), mỗi dòng có stepper `−`/`+` VÀ ô nhập số trực tiếp (`.item-qty-input`, `type="number"`, giữa 2 nút) riêng (`renderLoaiHangItems()`) + nút xoá; giảm về 0 (qua nút `−`) tự xoá dòng — ô nhập số gõ tay chỉ chuẩn hoá về số nguyên dương lúc rời ô (`blur`, mặc định về 1 nếu bỏ trống/không hợp lệ), KHÔNG re-render list lúc đang gõ (`input` event chỉ cập nhật biến, tránh mất focus/con trỏ giữa chừng khi số lượng nhiều chữ số). Chip "Khác..." dùng `prompt()` để gõ tên tự do (đủ dùng vì hiếm gặp, không cần thêm UI riêng). **Bấm "Lưu kiện hàng" mà `loaiHangItems` rỗng (chưa bấm chip nào) → chặn lưu, toast lỗi "Chọn ít nhất 1 loại hàng trước khi lưu"** — trước đây danh sách rỗng mặc định lưu thành 1 kiện không phân loại (`so_luong=1, loai_hang=null`), đổi theo yêu cầu bắt buộc crew luôn phải chọn loại hàng, tránh qua bước 3 thiếu sót do bấm nhầm nút "Lưu" mà quên chọn. Vì vậy lúc build `record`, `loaiHangItems` chắc chắn không rỗng: `record.so_luong` = tổng số lượng mọi loại (`reduce` cộng dồn `soLuong` từng item), `record.loai_hang` = chuỗi liệt kê từng loại, số lượng LUÔN ở đầu mỗi mục (nối bằng `, ` — vd `"1 Thùng xốp, 2 Thùng giấy"`) — trước đây dùng dạng `Tên ×N` và ẩn số khi `N = 1` (`"Thùng giấy ×2, Thùng xốp"`), đổi theo yêu cầu để số lượng luôn hiện rõ kể cả khi chỉ có 1. Dữ liệu CŨ tạo trước khi có validate này vẫn có thể mang `loai_hang=null` (không hồi tố) — các nơi hiển thị lại vẫn giữ fallback cho trường hợp đó. Cả 2 field đi qua `idb-queue.js`, reset `loaiHangItems = []` sau khi lưu. **Hiển thị lại ở `manifest-hang.html` (`renderKienRowView`) và `renderReviewCard` (`hang.html`) chỉ in thẳng `loai_hang`, KHÔNG append thêm `×N` tổng lần nữa** — vì chuỗi đã tự chứa số lượng theo từng loại rồi, cộng thêm sẽ sai/lặp. Badge `×N` tổng ở dòng tên điểm (`.so-luong`) chỉ còn dùng làm fallback khi kiện KHÔNG có `loai_hang` (dữ liệu cũ hoặc bỏ trống lúc nhập).
  - **Sau khi lưu, chuyển sang "Step 4" (`#step-review`) xem lại kiện vừa lưu, KHÔNG quay thẳng về "1. Chọn tỉnh" như trước** — hiện ảnh + tên điểm/tỉnh + SĐT/ghi chú/số lượng + badge thu hộ/đã thu cước (nếu có) qua `renderReviewCard()`, để crew xác nhận đúng thông tin ngay tại chỗ thay vì phải rời sang `manifest-hang.html`. Bấm "+ Nhập kiện tiếp theo" (`#btn-review-next`) mới quay lại `step-tinh` để bắt đầu kiện kế tiếp. Ảnh preview dùng lại `reviewPreviewUrl` — biến `activePreviewUrl` (object URL) được CHUYỂN QUYỀN SỞ HỮU sang `reviewPreviewUrl` thay vì revoke ngay sau khi lưu (xem bullet "Ảnh chụp" phía trên), chỉ `URL.revokeObjectURL()` khi lưu kiện MỚI (ghi đè review cũ) hoặc khi bấm "Nhập kiện tiếp theo" rời khỏi màn review.
  - **Phím Back Android (cứng lẫn gesture vuốt) KHÔNG BAO GIỜ thoát PWA, chỉ lùi bước trong app**
    — luồng 5 bước chuyển bằng JS thuần (`.step`/`.step.active`, không đổi URL) nên mặc định trình
    duyệt không có history entry nào để lùi. Xử lý bằng pattern "1 history entry giả (guard) tái
    tạo mỗi lần" thay vì push 1 entry thật cho MỖI bước: `stepStack` (mảng, biến JS) là nguồn sự
    thật DUY NHẤT về đang ở bước nào — cố tình KHÔNG đọc `event.state` để tránh lệch khi bấm Back
    nhanh liên tiếp. `goToStep(id, opts)`: nối `id` vào cuối `stepStack` (tiến 1 bước bình thường)
    trừ khi gọi kèm `opts.stack` (mảng thay hẳn stack — dùng cho 2 chỗ "khởi động lại luồng giữa
    chừng": "+ Nhập kiện tiếp theo" → `['step-chuyen','step-tinh']`, "← Sửa lại kiện này" →
    `['step-chuyen','step-tinh','step-diem','step-anh']`, để Back sau đó lùi đúng ngữ cảnh mới thay
    vì quay lại step-review/step-anh cũ đã không còn ý nghĩa). `pushBackGuard()` đảm bảo có ĐÚNG 1
    entry giả trong history thật (`history.pushState`, không push thêm nếu đã có) — được giữ ở
    MỌI bước KỂ CẢ bước gốc `step-chuyen` (gọi ngay lúc script chạy, trước cả khi có thao tác nào)
    — bất kể đang sâu bao nhiêu bước cũng chỉ tốn 1 entry thừa. Listener `popstate` (bấm Back cứng
    và vuốt gesture đều phát sinh event giống nhau, chỉ cần 1 cơ chế): pop 1 phần tử khỏi
    `stepStack` NẾU còn hơn 1 phần tử (ở bước gốc thì giữ nguyên, không pop nữa), render lại phần
    tử còn lại ở cuối, rồi LUÔN `pushBackGuard()` lại — kể cả ở bước gốc — để lần Back kế tiếp vẫn
    tiếp tục bị chặn thay vì rơi về hành vi mặc định của trình duyệt (thoát app). Bấm Back liên tục
    ở bước gốc chỉ render lại chính bước gốc (no-op), không lỗi, không thoát. **Trade-off cố ý**:
    lùi bước chỉ đổi hiển thị, KHÔNG xoá state đã nhập (`selectedTinh`/`selectedDiem`/
    `loaiHangItems`/`activePhotoBlob`...) — quay tới lại vẫn còn nguyên dữ liệu vừa nhập dở, giống
    hành vi điều hướng tiến/lùi thông thường của app nhiều bước. Muốn thực sự thoát app thì dùng
    nút Home/app switcher của hệ điều hành, không còn cách nào thoát qua phím Back nữa.
  - **Step 4 có thêm nút "← Sửa lại kiện này" (`#btn-review-edit`)** cạnh "+ Nhập kiện tiếp theo" — cho crew sửa ngay nếu phát hiện nhập sai (vd chọn nhầm loại hàng/số lượng) mà không phải rời sang `manifest-hang.html`. Bấm vào: xoá hẳn kiện vừa lưu (`deleteKienLocal()` xoá khỏi `idb-queue.js`, đồng thời `DELETE` bản ghi `kien` + ảnh trong Storage bucket `kien` trên Supabase — best-effort, không chặn UI nếu lỗi/chưa kịp sync) rồi khôi phục lại toàn bộ form ở bước 3 (loại hàng, SĐT, ghi chú, COD, cước, ảnh đã chụp) từ snapshot `lastSaved` lưu lúc vừa bấm "Lưu kiện hàng", quay lại `step-anh` để sửa và lưu lại — kiện mới lưu lại sẽ có `id` mới (không phải update tại chỗ). `lastSaved` bị xoá (`= null`) khi bấm "Nhập kiện tiếp theo" — nút "Sửa lại" chỉ có tác dụng ngay sau khi lưu, không lùi lại được kiện của những lần lưu trước đó.
  - **Ảnh chụp: hiện preview ngay bằng `URL.createObjectURL`, resize chạy ngầm phía sau** — trước đây dùng `FileReader.readAsDataURL(activePhotoBlob)` để hiện preview, phải đọc + encode base64 TOÀN BỘ ảnh gốc camera (chưa resize, thường 3-8MB) trước khi `<img>` nhận `src`, gây cảm giác "chậm vài giây sau khi chụp" — đây là nguyên nhân chính, không phải do ghi IndexedDB (Blob ghi thẳng, rất nhanh). Giờ preview hiện gần như tức thời qua object URL (chỉ tạo con trỏ, không đọc nội dung), còn `resizeImage(file, 1600)` (canvas, JPEG quality 0.82) resize ảnh xuống tối đa 1600px cạnh dài chạy `.then()` phía sau, gán lại `activePhotoBlob` khi xong — nếu resize lỗi (vd định dạng canvas không decode được) thì fallback về giữ nguyên ảnh gốc (`activePhotoBlob` đã được set trước đó). Nếu bấm "Lưu kiện hàng" trước khi resize kịp xong thì `record.anh_blob` là ảnh gốc chưa resize — chấp nhận được, không chặn luồng lưu để chờ resize. `activePreviewUrl` được `URL.revokeObjectURL()` mỗi khi chụp ảnh mới; sau khi lưu kiện thì quyền sở hữu URL chuyển sang `reviewPreviewUrl` (xem bullet "Step 4 — xem lại kiện vừa lưu") thay vì revoke ngay, tránh rò rỉ bộ nhớ ở cả 2 nhánh.
  - **`#camera-box` KHÔNG tự ẩn sau khi đã chụp — vẫn đứng trên preview để bấm chụp lại nếu ảnh chưa ưng ý, chỉ đổi nhãn** (`#camera-box-label`, `updateCameraBoxLabel()`) từ "📷 Chạm để chụp ảnh" sang "🔄 Chạm để chụp lại" khi `activePreviewUrl` đang có giá trị — trước đây nhãn cố định "chụp ảnh" dù ảnh đã có sẵn phía dưới, gây hiểu lầm là chưa chụp được. Gọi ở 3 chỗ: cuối `handleNewPhotoBlob` (vừa chụp/chọn ảnh xong), khối reset field sau khi lưu kiện (`activePreviewUrl = null` → nhãn về "chụp ảnh"), và cuối "← Sửa lại kiện này" (khôi phục đúng theo `saved.previewUrl` có hay không).
  - **Camera nhúng CHỈ trên Android, iOS giữ nguyên `<input type="file" capture>`** (`openCameraFlow`, phát hiện bằng UA sniffing `isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)`) — cố ý dùng UA sniffing thay vì feature-detection: iOS về kỹ thuật vẫn "hỗ trợ" `getUserMedia`, nhưng PWA standalone trên iOS có lịch sử lỗi camera lặp lại nhiều lần qua các bản cập nhật WebKit (gần nhất iOS 18, vá ở 18.1.1) — quyết định chọn theo độ tin cậy thực tế của nền tảng, không phải API có tồn tại hay không. Android: `getUserMedia({ video: { facingMode: 'environment' } })` hiện `<video>` sống (`#camera-live`) đè lên `#camera-box`, bấm "📸 Chụp" vẽ frame hiện tại lên `<canvas id="camera-canvas">` (ẩn) rồi `toBlob()` — Blob này đưa thẳng vào `handleNewPhotoBlob()`, **cùng 1 pipeline** với ảnh từ `<input type="file">` (không viết lại logic preview/resize). `getUserMedia` lỗi (từ chối quyền, thiết bị/WebView không hỗ trợ) → bắt ở `catch`, rơi về `kien-camera-input.click()` như iOS, không để màn hình đứng/trắng. `stopCameraStream()` tắt hẳn track camera (đèn camera, tốn pin) khi: bấm chụp xong, bấm "Hủy", hoặc tab/app bị ẩn (`visibilitychange`) — **chưa test được trên thiết bị Android thật** trong quá trình phát triển (sandbox không có camera thật, headless Chrome + fake-device flag không mô phỏng đúng hành vi WebView Android), cần crew test thực tế trước khi tin tưởng hoàn toàn luồng này.
- `manifest-hang.html` — chọn 1 chuyến, xem kiện gom theo tỉnh (thứ tự theo `tinh_tuyen.thu_tu`, chiều lấy từ `chuyen.chieu`: bac = ASC, nam = DESC). Mỗi dòng kiện chuyển đổi tại chỗ trong cùng 1 `.kien-row` (không điều hướng trang) qua các hàm `renderKienRowView` / `renderKienRowEdit` / `renderKienRowThuTien` / `renderKienRowViTri`:
  - **`?chuyen_id=<uuid>` trong URL preselect dropdown** (`loadChuyenOptions`) — nếu id có trong danh sách 50 chuyến gần nhất thì chọn chuyến đó thay vì mặc định chuyến mới nhất; dùng bởi link từ `lich-su-chuyen.html`. **Chuyến `trang_thai = 'xong'` KHÔNG hiện trong dropdown này (đổi 2026-09-21, theo phản ánh thật — trước đó hiện lẫn cả chuyến đã xong lộn xộn trong danh sách 50 chuyến gần nhất)** — xem lại chuyến đã xong thì qua `lich-su-chuyen.html` (đúng ý nghĩa "lịch sử"), trang này chỉ còn `dang_chay`/`dat_truoc`. **NGOẠI LỆ**: nếu `?chuyen_id=` trỏ ĐÚNG 1 chuyến `xong` (link "Xem" từ nhóm "Chuyến đã hoàn thành" ở `lich-su-chuyen.html` vẫn trỏ về đây, xem bullet đó ở mục Pages), chuyến đó VẪN được thêm vào dropdown + chọn sẵn — chỉ ẩn khỏi danh sách MẶC ĐỊNH, không chặn truy cập trực tiếp qua link. `chuyenList` (biến module-level) vẫn giữ TOÀN BỘ 50 chuyến fetch được (mọi trạng thái) — chỉ phần render `<option>` bị lọc qua `visibleList`, nên `.find(c => c.id === ...)` ở listener `change`/preselect vẫn hoạt động đúng cho chuyến đang hiện trên dropdown.
  - **Nút "🏁 Kết thúc chuyến"** (`#btn-ket-thuc-chuyen`, full-width BÊN DƯỚI danh sách kiện hàng, không còn nằm cạnh dropdown chọn chuyến) — `confirmDialog()` rồi `UPDATE chuyen.trang_thai = 'xong'` cho chuyến đang chọn trên dropdown. `updateEndTripButton(chuyen, kienList)` quyết định trạng thái nút: chuyến đã `xong` → **ẩn hẳn** (`display:none`, không còn gì để kết thúc); chuyến chưa `xong` → **luôn hiện** nhưng chỉ **bấm được** khi mọi kiện trong `kienList` đều `trang_thai === 'da_giao'` hoặc `'tra_lai'` (`kienList.every(...)` — `tra_lai` coi là đã xử lý xong, không chặn kết thúc chuyến), còn kiện nào `chua_giao` thì nút hiện ở trạng thái khoá (`disabled=true`, `opacity:0.5`, `cursor:not-allowed`, `title` giải thích) — cố ý **không ẩn hẳn** khi còn hàng chưa giao (khác bản đầu tiên) để crew luôn thấy nút ở đó, biết còn việc cần làm trước khi kết thúc được chuyến, thay vì cảm giác "nút biến mất". Handler `click` có kiểm tra lại điều kiện y hệt trước khi `confirmDialog()` (phòng trường hợp `disabled` bị bấm qua, vd Enter trên nút đang focus) — báo toast lỗi thay vì tiến hành nếu còn kiện `chua_giao`. `kienList` giữ ở biến module-level `currentKienList` (set trong `loadManifest`) để `refreshEndTripButton()` gọi lại được sau khi đổi trạng thái 1 kiện tại chỗ (trong `toggleDaGiao`, cả nhánh đánh dấu giao lẫn revert khi lỗi) mà không cần reload lại toàn bộ manifest. Đây là nơi DUY NHẤT trong app set `trang_thai = 'xong'` — trước đó không có UI nào làm việc này, chuyến chỉ có thể được tạo (`dang_chay`) chứ không bao giờ kết thúc được. Kết thúc chuyến khiến nó biến mất khỏi danh sách "0. Chọn chuyến đang chạy" ở `hang.html` (lọc `trang_thai = 'dang_chay'`) và ẩn nút "+ Tạo chuyến mới" ở đó (bị ẩn khi đang có chuyến `dang_chay`) — không có nút "mở lại chuyến" (chưa yêu cầu).
  - **`renderKienRowView` chỉ có 1 nút chính + 1 menu "⋯"** (không còn nhiều nút `.btn-sm` cùng hàng như trước) — tránh bấm nhầm khi crew thao tác 1 tay lúc xe rung lắc. 3 nhóm trạng thái phân biệt bằng 2 cờ `daGiao`/`traLai` (`chuaGiao = !daGiao && !traLai`): **Chưa giao**: nút chính `.btn-primary-action` "Hoàn thành" (gọi `toggleDaGiao`), menu có "Sửa" (`renderKienRowEdit`) + "📞 Ghi nhận đã gọi" + "↩️ Trả hàng" (`traHang`) + "Hủy đơn" (`huyDon`, xem bullet riêng bên dưới). **Đã giao**: KHÔNG có nút chính (mọi thao tác còn lại đều là sửa sai, tần suất thấp) — menu gộp cả "Sửa", "Hủy giao" (`toggleDaGiao` theo chiều ngược), "Sửa tiền"/"Thu tiền" (`renderKienRowThuTien`) — KHÔNG có "Hủy đơn" (đã giao thì phải "Hủy giao" về `chua_giao` trước mới hủy đơn được, không tắt trực tiếp từ `da_giao`). **Hàng hoàn** (`tra_lai`): KHÔNG có nút chính, menu chỉ còn "Sửa" + "↺ Khôi phục (bỏ trả hàng)" (`khoiPhucTraLai`, đảo ngược về `chua_giao` nếu `traHang` bấm nhầm) — mọi hành động khác (Ghi nhận đã gọi/Trả hàng/Hủy đơn/Hủy giao/Thu tiền) đều vô nghĩa ở trạng thái này nên ẩn hết. Badge trạng thái đổi nhãn theo 3 nhóm ("Chưa giao"/"Đã giao"/"Hàng hoàn", xem bullet CSS riêng bên dưới).
  - **Chuyến đã `trang_thai = 'xong'` → KHÔNG render `.kien-actions` cho BẤT KỲ kiện nào** (biến module-level `chuyenDaXong`, set trong `loadManifest` ngay từ `chuyen.trang_thai === 'xong'`, đọc lại trong `renderKienRowView`) — không còn nút "Hoàn thành" lẫn menu "⋯" (nên không thể "Hủy giao"/"Sửa"/"Sửa tiền"/"Trả hàng"/"Hủy đơn"/"Khôi phục" nữa), chỉ còn xem lại thông tin đã giao. Lý do: chuyến đã kết thúc coi như hồ sơ đã chốt, sửa lại lúc này (đặc biệt "Hủy giao" đảo `da_giao` về `chua_giao`) dễ gây sai lệch số liệu đã báo cáo mà không có gì ngăn cản trước đó. Mọi `row.querySelector('.menu-*')` sau đó đều dùng `?.` (kể cả `.menu-sua` và `.btn-menu-more` — trước đây gọi thẳng không optional-chaining vì luôn tồn tại) vì `.kien-actions` có thể không tồn tại trong DOM ở trạng thái khoá này. Không ảnh hưởng nút "🏁 Kết thúc chuyến" — nút đó đã tự ẩn hẳn khi `trang_thai === 'xong'` từ trước (xem `updateEndTripButton`).
  - **`huyDon`** — hủy hẳn 1 kiện (khách đổi ý không gửi nữa), khác hoàn toàn "Hủy giao". `confirmDialog()` rồi `UPDATE kien.trang_thai = 'huy'`, sau đó gọi lại `loadManifest(chuyen)` (refetch toàn bộ danh sách) thay vì tự xoá 1 dòng DOM — đảm bảo tiêu đề tỉnh tự ẩn nếu đó là kiện cuối cùng của tỉnh đó, khớp cách `tinh-group` chỉ render khi còn kiện (xem `loadManifest`). Kiện `trang_thai = 'huy'` bị loại khỏi mọi nơi qua filter ngay ở query nguồn của `loadManifest` (xem bullet `trang_thai 'tra_lai'` ở mục Database) — banner COD/tổng tiền không cần sửa riêng vì đều dùng chung mảng đã lọc.
  - **`traHang`** — đánh dấu 1 kiện `chua_giao` thành `tra_lai` (đã tới điểm giao nhưng không giao được), cùng pattern với `huyDon` cho trường hợp trả NGUYÊN kiện: `confirmDialog()` (cảnh báo thêm nếu `demSoLanThuLienLac(k.ghi_chu) === 0`, tức chưa "Ghi nhận đã gọi" lần nào — vẫn cho tiếp tục nếu crew xác nhận, không chặn cứng) rồi `UPDATE kien.trang_thai = 'tra_lai'`, gọi lại `loadManifest(chuyen)`. Chỉ hiện trong menu "⋯" khi `chua_giao` (không cho trả hàng 1 kiện đã giao — phải "Hủy giao" về `chua_giao` trước, giống ràng buộc của "Hủy đơn"). Xem bullet `trang_thai 'tra_lai'` ở mục Database để biết toàn bộ luồng nghiệp vụ (mang hàng về ở chuyến ngược — UI liên kết `kien_goc_id` đã bị gỡ, xem ghi chú ở đó).
    - **Hỗ trợ trả 1 PHẦN khi `so_luong > 1`** (vd kiện 4 thùng, khách chỉ trả lại 1 thùng) — chỉ hỏi số lượng qua `prompt()` khi `k.so_luong > 1` (đa số kiện `so_luong = 1` thì bấm "Trả hàng" hành xử y hệt bản gốc, không hỏi gì thêm). Để trống ô nhập = trả hết. Nếu số lượng nhập < `so_luong`: **TÁCH thành 1 kiện mới** (`sb.from('kien').insert(...)`, `id` mới, copy `diem_id`/`anh_url`/`nguoi_nhan_sdt`/`ghi_chu`/`loai_hang` từ kiện gốc, `trang_thai: 'tra_lai'`, `so_luong` = số lượng vừa nhập) thay vì chỉ sửa `trang_thai` tại chỗ — kiện gốc **UPDATE giảm `so_luong`** (trừ đi phần đã tách) và **giữ nguyên `trang_thai`** cũ (`chua_giao`, vẫn phải giao tiếp phần còn lại), có append 1 dòng `ghi_chu` audit "Đã tách N kiện sang trạng thái trả hàng lúc HH:mm dd/MM" (KHÔNG bắt đầu bằng `[` — cố ý khác format của "Ghi nhận đã gọi" để không bị `demSoLanThuLienLac` đếm nhầm thành 1 lần gọi). `loai_hang` (chuỗi text tự do dạng "1 Thùng xốp, 2 Thùng giấy") **KHÔNG được parse/tách theo từng loại** — cả kiện gốc lẫn kiện tách đều giữ nguyên chuỗi `loai_hang` gốc, chấp nhận hiển thị hơi lệch (crew tự hiểu theo ngữ cảnh `so_luong` mới của từng kiện). `hinh_thuc_thu` KHÔNG copy sang kiện tách (để `null`, không rõ hình thức thu cho riêng phần tách).
    - **Tiền COD/cước KHÔNG tự chia theo tỷ lệ số lượng** (hệ thống không có khái niệm đơn giá/thùng) — nếu kiện gốc có `tien_thu_ho > 0` và/hoặc `tien_thu != null`, hỏi tay qua `hoiSoTienHoan()` (dùng `prompt()`, đơn vị nghìn đồng giống quy ước nhập tiền toàn app, giới hạn `[0, giá trị gốc]`, để trống = không tách phần tiền nào cho kiện mới) — mỗi loại tiền hỏi riêng 1 lần nếu có. Kiện tách nhận đúng số tiền vừa nhập; kiện gốc bị trừ đi tương ứng (`|| null` khi về đúng 0, để khớp check `!= null` ở nơi khác thay vì để `0` trơ). Bấm Hủy ở bất kỳ hộp thoại `prompt()` nào (số lượng lẫn số tiền) → dừng toàn bộ, không ghi gì xuống DB.
    - **Caveat đã biết, chưa xử lý**: trigger DB "insert vào `kien` tự +1 `diem.so_lan_giao`" (xem mục Database) sẽ chạy lại cho kiện tách mới — `so_lan_giao` của điểm đó bị đếm dư 1 so với thực tế (kiện tách không phải 1 lượt giao mới, chỉ là tách bản ghi cũ). Chấp nhận được vì `so_lan_giao` hiện chỉ dùng tham khảo, chưa có UI nào phụ thuộc số chính xác tuyệt đối.
  - **`ghiNhanDaGoi`** — append 1 dòng `"[HH:mm dd/MM] Thử liên lạc - không nghe máy"` vào `kien.ghi_chu` hiện có (nối bằng `\n`, KHÔNG ghi đè, KHÔNG cột DB riêng), gọi được nhiều lần không giới hạn. Chỉ hiện trong menu "⋯" khi `chua_giao`. **`demSoLanThuLienLac(ghiChu)` hiện KHÔNG có badge nào hiển thị ở `renderKienRowView`** (bullet cũ ở đây từng ghi "hiện gợi ý mềm '— Đã thử liên lạc: N lần' cạnh SĐT" — ĐÃ KHÔNG CÒN ĐÚNG, badge đó bị gỡ ở 1 đợt sửa nào đó mà tài liệu chưa cập nhật kịp, phát hiện lúc audit 2026-09-22) — điểm dùng thật DUY NHẤT còn lại là trong `traHang()`, quyết định có chèn cảnh báo mềm `"⚠ Chưa ghi nhận lần gọi nào cho kiện này."` vào `confirmDialog` hay không (`=== 0` mới cảnh báo, vẫn cho tiếp tục nếu crew xác nhận). **Bug đã sửa (2026-09-22)**: hàm cũ đếm MỌI dòng `ghi_chu` bắt đầu bằng `[` (`.startsWith('[')`), nên đếm NHẦM cả 2 dạng dòng audit "AI tự điền SĐT..." (người nhận lẫn người gửi, xem mục "Chưa làm" → AI/OCR) thành "1 lần thử liên lạc" — sửa bằng cách đổi điều kiện lọc sang match đúng cụm `"Thử liên lạc"` (`dong.includes('Thử liên lạc')`) thay vì `startsWith('[')`. Tác động bug chỉ ở đúng chỗ dùng thật kể trên (cảnh báo mềm lúc "Trả hàng"), không có badge nào khác bị sai vì badge đó vốn không tồn tại. `.kien-row .mota` thêm `white-space: pre-line` để các dòng ghi_chu nhiều dòng (do tính năng ghi log này tạo ra) xuống dòng đúng thay vì dồn thành 1 dòng dài.
  - **Menu "⋯" dùng `.kien-menu` với `position: fixed`, toạ độ tính bằng JS** (`openKienMenu`, dựa `getBoundingClientRect()` của nút vừa bấm) — KHÔNG dùng `position: absolute` neo theo `.kien-actions` như cách thường làm, vì `.tinh-group` cha có `overflow: hidden` (để bo góc `<h3>` tiêu đề tỉnh) sẽ cắt mất phần menu tràn ra ngoài khung nếu dùng absolute. `openKienMenu` hiện menu (`classList.add('open')`) TRƯỚC rồi mới đo `offsetWidth`/`offsetHeight` thật để tính vị trí — bắt buộc phải đo sau khi hiện vì phần tử `display:none` luôn có `offsetWidth/offsetHeight = 0`. Neo theo mép PHẢI của nút "⋯" rồi kẹp `left` trong khoảng `[8px, innerWidth - width - 8px]`, KHÔNG neo cứng bằng `right` — trên mobile khi `.kien-actions` chỉ có 1 mình nút "⋯" (trạng thái đã giao), nút nằm sát mép trái (flex-start), nếu chỉ set `right` theo mép nút thì menu bị đẩy tràn hẳn ra ngoài mép trái màn hình, nhìn như 1 khối trắng trống không chữ (đã gặp lỗi này thực tế trên điện thoại, đã fix). Tương tự theo chiều dọc: mặc định mở `top = rect.bottom + 4` (xuống dưới nút), nhưng nếu `top + offsetHeight` tràn quá `innerHeight` (dòng kiện cuối cùng của danh sách thường sát đáy màn hình) thì lật lên mở phía TRÊN nút (`top = rect.top - offsetHeight - 4`) thay vì cứ cắm xuống dưới — cũng đã gặp lỗi thực tế (chữ "Hủy giao" bị cắt nửa dòng ở đáy màn hình khi mở dòng kiện cuối), đã fix. Đóng menu khi: bấm lại chính nút "⋯" (toggle), bấm 1 mục trong menu (row re-render/innerHTML thay thế), hoặc bấm ra ngoài (1 listener `click` gắn ở `document`, đăng ký DUY NHẤT 1 lần ở top-level script — không đặt trong `renderKienRowView` vì hàm đó chạy lại mỗi lần render 1 dòng, đặt trong đó sẽ tích luỹ nhiều listener trùng lặp qua các lần re-render).
  - **`toggleDaGiao`** chuyển UI sang `renderKienRowThuTien` (nhập tiền thu) **ngay lập tức, không chờ mạng/GPS** — set `k.trang_thai = 'da_giao'` optimistic trước, rồi mới bắt GPS (nếu `diem` chưa có toạ độ, có thể mất tới 15s — xem mục "Toạ độ điểm giao + km_moc") và `UPDATE kien.trang_thai` chạy ngầm phía sau; nếu update DB lỗi thì revert `k.trang_thai` về `chua_giao` + render lại `renderKienRowView` kèm toast lỗi. Theo chiều ngược ("Hủy giao", không có GPS nên vẫn update đồng bộ như cũ) quay về `renderKienRowView`. **Nếu `k.tien_thu` đã có sẵn giá trị** (khách trả cước ngay lúc gửi ở `hang.html`, xem nút "Đã thu cước" trên) thì bỏ qua bước hiện `renderKienRowThuTien`, về thẳng `renderKienRowView` — tránh hỏi thu tiền 2 lần. Nút "Sửa tiền" trong menu "⋯" vẫn hoạt động bình thường sau đó nếu crew cần sửa lại.
  - **`renderKienRowViTri`** (sửa tay `lat`/`lng` của `diem`, tính lại `km_moc` khi lưu) — code vẫn còn nguyên nhưng **không có đường gọi tới từ UI** (đã bị ẩn khỏi `renderKienRowView` từ trước, và không được thêm vào menu "⋯" khi làm lại UI nút — dead code có chủ đích, giữ lại phòng khi cần bật lại lối sửa tay toạ độ)
  - **`renderKienRowThuTien` không còn nút "Lưu"/"Hủy" chung chung** — thay bằng 2 nút "💵 Tiền mặt" / "🏦 Chuyển khoản", cả 2 đều lưu (không có nút hủy riêng), khác nhau ở giá trị `hinh_thuc_thu` ghi kèm `tien_thu`. Nếu để trống ô tiền (xoá `tien_thu` về null) thì `hinh_thuc_thu` cũng lưu null bất kể bấm nút nào. Hiển thị lại ở `renderKienRowView`, dòng "Đã thu: Xđ (Tiền mặt)"/"(Chuyển khoản)" — chỉ hiện phần hình thức nếu có giá trị (dữ liệu cũ trước khi thêm cột này sẽ không có).
  - **Cảnh báo thu hộ (COD)** — `renderCodSummary` loại kiện `trang_thai === 'tra_lai'` khỏi mọi tính toán (hàng đã hoàn không còn khả năng thu COD nữa), rồi hiện banner `#cod-summary` phía trên danh sách CHỈ KHI còn kiện `tien_thu_ho > 0` mà `tien_thu < tien_thu_ho` (chưa thu đủ): tổng cần thu, tổng đã thu, số kiện chưa thu đủ. Đã thu đủ hết (hoặc chuyến không có kiện COD) → banner tự ẩn, không còn gì để cảnh báo. Mỗi dòng kiện có `tien_thu_ho` cũng hiện badge màu `--warning` "💰 Thu hộ: Xđ" (kèm "⚠ chưa thu đủ" nếu đã giao mà `tien_thu < tien_thu_ho`) — badge này hiện cả khi chưa giao, không tự ẩn như banner. Số tiền cần thu hộ cũng hiện lại trong `renderKienRowThuTien` lúc nhập tiền thực thu để đối chiếu.
  - **Tổng doanh thu chuyến** (`renderDoanhThuSummary`, banner `#doanhthu-summary` phía trên `#cod-summary`, thêm 2026-09-14) — tổng CHỈ `kien.tien_thu` (cước thực thu), KHÔNG cộng `tien_thu_ho` (tiền hộ khách, không phải doanh thu nhà xe). Tính ở client mỗi lần render, KHÔNG có cột riêng trong DB (quyết định owner — tránh đồng bộ trigger/UPDATE thêm cho 1 con số suy ra được từ dữ liệu đã có). Cộng CẢ kiện `tra_lai` nếu đã thu cước trước lúc gửi (tiền đã thu thật, không hoàn lại dù hàng bị trả) — chỉ loại `huy` (đã loại sẵn từ query nguồn `loadManifest`). Ẩn banner khi tổng = 0 (chuyến chưa thu đồng nào). Gọi lại ở 2 chỗ để "cập nhật mỗi khi hoàn thành thu tiền" đúng nghĩa: `loadManifest` (mọi lần tải lại toàn bộ, kể cả sau `traHang` tách tiền) và ngay sau `renderKienRowThuTien` lưu thành công (không cần đợi `loadManifest` reload cả trang).
  - **Dòng "Đã thu" phân biệt trả cước lúc gửi vs thu lúc giao** — `renderKienRowView` tính `thuTruocKhiGiao = coTien && !daGiao` (có `tien_thu` mà chưa giao thì chỉ có thể đến từ nút "Đã thu cước" ở `hang.html`) để đổi nhãn thành "💵 Đã thu cước lúc gửi" thay vì "Đã thu" thông thường — badge này hiện NGAY CẢ KHI kiện chưa giao (khác các badge tiền khác vốn chỉ có ý nghĩa sau khi giao). Sau khi giao thì tự động đổi lại nhãn "Đã thu" bình thường vì `daGiao` lúc đó = true.
  - **Kiện đã giao tô nền xanh nhạt** (`.kien-row-da-giao`, `background: var(--success-light)`) — toggle qua `row.classList.toggle('kien-row-da-giao', daGiao)` trong `renderKienRowView`, giúp quét mắt nhanh biết kiện nào xong trong danh sách dài mà không cần đọc từng badge. Chỉ set trong `renderKienRowView`, không set khi `toggleDaGiao` nhảy thẳng sang `renderKienRowThuTien` (kiện vừa đánh dấu xong sẽ chưa có nền xanh cho tới khi quay lại view sau khi Lưu/Hủy tiền) — chấp nhận được vì đó chỉ là khoảnh khắc đang nhập liệu. Tương tự, kiện `tra_lai` tô nền be nhạt riêng (`.kien-row-tra-lai`, `#f2ede6`) + badge riêng (`.badge.tra_lai`, `#e9e2d6`/`#8a6d3b`) để không lẫn với "Đã giao" (xanh) hay "Chưa giao" (đỏ nhạt) khi quét mắt danh sách.
  - `kien.so_luong > 1` hiện `×N` màu `--primary` ngay cạnh tên điểm (`.so-luong`) — CHỈ khi kiện không có `loai_hang` (fallback cho dữ liệu không phân loại); có `loai_hang` thì số lượng đã nằm sẵn trong chuỗi đó rồi, xem bullet "Số lượng / Loại hàng" ở `hang.html`
  - **Điểm trả khách chen vào cuối mỗi nhóm tỉnh (2026-09-16)** — `loadManifest` thêm query `ve` (join `diem_khach!diem_xuong_id` qua alias PostgREST, CHỈ lấy `trang_thai = 'da_dat'`), gộp theo `diem_khach.id` (`diemXuongInfoMap`), lọc theo `tinh.ma` giống kiện hàng nhưng **CHỈ điểm XUỐNG (trả khách)** — không lấy điểm lên, vì trang này là danh sách GIAO HÀNG, không phải toàn hành trình khách. Xếp SAU kiện hàng trong cùng nhóm (không có `km_moc` để so, chỉ xếp gần đúng theo tên bỏ dấu — `boDau` từ `point-match.js`, mới thêm script tag vào trang này). Tiêu đề nhóm tỉnh thêm hậu tố `+ N điểm trả khách` khi có. Nhóm tỉnh giờ cũng hiện được dù KHÔNG có kiện hàng nào (chỉ có khách xuống) — điều kiện ẩn nhóm đổi từ `!kiensCuaTinh.length` sang `!kiensCuaTinh.length && !diemXuongCuaTinh.length`.
    - **Nút "✅ Trả khách" ngay tại từng dòng khách** (`createDiemXuongRow`) — KHÔNG chỉ xem như bản đầu (đã đổi ngay sau khi làm, theo yêu cầu tiếp theo) — `confirmDialog()` rồi `UPDATE ve.trang_thai = 'huy'` cho đúng vé đó, gọi lại `loadManifest(chuyen)` để tỉnh/đếm/nhóm tự cập nhật (cùng pattern `huyDon`/`traHang` bên kiện hàng, đơn giản hơn tự vá DOM tại chỗ). **`ve` KHÔNG có trạng thái riêng "đã lên/đã xuống xe"** (chỉ `'da_dat'|'huy'`, xem mục Database) — "Trả khách" ở đây dùng CHUNG đúng 1 UPDATE với "Huỷ vé" ở `khach.html`, vì đó là cách DUY NHẤT giường trống lại trong schema hiện tại; không phải bug/nhầm lẫn giữa 2 khái niệm, chỉ là 1 schema 2 tên gọi theo ngữ cảnh. Mỗi điểm có thể nhiều khách nên mỗi khách 1 nút riêng (`.khach-xuong-item`), không phải 1 nút cho cả điểm. Vẫn còn link nhỏ "Xem trong Danh sách →" mở `khach.html?chuyen_id=...&view=danh_sach` cạnh tên điểm, cho trường hợp cần sửa thông tin khách (tên/SĐT/điểm/giá) — việc đó vẫn phải qua `khach.html`, trang này chỉ thêm đúng 1 hành động nhanh (đánh dấu xong).
  - Bấm vào ảnh thumbnail mở lightbox phóng to (`#lightbox`) — **`openLightbox()` push 1 history entry** (`history.pushState`), `popstate` đóng lại lightbox thay vì để mặc định thoát PWA — không có entry này thì bấm Back/vuốt gesture Android lúc đang xem ảnh sẽ thoát thẳng khỏi app (đóng lightbox chỉ là đổi class CSS, không phải điều hướng thật nên trình duyệt không có gì để lùi). Bấm ra ngoài để đóng (tap-to-close) cũng gọi `history.back()` để tiêu thụ luôn entry vừa push, tránh phải bấm Back 2 lần khi thật sự muốn rời trang sau đó. Cùng ý tưởng history-guard với Back-button ở `hang.html` nhưng đơn giản hơn (chỉ 1 trạng thái mở/đóng, không phải nhiều bước) — 2 nơi cài đặt độc lập, không dùng chung hàm.
  - **Nút "🔍 Đối chiếu SĐT bằng AI"** (`chayDoiChieuSdt`, dưới danh sách kiện, cạnh "🏁 Kết thúc chuyến") — lớp kiểm tra chéo SĐT gõ tay với số viết tay đọc lại từ ảnh, gọi qua `api/doi-chieu-sdt.js` (model `qwen-vl-ocr`, Alibaba Cloud Model Studio/DashScope). **Ẩn hẳn khi `chuyenDaXong`** — quyết định có chủ đích: banner kết quả lệch có nút "Sửa" gọi thẳng `renderKienRowEdit(row, k)`, đường gọi này KHÔNG đi qua `.kien-actions`/menu "⋯" nên không tự động bị khoá bởi cơ chế `chuyenDaXong` đã có (xem bullet đó phía trên) — ẩn nút kích hoạt là cách đơn giản nhất để không mở lại đường sửa kiện của 1 chuyến đã chốt số liệu.
    - **Nguồn danh sách: query riêng, KHÔNG dùng `currentKienList`** (biến đó set trong `loadManifest`, chỉ loại `huy` nhưng dùng chung cho nhiều mục đích khác) — query mới trong `chayDoiChieuSdt` cũng chỉ loại `trang_thai = 'huy'`, GIỮ LẠI `chua_giao`/`da_giao`/`tra_lai`, chỉ đòi `anh_url` khác null. **KHÔNG còn đòi `nguoi_nhan_sdt` khác null** (khác bản đầu) — sửa đúng 1 mâu thuẫn thật gặp lúc test: kiện có ảnh chụp rõ số nhưng crew quên gõ SĐT (`nguoi_nhan_sdt = null`) từng bị filter loại thẳng dù ảnh đủ để đọc, xem bullet `mode: 'read'` ở `hang.html`. Kiện `tra_lai` ("Hàng hoàn") CỐ Ý được giữ trong lượt đối chiếu — SĐT sai có thể chính là lý do giao không được, đáng kiểm tra lại.
    - **2 luồng song song sau khi tải danh sách**: kiện ĐÃ có `nguoi_nhan_sdt` → `mode: 'compare'` (so khớp, y hệt trước); kiện THIẾU `nguoi_nhan_sdt` → `mode: 'read'` (chỉ đọc, không có gì để so) — 2 tập hợp tách riêng, chạy `Promise.all` qua cùng 1 helper `goiTheoLo(items, body, onProgress)`, `BATCH_SIZE = 3` áp dụng độc lập cho từng luồng (khởi điểm thận trọng, xem ghi chú ở mục "Chưa làm"). Lô nào cả request lỗi (không phải lỗi 1 item) → toàn bộ kiện trong lô đó được đánh dấu `loi: true` ở client (bắt trong `catch`), tiếp tục lô kế tiếp — không mất kết quả các lô đã chạy xong. Chữ trên nút "Đang đối chiếu X/Y..." cập nhật dùng chung 1 biến đếm `daXong` cho cả 2 luồng qua callback `onProgress`.
    - **`api/doi-chieu-sdt.js` mode `'read'` có 2 hình thức input** (khác `mode: 'compare'` chỉ có 1 hình thức `items`): `{anh_base64, mime_type}` — 1 ảnh chưa upload, dùng bởi `hang.html` (xem bullet riêng ở đó); `{items: [{kien_id, anh_url}]}` — LÔ nhiều kiện đã có `anh_url` (đã upload), dùng bởi `chayDoiChieuSdt` ở đây. Route tự phân biệt qua có `req.body.items` hay không — không phải 2 mode riêng, tránh nhân đôi logic timeout/gọi DashScope trong `docSdtTuAnh`. Trả về `{ketQua: [{kien_id, sdt_ai_doc?, khong_doc_duoc?, loi?}]}` — KHÔNG có `khop` (không có gì để so, khác `mode: 'compare'`).
    - **`api/doi-chieu-sdt.js` mode `'compare'`** nhận `{items: [{kien_id, anh_url, sdt_da_nhap}]}` (đúng 1 lô), xử lý TUẦN TỰ từng ảnh (đơn giản, dễ debug/map đúng kiện — gộp nhiều ảnh/1 lần gọi là tối ưu chưa làm ở v1), lỗi 1 item (`try/catch` riêng từng item) không chặn item khác trong cùng lô. Trả về `{ketQua: [{kien_id, sdt_ai_doc?, khop?, khong_doc_duoc?, loi?}]}`. Có `chuanHoaSdt()` riêng trong file này (không import từ đâu, route serverless độc lập) — bỏ ký tự không phải số, đổi đầu `84` thành `0` có kiểm tra tránh nhân đôi số `0` nếu người viết đã giữ nguyên (`+84 0987654321` → `0987654321`, không phải `00987654321`). So khớp bằng `chuanHoaSdt(a) === chuanHoaSdt(b)`, không so chuỗi thô.
    - **Không lưu persistent** — kết quả đối chiếu/gợi ý chỉ tồn tại trong biến JS lúc đang xem trang (`#doichieu-summary`), đóng trang/đổi chuyến là mất, bấm lại nút để chạy lại. Trade-off có chủ đích cho v1, tránh phải thêm schema mới.
    - **Hiển thị tối đa 3 khối riêng biệt trong `#doichieu-summary`, xử lý khác nhau theo mức độ tin cậy**: (1) "⚠️ N kiện có thể lệch SĐT" (`khop === false`/`khong_doc_duoc`/`loi`/`khong_chac` từ luồng `compare`) — kiện ĐÃ có SĐT crew tự gõ, mâu thuẫn với AI đọc được → CHỈ hiện để xem, nút "Sửa" mở `renderKienRowEdit(row, k)` bình thường (không prefill, không tự ghi) vì đây là dữ liệu crew đã chủ động nhập tay, không tự động hoá; (2) "🆕 N kiện thiếu SĐT — AI gợi ý số" (luồng `read`, `sdt_ai_doc` hợp lệ + nhất quán) — kiện HOÀN TOÀN CHƯA có SĐT, KHÁC (1) ở chỗ không có gì để "ghi đè" nên **tự động ghi thẳng `kien.nguoi_nhan_sdt`** qua nút gộp "⚡ Điền tất cả N số" (quyết định owner, 2026-09-10 — ưu tiên giảm thao tác, chấp nhận rủi ro còn lại của OCR); (3) "🤔 N kiện AI đọc không chắc" (`khong_chac`) — cũng thuộc luồng `read` nhưng không đủ tin cậy để tự động, xử lý như (1) (nút "Sửa" thủ công, không tự ghi). Dùng class `.sdt-goi-y` (màu `--primary`) cho (2)/(3) thay vì `.sdt-ai` (màu `--danger`) dùng ở (1) — CỐ Ý khác màu, tránh gây cảm giác "sai/lệch" cho 1 con số chỉ đơn thuần là gợi ý/chưa chắc, chưa có gì thật sự để đối chiếu.
    - **"⚡ Điền tất cả N số"** (chỉ xuất hiện khi `goiY.length > 0`) — **1 `confirmDialog()` DUY NHẤT cho cả lô** (khác các thao tác ghi khác trong app vốn confirm từng kiện — cố ý gộp vì đây vốn đã là 1 hành động hàng loạt, hỏi từng kiện sẽ ngược lại chính mục đích "giảm thao tác" của tính năng), rồi loop `UPDATE kien.nguoi_nhan_sdt` tuần tự từng kiện trong `goiY`. **Guard `.is('nguoi_nhan_sdt', null)` trong câu UPDATE + `.select('id')` kiểm tra có row nào thực sự bị update không** — phòng trường hợp crew đã tự gõ SĐT cho đúng kiện đó (qua "Sửa" ở dòng kiện chính, ngay trong lúc đang xem khối gợi ý này) TRƯỚC khi bấm "Điền tất cả": guard này đảm bảo không ghi đè giá trị crew vừa nhập tay bằng số AI đọc từ snapshot `goiY` đã cũ — nếu không có guard, đây sẽ là 1 lỗi ghi đè âm thầm khó phát hiện (crew tưởng đã gõ đúng, tự nhiên bị AI ghi đè lại). Ghi thành công mới append dòng audit (xem bullet dưới) — kiện bị guard chặn thì bỏ qua, không audit gì cho kiện đó. Sau khi xong `loadManifest(chuyen)` để danh sách refresh, kiện vừa điền tự biến mất khỏi khối "🆕" (đã có SĐT).
    - **Audit trail**: mỗi kiện điền thành công, append 1 dòng `"[HH:mm dd/MM] AI tự điền SĐT: <số>"` vào `kien.ghi_chu` (cùng convention với "Thử liên lạc..."/"Đã tách N kiện..." đã có) — để sau này biết số này do AI tự điền, không phải khách cung cấp/crew gõ tay, hữu ích nếu có kiện giao nhầm/không liên lạc được cần truy lại nguồn gốc SĐT. Ghi audit là UPDATE **RIÊNG, không `await`, best-effort** (`.then(() => {})`) — không chặn UI chờ, không có audit vẫn không sao, giống các audit log khác trong app.
  - **Dưới 600px** (`@media (max-width: 600px)` trong `<style>` của trang): `.kien-row` chuyển `flex-wrap: wrap` — ảnh/tên điểm/badge giữ 1 hàng, `.kien-actions` LUÔN xuống hàng riêng full-width (áp dụng chung cho mọi trạng thái, không chỉ form Lưu/Hủy) — `.btn-primary-action` (nếu có) chiếm phần lớn hàng đó (`flex: 1`), `.btn-menu-more`/`.btn-sm` (form Sửa/Thu tiền/Vị trí) chia đều phần còn lại. **Đã thử để `.kien-actions` của `renderKienRowView` nằm chung hàng với ảnh/tên/badge (không full-width) — lỗi**: `.info` có `flex:1` + `min-width:0` nên bị bóp gần bằng 0 thay vì tự xuống dòng (flex-wrap chỉ ngắt dòng theo từng flex-item nguyên khối, không "cứu" được item co giãn được), khiến tên điểm/SĐT/ghi chú vỡ chữ chồng chéo lên nhau — y hệt lỗi gốc mà bản `.btn-sm` 4-nút trước đây từng gặp. Bài học: `.kien-actions` trên mobile PHẢI luôn full-width riêng hàng, không được để chung hàng với `.info`, bất kể có bao nhiêu nút bên trong.
- `khach.html` — module quản lý hành khách (đặt giường nội bộ), thêm 2026-09-14, HOÀN TOÀN TÁCH BIỆT khỏi module hàng hoá (không đụng `diem`/`kien`), chỉ chung `chuyen_id`. Nối vào vòng menu `renderSideMenu` (`shared.js`).
  - **Sơ đồ 44 giường tĩnh** (bảng `giuong`, seed 1 lần, không đổi theo chuyến) — 2 tầng × 22 giường, khớp mẫu owner cung cấp. Không có ô chặn cố định — cả 44 giường đều bán được (owner xác nhận, KHÁC ảnh mockup 2026-09-15 thứ 2 có ô ✕ — owner xác nhận ô ✕ đó CHỈ là style minh hoạ, không phải sơ đồ thật, không áp dụng).
    - **Hàng 1 → hàng cuối (hàng 7): `T1-02`/`T2-02` chuyển xuống làm giường thứ 5 hàng cuối** (2026-09-15 đợt 1) — `UPDATE giuong SET hang=7, vi_tri=5`, KHÔNG xoá/tạo lại giường (giữ nguyên `id`/`ma`), tổng vẫn 22 giường/tầng. Áp dụng đối xứng cả 2 tầng.
    - **Hàng 6 có khoảng trống giữa thật (lối cầu thang), hàng 1 được lấp lại đủ 3 giường** (2026-09-15 đợt 2, theo ảnh mockup thứ 2 — owner xác nhận khoảng trống hàng 6 trong ảnh LÀ cầu thang thật, khác ô ✕ chỉ là minh hoạ) — `T1-17`/`T2-17` (giường giữa hàng 6) CHUYỂN lên lấp `hang=1, vi_tri=3` (hàng 1 quay lại đủ 3 giường như ban đầu), hàng 6 CHỦ Ý không dồn lại `vi_tri` của 2 giường còn lại (giữ nguyên 1 và 3, không renumber về 1-2) — `vi_tri=2` bị bỏ trống có chủ đích để hiện đúng ô trống ở giữa. Tổng vẫn 44 giường bán được (owner xác nhận giữ nguyên 44, không giảm xuống 42) — chỉ là đổi vị trí vật lý giữa các hàng, không xoá giường nào.
    - **`renderGiuongGrid()` (`khach.html`) đặt icon theo đúng `vi_tri` thật (`grid-column: vi_tri`), số cột = `vi_tri` LỚN NHẤT trong hàng** — thay cho cách cũ (số cột = số giường thực tế trong hàng, các giường luôn dồn sát nhau). Cách cũ không biểu diễn được khoảng trống thật giữa hàng (hàng 6) vì chỉ đếm SỐ LƯỢNG giường chứ không quan tâm `vi_tri` cụ thể — 2 giường hàng 6 (vi_tri 1 và 3) sẽ bị vẽ dính sát nhau như đang ở vi_tri 1,2, không lộ ra khoảng trống ở giữa. Hàng không có khoảng trống (vi_tri liên tục 1..N, đa số các hàng) thì hành vi giống hệt cách cũ. Icon vẫn giữ kích thước cố định cho mọi hàng bất kể số cột (1 class CSS chung `.giuong-hang`, không còn 2 class cứng `.giuong-hang-thuong`/`.giuong-hang-cuoi` chỉ hỗ trợ đúng 3/4 cột như bản trước 2026-09-15) — kích thước đó là biến CSS `--seat-cell`, set trên chính `.giuong-hang` (**28px, KHÔNG PHẢI 54px như bản ghi cũ ở đây** — sai sót phát hiện lúc audit tablet 2026-09-21, đã grep xác nhận không có nơi nào khác override giá trị 28px này). Từ tablet, `--seat-cell` được nới lên 44px/52px — xem mục "Tối ưu mobile / PWA" phần quy ước tablet.
    - **Hàng 1-5 giãn từ 3 giường liền (vt 1,2,3) sang vt 1,3,5; hàng 6 giãn từ vt 1,3 sang vt 1,5** (2026-09-16, theo ảnh mockup thứ 3 khớp layout tổng thể — hàng 7 giữ nguyên) — CHỈ đổi `vi_tri` (dời chỗ trong cùng hàng, KHÔNG đổi `hang`, không xoá/tạo giường), áp dụng đối xứng cả 2 tầng (tầng trên khi đó GIẢ ĐỊNH đối xứng tầng dưới, chưa có ảnh xác nhận riêng — owner chưa phản hồi khác nên giữ giả định này). `renderGiuongGrid()` không cần sửa gì (đã tự tính cột theo `vi_tri` lớn nhất từ đợt sửa hàng 6 trước) — chỉ đổi data là hàng 1-5 tự hiện đúng 5 cột với giường ở cột 1/3/5 (giãn cách đều 2 bên), hàng 6 hiện giường ở cột 1/5. Đã verify: tổng vẫn 44 giường, không có `(tang,hang,vi_tri)` trùng lặp, và `ve.giuong_id` không đổi khi dời `vi_tri` nên vé cũ (nếu có) vẫn join đúng giường vật lý — không cần touch bảng `ve`.
    - **`ma` đánh số lại theo đúng thứ tự trái→phải, xuống hàng (2026-09-16, sau khi phát hiện lệch)** — nhiều đợt di dời `vi_tri` ở trên (2026-09-15/16) chỉ đổi vị trí hiển thị mà KHÔNG đánh số lại `ma`, dẫn tới `ma` không còn khớp thứ tự đọc trên sơ đồ (vd hàng 1 từng là `T1-01, T1-03, T1-17` — nhảy cóc; hàng cuối từng là `...T1-21, T1-02` — ghế phải cùng lại mang mã `02`). Chạy `UPDATE` qua `row_number() over (partition by tang order by hang, vi_tri)` (2 bước, đổi qua mã tạm `TMP-...` trước để tránh đụng unique constraint `giuong_ma_key` giữa chừng) — giờ `ma` LUÔN = thứ tự đọc trái→phải, xuống hàng, liên tục `T{tang}-01`…`T{tang}-22`, khớp đúng sơ đồ hiện tại (hàng 1-5: 3 ghế/hàng ở vt 1,3,5; hàng 6: 2 ghế ở vt 1,5; hàng 7: 5 ghế liền vt 1-5). Chỉ đổi cột `ma` (text hiển thị), KHÔNG đổi `id` — 4 vé thật trong DB lúc chạy vẫn join đúng giường vật lý qua `ve.giuong_id`, không cần touch bảng `ve`. **Nếu sau này còn di dời `vi_tri`/`hang` (như 2 đợt trước), PHẢI chạy lại đúng UPDATE này** — không có gì trong code tự động giữ `ma` đồng bộ với thứ tự đọc, dễ tái diễn lệch nếu quên.
  - **UI sơ đồ đổi theo design handoff (2026-09-15)** — nhận 1 file mockup HTML (`design_handoff_seat_map`, không phải code sản xuất, chỉ là tham chiếu hình thức/hành vi) qua file đính kèm, không kèm chỉ dẫn bằng lời nào khác ngoài "chỉnh sửa theo mẫu hình". Đã port phần VISUAL/LAYOUT khớp mockup, GIỮ NGUYÊN phần dữ liệu/form đã có sẵn đúng schema thật (mockup dùng field/hành vi mock không khớp DB thật — xem "Không port theo mockup" bên dưới):
    - **~~1 tầng/lượt qua tab~~ (`#tab-tang-1`/`#tab-tang-2`, biến `currentFloor`) — ĐÃ BỊ ĐẢO NGƯỢC sau đó, bullet này SAI so với code hiện tại, giữ lại có gạch ngang để biết lịch sử.** Bản 2026-09-15 (mô tả nguyên văn ở bullet này) từng đổi sang tab chọn 1 tầng — nhưng dòng comment còn sót lại ngay trong `khach.html` ("đã bỏ khái niệm tầng-đang-xem") xác nhận đã ĐẢO NGƯỢC lại về **2 tầng cạnh nhau cùng lúc** (`.tang-cols` flex, mỗi `.tang-col{flex:1 1 0}`) — không rõ đổi lại chính xác ngày nào (không có bullet ghi lại đợt đảo ngược này), phát hiện lúc audit tablet 2026-09-21 khi đọc code thay vì tin tài liệu. `dat-ve.html` dùng CHUNG pattern `.tang-cols` này (copy từ `khach.html`). Bài học: nếu nghi ngờ, đọc code — đừng tin CLAUDE.md khi nó mô tả hành vi UI có thể đã bị đổi lại mà không cập nhật tài liệu.
    - **Icon giường = SVG thật** (`SEAT_SVG`, hằng số dùng chung, khung viền `rx=10` + gối `rx=4.5` gần đáy, cả 2 nét `stroke="currentColor"`) thay cho div + `::before` CSS — màu đổi qua CSS `color` của `.giuong-icon` theo class trạng thái, không cần build lại SVG mỗi lần render.
    - **Thêm trạng thái thứ 3 "Đang chọn"** (`.dang-chon`, nền `--primary` đặc + icon trắng) — CHỈ hiện tạm thời trên đúng giường đang mở form (`selectedGiuongId`), mất ngay khi đóng modal — đây KHÔNG phải quay lại việc thêm màu cố định cho 1 nhóm giường như hàng cuối đã từ chối trước đó (2026-09-14), mà là phản hồi trực quan tức thời cho 1 thao tác đang diễn ra, tự động biến mất. **(2026-09-21) Class `.dang-chon` giờ dùng cho 2 khái niệm ĐỘC LẬP** — `selectedGiuongId` (giường ĐÃ ĐẶT đang mở modal sửa, hành vi CŨ giữ nguyên) HOẶC `selectedGiuongMap.has(g.id)` (giường TRỐNG đang multi-select để đặt vé mới, MỚI — xem bullet "Đặt vé giống dat-ve.html" bên dưới) — 1 giường chỉ rơi vào ĐÚNG 1 trong 2 trường hợp, không bao giờ trùng.
    - **Dòng "X giường trống · Y đã đặt"** (`#availability-caption`) tính riêng theo tầng đang xem, không phải cả xe.
    - **Bước xác nhận huỷ vé chuyển thành inline trong modal** (banner đỏ `#ve-cancel-section` + "Không"/"Xác nhận huỷ") thay vì gọi `confirmDialog()` toàn cục như trước — tránh chồng 2 lớp modal lên nhau, khớp mockup. Đây là NGOẠI LỆ so với quy ước chung của app (mọi chỗ huỷ khác vẫn dùng `confirmDialog()` — xem mục "Tiện ích dùng chung"), chấp nhận được vì mockup là spec rõ ràng riêng cho đúng màn hình này.
    - **Nút "Lưu" KHÔNG còn bắt buộc tên + SĐT** (bỏ 2026-09-16, theo yêu cầu — trước đó chỉ ràng buộc lúc TẠO vé mới qua `editingVeId === null`) — giờ luôn bấm được kể cả để trống, cả lúc tạo mới lẫn sửa vé đã có. `tenKhach`/`sdtKhach` để trống thì lưu `null` bình thường (đã có sẵn `|| null` khi build giá trị gửi lên).
    - **Không port theo mockup** (mockup dùng dữ liệu/schema mock, không khớp DB thật đã có từ trước): (1) Điểm lên/xuống trong mockup là text tự do prefill theo tuyến — giữ nguyên dropdown `diem_khach` + nút "+" tự thêm điểm đã có (đúng schema `ve.diem_len_id`/`diem_xuong_id` là FK, không phải text); (2) Giá vé trong mockup là số cố định đọc từ "bảng giá chuyến" — schema thật KHÔNG có bảng giá, giữ nguyên ô nhập tay theo nghìn đồng (quyết định owner từ spec gốc: "crew tự nhập, không tra bảng giá"); (3) Header mockup dùng nút "✕ đóng" đơn lẻ (README tự ghi "chưa nối đích đến") — giữ nguyên header chuẩn `renderSideMenu`/hamburger dùng chung cả 5 trang, vì mockup vốn thiết kế như màn hình độc lập, không có khái niệm menu điều hướng giữa các trang của app thật.
  - **Đặt vé giống `dat-ve.html` (2026-09-21)** — crew đặt vé cho khách NGAY trong `khach.html`,
    trải nghiệm giống hệt trang đặt vé công khai (chọn tỉnh bằng picker, multi-select nhiều giường,
    thanh giá cố định đáy, form thông tin) — TÁI DÙNG code có sẵn từ `dat-ve.html` (`SEAT_SVG`,
    `.route-*`/`.dia-diem-picker*`/`.gia-ve-bar*` CSS COPY nguyên văn, cùng pattern hàm), KHÔNG viết
    lại từ đầu. Khác `dat-ve.html` ở 3 điểm cốt lõi: (a) **crew ghi THẲNG bằng supabase-js** (session
    `authenticated`, RLS theo tenant + trigger `ve_check_tenant`) — KHÔNG qua `api/cong-khai-*`,
    KHÔNG có OTP (OTP chỉ chống đặt ảo của khách vô danh, không áp dụng cho crew đã đăng nhập);
    (b) **đặt NHIỀU giường = MỘT `insert([...])` NGUYÊN TỬ** (khác route công khai đặt TUẦN TỰ từng
    giường) — 1 giường trùng thì CẢ LỆNH fail, không đặt dở nửa vời; (c) **giá mặc định crew SỬA
    ĐƯỢC** (khác booking công khai — server tự tính, không tin client) vì crew là người tin cậy.
    - **Bấm giường TRỐNG = multi-select (`toggleChonGiuongCrew`/`selectedGiuongMap`), KHÔNG còn mở
      modal như trước** — đổi hành vi so với bullet "openVeModal" phía trên (bullet đó giờ CHỈ áp
      dụng cho giường ĐÃ ĐẶT, xem `renderMotTang` — `if (ve) openVeModal(g); else if
      (g.hoat_dong && !chuyenDaXong) toggleChonGiuongCrew(g)`). Giường ĐÃ ĐẶT giữ NGUYÊN 100% hành
      vi cũ (mở modal sửa/huỷ, banner xác nhận inline) — không đổi gì ở nhánh đó.
    - **Dải "Nơi xuất phát/Điểm đến"** (`renderChieuSelectorCrew`, `#chieu-select-wrap` trong
      `#view-so-do`, phía trên `.tang-cols`) — KHÔNG có bước "xác nhận"/"chốt" như `dat-ve.html`
      (tỉnh ở đây chỉ ảnh hưởng giá mặc định + lọc điểm đón/trả, đổi lúc nào cũng được vì chuyến đã
      có sẵn từ dropdown `#chuyen-select`, không gắn với việc chọn NGÀY/TẠO chuyến mới như
      `dat-ve.html`) — chỉ 2 vùng bắt click (nút "⇅", tên tỉnh mở picker `moDiaDiemPickerCrew`),
      khác 3 vùng của `dat-ve.html`. Mặc định lấy ĐẦU/CUỐI tuyến thật từ `tuyen_tinh` theo
      `chuyen.chieu` (`datMacDinhTinhTheoChieu`, KHÔNG hardcode DLK/HDG) — **CHỈ set 1 LẦN**
      (`tinhMacDinhDaDat` guard) — đổi chuyến sau đó KHÔNG reset lại tỉnh crew đã chọn tay.
      `noiXuatPhatTinh`/`diemDenTinh` là THAM CHIẾU trực tiếp phần tử trong `tinhList` (không copy)
      — sửa giá qua modal "Giá vé theo tỉnh" tự phản ánh ngay, chỉ cần gọi lại `capNhatGiaVeBarCrew()`
      để vẽ lại TEXT của thanh giá (giá trị đã đúng qua tham chiếu).
    - **Thanh giá cố định đáy** (`#gia-ve-bar-crew`, dùng CHUNG class CSS `.gia-ve-bar` với
      `dat-ve.html` — không viết CSS riêng) — "Đã chọn N giường · Tổng: X" hoặc "chưa định giá" nếu
      thiếu `gia_moc` 1 trong 2 tỉnh (khác nhãn "liên hệ sau" của booking công khai — đúng ngữ
      cảnh crew nội bộ). Ẩn khi 0 giường chọn HOẶC `chuyenDaXong`. Nút "Tiếp tục" mở
      `#dat-nhieu-modal` (dùng CHUNG class `.ve-modal`/`.ve-modal-card` với modal sửa-1-vé cũ —
      bottom-sheet mobile, hộp giữa màn tablet tự động qua media query đã có).
    - **Form đặt vé** (`#dat-nhieu-modal`) — **ĐOẠN NÀY LỖI THỜI (2026-09-22)**: `renderDiemKhachOptionsTheoTinh`/`openDiemKhachModal`/2 dropdown "Điểm đón/trả" mô tả dưới đây ĐÃ BỊ GỠ BỎ HOÀN TOÀN, xem mục "Bỏ diem_khach, thay bằng chọn Tỉnh + Xã/Huyện" ở trên — điểm đón/trả giờ chọn SẴN ở dải "Nơi xuất phát/Điểm đến" phía trên form này, modal chỉ còn HIỂN THỊ LẠI (không chọn lại). Giữ nguyên văn lịch sử bên dưới: Tên/SĐT (không bắt buộc, 1 bộ áp dụng cho MỌI giường
      đã chọn — muốn khác nhau thì sửa từng vé sau ở chế độ Danh sách), **Giá mỗi giường** (prefill
      `tinhGiaVeCrew()`, crew sửa được), Điểm đón/trả (tùy chọn, LỌC THEO TỈNH đã chọn qua
      `renderDiemKhachOptionsTheoTinh` — hàm MỚI, KHÁC `renderDiemKhachOptions` cũ vốn sắp theo
      tuyến không lọc tỉnh, vẫn giữ nguyên cho modal sửa-1-vé cũ). Nút "+" thêm `diem_khach`
      (`openDiemKhachModal`) đã TỔNG QUÁT HOÁ để nhận thẳng ID select đích (`'ve-diem-len'`/
      `'ve-diem-xuong'`/`'dn-diem-len'`/`'dn-diem-xuong'`, trước đây chỉ `'len'`/`'xuong'` hardcode
      2 select cũ) — dùng CHUNG 1 modal cho cả 2 luồng, prefill sẵn tỉnh liên quan (gợi ý, vẫn sửa
      được).
    - **Đặt vé** = `sb.from('ve').insert([...])` 1 mảng N dòng (N=số giường chọn), mỗi dòng đủ
      `nha_xe_id`/`tinh_len_ma`/`tinh_xuong_ma`/`nguon:'crew'`/`hinh_thuc_thanh_toan:null`. Lỗi
      `23505` (2 crew cùng bấm 1 giường) → KHÔNG đặt gì cả (nguyên tử), `loadVeChoChuyen` tải lại,
      loại khỏi `selectedGiuongMap` đúng giường vừa bị đặt mất (`veMap.has(g.id)`), GIỮ LẠI các
      giường còn trống trong lựa chọn — không mất trắng cả lượt chỉ vì 1 giường trùng.
    - **Chuyến `xong`** — `chuyenDaXong` (derive trong `loadVeChoChuyen`) chặn ĐÚNG 2 việc: ẩn
      thanh giá đáy, không gắn click-handler cho giường trống (bấm không có phản ứng gì). KHÔNG đổi
      gì thêm cho luồng sửa/huỷ vé đã đặt (giữ nguyên hành vi cũ, không mở rộng khoá thêm).
    - **Đổi chuyến ở dropdown** — xoá `selectedGiuongMap` + đóng `#dat-nhieu-modal` (giường thuộc
      chuyến cũ không còn ý nghĩa), GIỮ NGUYÊN cặp tỉnh đã chọn (`tuyen_tinh` không phụ thuộc
      chuyến nào nên luôn còn hợp lệ, không cần validate lại).
    - **Test bắt buộc đã chạy thật** (tenant `test-b` cô lập, user tạm CHỈ thuộc `test-b`, đăng
      nhập thật qua Playwright + `auth-callback.html`) — 2 giường + giá mặc định đúng; sửa giá tay
      lưu đúng số; tỉnh `gia_moc null` → "chưa định giá" + đặt được với `gia=null`; race 2 phiên
      cùng giường → phiên sau 0 dòng tạo, giữ giường còn trống trong lựa chọn; SQL trực tiếp xác
      nhận `ve_tinh_len_fk` chặn tỉnh lạ VÀ `ve_check_tenant` chặn `chuyen_id`/`giuong_id` chéo
      tenant; regression đầy đủ (giường đã đặt vẫn mở modal sửa/huỷ, Danh sách sửa tại dòng, giường
      `hoat_dong=false` không bấm được, badge "🌐 Đặt online" hiện đúng cho vé `nguon='khach_tu_dat'`,
      sửa bảng giá cập nhật thanh đáy ngay, chuyến `xong` không đặt được); regression đặt vé công
      khai qua `api/cong-khai-dat-ve.js` (đã sửa ở Phần 1) — `tinh_len_ma`/`tinh_xuong_ma`/
      `nguon='khach_tu_dat'` đúng, 404/400 các ca ownership/nx cũ vẫn đúng. Đã dọn sạch data test
      sau khi xong — `select slug from nha_xe` chỉ còn `eakar`.
  - **`ve`**: 1 dòng/vé, `giuong_id` + `chuyen_id` + thông tin khách + `diem_len_id`/`diem_xuong_id` (FK `diem_khach`, **DEPRECATED 2026-09-22 — KHÔNG còn ghi từ app, xem mục "Bỏ diem_khach"**, cột giữ nullable cho dữ liệu cũ) + `dia_diem_len_nhan`/`dia_diem_xuong_nhan` (text, nullable — nhãn tự do thay thế, migration `ve_dia_diem_len_xuong_nhan`) + `dia_diem_len_loai`/`dia_diem_xuong_loai` (text, check `in ('xa','huyen')`) + `gia` (nhập theo nghìn đồng, cùng quy ước `tien_thu`/`tien_thu_ho` bên hàng hoá — có `soTienBangChu` hiện chữ đọc số). **Partial unique index `uq_ve_giuong_active` trên `(chuyen_id, giuong_id) WHERE trang_thai = 'da_dat'`** — chặn 2 vé active cùng giường/chuyến nhưng vẫn cho đặt lại giường sau khi vé cũ `huy` (bản đầu của spec viết nhầm thành `UNIQUE` constraint không điều kiện trong `CREATE TABLE` rồi `DROP INDEX` cùng tên — lỗi SQL thật (Postgres không cho drop index đang backing 1 constraint bằng `DROP INDEX` trực tiếp) VÀ sai logic (khoá luôn giường sau 1 lần huỷ vé) — đã sửa trước khi chạy migration, chỉ dùng đúng 1 `CREATE UNIQUE INDEX ... WHERE ...` sau khi tạo bảng thường). Client bắt lỗi `23505` (unique violation) khi 2 crew cùng bấm 1 giường gần như đồng thời → toast báo tải lại, không crash.
    - **`tinh_len_ma`/`tinh_xuong_ma` (thêm 2026-09-21, migration `ve_tinh_len_xuong_ma`) — trả nợ
      "vé không biết khách xuống đâu" khi tỉnh chưa có `diem_khach`.** Trước đó `dat-ve.html` cho
      khách chọn TỈNH (không bắt chọn điểm cụ thể, xem mục "Đặt vé công khai") nhưng `ve` chỉ lưu
      `diem_len_id`/`diem_xuong_id` — tỉnh nào chưa có `diem_khach` (đa số 17 tỉnh, chỉ Đắk Lắk/Hải
      Dương có điểm thật) thì 2 cột đó ra `null`, không ai biết khách lên/xuống ở đâu. Backfill từ
      `diem_khach.tinh_ma` cho vé cũ có điểm cụ thể (verify 0 dòng lệch sau backfill trước khi thêm
      FK). **`ve_tinh_len_fk`/`ve_tinh_xuong_fk` — composite FK `(nha_xe_id, tinh_len_ma/tinh_xuong_ma)
      references tuyen_tinh(nha_xe_id, tinh_ma)`** (tận dụng `UNIQUE(nha_xe_id, tinh_ma)` có sẵn
      trên `tuyen_tinh`) — khoá tenant ngay ở tầng DB: 1 mã tỉnh chỉ hợp lệ nếu thuộc ĐÚNG
      `tuyen_tinh` của nhà xe đang ghi `ve` đó, `MATCH SIMPLE` mặc định nên `null` vẫn hợp lệ
      (không bắt buộc phải có tỉnh). `api/cong-khai-dat-ve.js` ghi 2 cột này bằng đúng
      `tinh_len_ma`/`tinh_xuong_ma` ĐÃ validate sẵn ở bước tính giá (không validate lại 2 lần).
      `khach.html`'s form đặt-nhiều-vé (xem bullet riêng bên dưới) cũng ghi 2 cột này từ
      `noiXuatPhatTinh`/`diemDenTinh` đang chọn.
  - **`diem_khach` — DEPRECATED (2026-09-22)**, bullet gốc bên dưới giữ lại chỉ để biết lịch sử —
    xem mục "Bỏ diem_khach, thay bằng chọn Tỉnh + Xã/Huyện" ở trên để biết trạng thái hiện tại
    (bảng vẫn còn trong DB, KHÔNG còn đường tạo mới/chọn mới từ app, cả nút "+" nhắc tới ngay dưới
    đây LẪN 2 dropdown điểm lên/xuống đều đã bị gỡ bỏ hoàn toàn). Nguyên văn lịch sử:
    điểm đón/trả khách, TÁCH RIÊNG khỏi bảng `diem` của hàng hoá (quyết định owner) vì `diem` có cơ chế chống trùng + đếm `so_lan_giao` gắn riêng logic giao hàng, không phù hợp trộn với điểm đón khách (bến xe/điểm cố định, số lượng ít). **Không seed sẵn** — bảng khởi đầu trống. Spec gốc không có đường tạo điểm mới trong `khach.html` (giả định seed tay hoặc qua Supabase dashboard) — PHÁT HIỆN lúc implement: với bảng trống, form đặt vé sẽ không có gì để chọn ở 2 dropdown điểm lên/xuống, tính năng coi như không dùng được ngay từ đầu → đã TỰ THÊM nút "+" cạnh mỗi dropdown mở modal nhỏ (tên + chọn tỉnh) để crew tự thêm điểm dần ngay trong lúc đặt vé, không cần rời app. Đây là bổ sung ngoài spec ban đầu, không phải yêu cầu owner — cân nhắc lại UX này nếu owner muốn khác.
  - **Không có trạng thái "đã lên/đã xuống xe"** (khác `kien.trang_thai`/`da_giao`) — v1 chỉ cần biết "đã đặt hay chưa" (`trang_thai 'da_dat'|'huy'`), cố ý đơn giản theo spec, có thể mở rộng sau nếu cần theo dõi lúc lên/xuống xe thực tế.
  - **Không có offline-queue cho `ve`** (khác `idb-queue.js` của `kien`) — vé cần mạng để lưu ngay, tránh 2 khách trùng giường khi offline khó merge (cố ý theo spec, khác triết lý offline-first của `hang.html`).
  - **RLS bật + policy allow-all cho `authenticated`** trên cả 3 bảng (`giuong` chỉ có policy `SELECT`, không cần ghi từ client) — xem ghi chú RLS chung ở mục Database bên dưới (đã sửa lại nhận định "RLS disabled" cũ, thực ra RLS đã bật từ trước với policy allow-all).
  - Banner "💺 N/44 khách — Tổng doanh thu vé" (`renderDoanhThuVe`) tính từ `ve.gia` các vé `da_dat` của chuyến đang chọn, LUÔN hiện (cùng nguyên tắc "live" đã áp dụng cho `renderDoanhThuSummary` bên hàng hoá).
  - **Chế độ "Danh sách" (2026-09-16)** — toggle 2 nút `#tab-view-so-do`/`#tab-view-danh-sach` (biến `currentView`, mặc định `'so_do'`) ẩn/hiện `#view-so-do`/`#view-danh-sach`, KHÔNG fetch lại gì khi chuyển view — cả 2 khối đọc CHUNG `veMap`/`giuongMap`/`diemKhachList` đã tải cho chuyến đang chọn (`giuongMap`: `Map<giuong.id, giuong>`, dựng 1 lần trong `loadGiuongList`, dùng để tra cứu O(1) thay vì `.find()` lặp qua `giuongList`). `renderDanhSachVe()` được gọi ngay trong `loadVeChoChuyen` (cùng chỗ gọi `renderGiuongGrid()`) — nên đổi chuyến/đặt-sửa-huỷ vé từ Sơ đồ (modal cũ) đều tự cập nhật Danh sách kể cả khi đang KHÔNG đứng ở view đó, không cần chờ người dùng bấm qua mới thấy đúng dữ liệu.
    - Danh sách chỉ hiện vé `trang_thai = 'da_dat'`, sắp theo **vị trí vật lý trên xe** (`tầng, hàng, vi_tri` — dùng `giuongMap`), KHÔNG theo thời gian đặt, để khớp thứ tự đi dọc xe lúc điểm danh. Trống → hiện dòng thông báo (`#ve-list-empty`), không phải bảng rỗng.
    - Sửa/huỷ NGAY TẠI DÒNG (`renderVeRowView` ⇄ `renderVeRowEdit`, cùng pattern đổi tại chỗ trong 1 phần tử như `renderKienRowView`/`renderKienRowEdit` bên `manifest-hang.html`), KHÔNG mở lại modal `#ve-modal` — modal đó CHỈ còn dùng cho đặt vé mới từ Sơ đồ (bấm giường trống), giữ nguyên 100%. Form sửa dùng lại `renderDiemKhachOptions`/công thức đọc số tiền y hệt modal, nhưng KHÔNG có nút "+" thêm điểm (chỉ cần khi đặt vé mới). "Lưu" ở Danh sách `UPDATE` xong tự `Object.assign` + `veMap.set` + `renderGiuongGrid()` tại chỗ — không gọi lại `loadVeChoChuyen` (tránh fetch thừa).
    - "Huỷ vé" ở Danh sách dùng **`confirmDialog()`** (không phải banner-trong-modal như nhánh huỷ ở Sơ đồ) — đây KHÔNG phải 2 lớp modal chồng nhau (danh sách là 1 khối UI thường), nên giữ đúng convention chung của app thay vì lặp lại ngoại lệ của modal đặt vé.
  - **`giuong.hoat_dong` (2026-09-16)** — cột mới `boolean not null default true`, đánh dấu 1 giường TẠM NGƯNG phục vụ (vd hỏng, đang sửa) trên TOÀN BỘ chuyến cho tới khi mở lại tay (không có UI bật/tắt trong app — sửa trực tiếp qua Supabase dashboard/SQL, giống cách các đợt di dời `vi_tri`/`ma` trước đó). Khác hẳn "đã đặt" (`ve.trang_thai`, theo TỪNG chuyến) — `hoat_dong` là thuộc tính VẬT LÝ của giường, cố định qua mọi chuyến, không phụ thuộc `chuyen_id`. Đã tắt `T1-17`/`T2-17` (cặp giường hàng 6, cạnh lối cầu thang) theo yêu cầu owner (2026-09-16). `loadGiuongList` select thêm cột này; `renderMotTang` render giường `hoat_dong=false` bằng class `.giuong-icon.offline` (nền sọc chéo xám, `cursor:not-allowed`), loại hẳn khỏi mẫu số "X giường trống · Y đã đặt" theo tầng (không tính là trống lẫn đã đặt) và khỏi mẫu số "N/44 khách" ở `renderDoanhThuVe` (đổi hẳn từ số cứng `44` sang đếm động `giuongList.filter(g => g.hoat_dong).length` — hiện còn 42). `openVeModal` chặn mở form nếu `!giuong.hoat_dong` (toast báo "Ngưng phục vụ"), có thêm mục chú giải thứ 4 trong `.chu-thich-giuong`. Giường đã có vé từ TRƯỚC lúc tắt (không xảy ra với 2 giường này, cả 2 đều trống) sẽ vẫn hiện đúng theo `ve.trang_thai` như bình thường — `hoat_dong=false` chỉ chặn ĐẶT MỚI qua `openVeModal`, không tự huỷ vé cũ.
  - **Badge "🌐 Đặt online" (2026-09-16)** — hiện ở cả Sơ đồ (`.badge-online` — chấm nhỏ góc trên-phải icon giường, `renderMotTang`) lẫn Danh sách (`renderVeRowView`, kèm dòng phụ ghi rõ hình thức thanh toán nếu `chuyen_khoan_truoc`) cho vé có `ve.nguon = 'khach_tu_dat'` — xem mục "Đặt vé công khai" bên dưới. Modal chi tiết (`openVeModal`) cũng thêm 🌐 vào title. Đây CHỈ là nhãn hiển thị, không đổi hành vi sửa/huỷ — crew sửa/huỷ vé online y hệt vé crew tự tạo, chỉ cần TỰ Ý THỨC đối chiếu thanh toán (hệ thống không tự xác nhận chuyển khoản).
- **`diem-den.html` (trang tổng hợp điểm giao hàng + điểm đón/trả khách) ĐÃ BỊ GỠ BỎ HOÀN TOÀN (2026-09-16, cùng ngày tạo)** — owner phản hồi tính năng dư thừa vì điểm trả khách đã được chèn thẳng vào `manifest-hang.html` (xem bullet "Điểm trả khách chen vào cuối mỗi nhóm tỉnh" ở đó) nên không cần 1 trang riêng chỉ để xem lại. Đã xoá file, gỡ khỏi menu `renderSideMenu` (`shared.js`) và khỏi `sw.js` `STATIC_ASSETS`. `khach.html` VẪN GIỮ NGUYÊN việc đọc `?view=danh_sach` ở `initPage()` — param này giờ chỉ còn được dùng bởi link "Xem trong Danh sách →" trong `manifest-hang.html`, không phải dead code.
- `lich-su-chuyen.html` — liệt kê 50 chuyến gần nhất (`order by khoi_hanh desc`, cả `dang_chay` lẫn `xong` — KHÔNG chỉ chuyến xong dù tên trang là "lịch sử"), chia 2 nhóm "Chuyến đang chạy" / "Chuyến đã hoàn thành". Card của CẢ 2 nhóm đều điều hướng `manifest-hang.html?chuyen_id=<id>` để xem/giao tiếp — trang này không có khái niệm "nhập kiện mới" (khác `hang.html` bước 0, giờ CHỈ hiện chuyến `dang_chay`, xem trên) nên không cần phân biệt hành vi click theo nhóm. Mỗi card show `X kiện · Đã thu: Yđ` (tổng `tien_thu` các kiện của chuyến, tính ở client — 1 query `kien` duy nhất với `.in('chuyen_id', ...)` cho cả 50 chuyến rồi filter/group theo `chuyen_id`, không dùng RPC/view riêng vì data nhỏ, có `.not('trang_thai', 'in', '(huy,tra_lai)')` để không cộng nhầm kiện đã hủy/trả lại vào tổng) và cảnh báo "⚠ Còn N kiện chưa thu đủ COD" nếu có.

### Đặt vé công khai cho khách — `dat-ve.html` + `api/cong-khai-*.js` (2026-09-16, TEST tính năng)

**Bản TEST, không phải production hoàn chỉnh** — không tích hợp cổng thanh toán thật, không có hệ
thống lịch trình cố định, không có OTP xác thực SĐT (chấp nhận rủi ro đặt ảo/spam), không có trang
"vé của tôi"/tra cứu vé cho khách. Khách CHỈ đặt được vào chuyến crew đã tự tạo sẵn
(`trang_thai = 'dang_chay'`) — không tạo chuyến mới từ phía khách.

- **KHÔNG mở RLS `anon` cho bảng `ve`** — app nội bộ hiện chỉ có RLS cho role `authenticated`; mở
  thêm policy `anon` sẽ lộ toàn bộ bảng `ve` (tên/SĐT khách khác) cho bất kỳ ai đọc được
  `SUPABASE_ANON_KEY` trong source (public key, không phải bí mật thật). Thay vào đó, `dat-ve.html`
  KHÔNG dùng Supabase client trực tiếp — mọi thao tác qua 4 API route riêng (`api/cong-khai-*.js`,
  Vercel serverless), server dùng `SUPABASE_SERVICE_KEY` (bypass RLS hoàn toàn) và TỰ LỌC field nào
  lộ ra ngoài response — cùng pattern đã có sẵn với Zalo login (`api/zalo-callback.js`, service key
  chỉ ở server, không đụng RLS).
- **`ve.nguon`** (`text default 'crew'`, check `in ('crew','khach_tu_dat')`) — đánh dấu nguồn gốc
  vé, KHÔNG đổi ý nghĩa `ve.trang_thai` hiện có. **`ve.hinh_thuc_thanh_toan`** (`text`, check
  `in ('tien_mat_len_xe','chuyen_khoan_truoc')`) — `null` cho vé crew tạo tay (giữ nguyên hành vi
  cũ), chỉ có giá trị khi khách tự đặt qua `dat-ve.html`.
- **`api/cong-khai-chuyen.js` ĐÃ BỊ XOÁ (2026-09-17, đợt 2)** — thay hoàn toàn bởi
  `api/cong-khai-lich-chay.js` (xem mục "Lịch chạy cố định theo ngày chẵn âm lịch" bên dưới), vốn
  không còn phụ thuộc chuyến crew tự tạo tay mà tự tính lịch. Route cũ chỉ tồn tại đúng 1 ngày
  (tạo + xoá cùng 2026-09-17).
- **Cả 4 route + `api/manifest-dat-ve.js` đều BẮT BUỘC `?nx=<slug>` (Multi-tenant Giai đoạn 5,
  2026-09-20)** — xem mục "Multi-tenant Giai đoạn 5" để biết chi tiết `layNhaXe`/
  `xacMinhThuocNhaXe`/nguyên tắc "không default ngầm". Các bullet dưới đây mô tả HÀNH VI NGHIỆP VỤ
  của từng route (giữ nguyên từ lúc viết), phần tenant-scoping không lặp lại ở đây.
- **`api/cong-khai-so-do.js?nx=<slug>&chuyen_id=...`** (GET) — JOIN `giuong` + `ve` (lọc
  `trang_thai='da_dat'` đúng `chuyen_id`) → trả `{id, tang, hang, vi_tri, ma, hoat_dong, trong}`
  mỗi giường. TUYỆT ĐỐI không trả tên/SĐT khách đã đặt ghế khác — công khai chỉ cần biết trống hay
  không. **`chuyen_id` giờ OPTIONAL (2026-09-17, đợt 2)** — ngày/chiều chưa từng có ai đặt thì CHƯA
  CÓ `chuyen` thật trong DB nên không có id để truyền; gọi không kèm `chuyen_id` thì bỏ qua bước
  query `ve`, trả toàn bộ giường `trong` theo đúng `hoat_dong` (chưa tồn tại chuyến thì chắc chắn
  chưa ai đặt được). Có `chuyen_id` thì verify sở hữu TRƯỚC khi query `ve` (Giai đoạn 5).
- **`api/cong-khai-diem-khach.js?nx=<slug>`** (GET) — trả `diem_khach` + `tuyen_tinh` join `tinh`
  (để dropdown hiện "Tên điểm — Tên tỉnh" và sắp theo thứ tự tuyến, giống `renderDiemKhachOptions`
  ở `khach.html`) — KHÔNG phải `tinh_tuyen` (bảng cũ, đơn-tenant, ngừng cập nhật từ Giai đoạn 4).
  KHÔNG có đường tạo điểm mới từ phía khách — chỉ crew được tạo điểm mới, qua `khach.html` như cũ.
- **`api/cong-khai-dat-ve.js`** (POST, body `{nx, chuyen_id?, ngay?, chieu?, giuong_id, ten, sdt,
  diem_len_id?, diem_xuong_id?, hinh_thuc_thanh_toan, tinh_len_ma?, tinh_xuong_ma?}` — KHÔNG nhận
  `gia` từ client, xem mục "Bảng giá theo tỉnh") —
  - Validate tối thiểu: `ten`/`sdt` không rỗng, `sdt` đúng định dạng VN qua `chuanHoaSdt`/
    `laSdtHopLe` **COPY nguyên văn từ `api/doi-chieu-sdt.js`** (cố ý KHÔNG import chéo giữa 2 route
    serverless độc lập).
  - **Nhận `chuyen_id` HOẶC `{ngay, chieu}` (2026-09-17, đợt 2 — lịch chạy cố định)** — có
    `chuyen_id` (chuyến đã tồn tại, `dat_truoc` hoặc `dang_chay`) thì dùng thẳng; không có thì tra
    theo `(ngay, chieu)` qua `ranhGioiNgayVN()` (quy đổi đúng "ngày dương lịch giờ VN" sang mốc UTC,
    KHÔNG so sánh chuỗi ngày thô với `timestamptz` — lệch múi giờ nếu làm vậy), **TỰ TẠO** `chuyen`
    mới (`trang_thai='dat_truoc'`, `khoi_hanh` = ngày + giờ mặc định từ
    `nha_xe.gio_khoi_hanh_bac`/`gio_khoi_hanh_nam` của nhà xe đã resolve — KHÔNG còn ENV, xem mục
    "Env / Vercel", `tao_boi=null`) nếu ngày đó CHƯA có ai đặt. Đụng unique index
    `uq_chuyen_ngay_chieu` lúc insert (2 khách cùng bấm ngày/chiều mới gần như đồng thời) → bắt lỗi
    `23505`, SELECT lại lấy bản ghi vừa được request kia tạo, KHÔNG báo lỗi cho khách.
  - Chấp nhận đặt vào chuyến `trang_thai` là `'dat_truoc'` HOẶC `'dang_chay'` (mở rộng 2026-09-17,
    trước đó chỉ `'dang_chay'`) — chặn `'xong'` (crew đã "Kết thúc chuyến", hoặc khách giữ tab cũ mở
    lâu).
  - **KHÔNG tự check "còn trống" ở code trước khi insert** — để DB tự chặn trùng giường qua unique
    index `uq_ve_giuong_active` sẵn có (tránh race condition 2 khách bấm cùng giường gần như đồng
    thời), bắt lỗi `23505` → HTTP 409 + "Giường này vừa có người đặt, chọn giường khác", frontend
    tự gọi lại `taiSoDo()` để khách chọn giường khác ngay, không cần tải lại cả trang.
  - `gia`: optional, KHÔNG có trong form `dat-ve.html` (khách không tự định giá) — luôn `null` khi
    đặt qua trang này, giữ đúng nguyên tắc "crew tự định giá" của module gốc; crew xem lại/điền giá
    thật lúc xử lý vé qua Danh sách ở `khach.html`.
  - INSERT với `trang_thai='da_dat'`, `nguon='khach_tu_dat'`, **kèm `tinh_len_ma`/`tinh_xuong_ma`
    (thêm 2026-09-21, xem mục "Đặt vé giống dat-ve.html" ở `khach.html` và cột `ve` trong mục
    Database)** — ghi thẳng 2 giá trị ĐÃ VALIDATE sẵn ở bước tính giá phía trên (không validate lại
    lần 2). **Response trả kèm `chuyen_id` đã
    dùng** (kể cả khi vừa tự tạo) — `dat-ve.html` cần giá trị này để các lượt đặt/tải-lại-sơ-đồ
    TIẾP THEO trong cùng phiên dùng đúng chuyến vừa tạo, không tạo/tra lại mỗi lần.
- **`dat-ve.html`** — trang PUBLIC, KHÔNG có `requireSession`/`renderSideMenu`/hamburger (khác hẳn
  5 trang crew nội bộ), KHÔNG nối vào `sw.js`/`manifest.json`/menu `renderSideMenu` của crew (xem
  PWA riêng ở bullet ngay dưới). Phần CSS/HTML sơ đồ 2 cột song song + `SEAT_SVG` **COPY từ
  `khach.html`** (không viết lại từ đầu). Có nạp `shared.js` nhưng CHỈ dùng `formatMoney`/
  `formatDate` — KHÔNG gọi `createSb()`/`requireSession()` (mọi dữ liệu qua `fetch()` tới 4 API
  route trên). Đặt thành công → màn xác nhận đơn giản tại chỗ (không có trang vé điện tử/QR, ngoài
  phạm vi test) — khách KHÔNG lưu lại được, cần tra cứu lại phải gọi crew.
  - **PWA riêng cho trang này (2026-09-18, theo yêu cầu)** — trước đó `dat-ve.html` CỐ Ý chưa phải
    PWA thật (không manifest, không đăng ký service worker), chỉ là trang tĩnh mở qua link. Đăng ký
    thêm 2 file RIÊNG, KHÔNG dùng chung với 5 trang crew:
    - **`manifest-dat-ve.json`** (file TĨNH — **THAY THẾ bởi `api/manifest-dat-ve.js?nx=<slug>`
      ĐỘNG từ Giai đoạn 5, 2026-09-20, xem mục "Multi-tenant Giai đoạn 5"**; giữ lại trong repo
      chưa xoá cho tới khi test tay trên điện thoại thật xong) — `scope: "./dat-ve.html"` (thu hẹp
      về ĐÚNG 1 URL này, KHÔNG phải `"./"` như `manifest.json` của crew), `name`/`short_name`
      **"Booking"** (đổi 2026-09-18, đợt 15, theo yêu cầu — trước đó "EaKar Xe Khách - Đặt vé").
      Icon dùng `icons/icon-192-booking.png`/`icon-512-booking.png` — hình vé cam (`#f57c00`,
      generate bằng script Python/PIL, KHÔNG dùng chung file với icon xe tải xanh của crew).
    - **Bug thật gặp lúc cài (2026-09-18, đợt 15, cùng ngày với lúc thêm manifest ở trên)** — bấm
      "Thêm vào màn hình chính" ở `dat-ve.html`, Chrome hiện *"This app is already installed"* thay
      vì cho cài mới, kèm icon của app crew (ảnh chụp thật). Nguyên nhân: (1) `scope: "./"` của
      `manifest.json` (crew) VỀ MẶT KỸ THUẬT đã bao trùm luôn URL `/dat-ve.html` (scope là prefix
      URL, không phải danh sách trang cụ thể); (2) 2 manifest ban đầu DÙNG CHUNG file icon
      (`icons/icon-192.png`/`icon-512.png`) nên nhìn ngoài giống hệt 1 app. Sửa bằng 3 lớp: thêm
      trường **`"id": "/dat-ve.html"`** tường minh vào `manifest-dat-ve.json` (Chrome/Android dùng
      `id` — mặc định suy từ `start_url` nếu thiếu — để phân biệt app, khai rõ tránh phụ thuộc suy
      diễn ngầm); đổi `name` thành "Booking" (khác hẳn "EaKar Hàng" của crew); và đổi hẳn sang bộ
      icon riêng (`icon-*-booking.png`) như trên. `theme_color`/`background_color` CỐ Ý giữ nguyên
      `#1565c0`/`#f0f2f5` khớp header trong trang (chỉ đổi icon/tên/id ở tầng OS-install, không đổi
      màu sắc hiển thị trong app).
    - **`sw-dat-ve.js`** — network-first + cache riêng `eakar-dat-ve-v3` (bump `v1`→`v2` lúc đổi
      icon, `v2`→`v3` ở Giai đoạn 5 vì `dat-ve.html` đổi cách đọc `nx`/gọi API — mỗi lần bump dọn
      sạch cache cũ trong trình duyệt, KHÔNG chung `CACHE_NAME` với `eakar-hang-v2` của crew), đăng
      ký với `{ scope: '/dat-ve.html' }` tường minh (KHÔNG để mặc
      định — mặc định sẽ là `/`, đụng scope `sw.js` nếu cùng trình duyệt từng cài cả 2 app). **KHÁC
      `sw.js` ở đúng 1 điểm quan trọng**: offline navigate thất bại → fallback về CHÍNH
      `./dat-ve.html` (không phải `./login.html` như crew) — khách công khai không có tài khoản,
      đưa họ tới màn đăng nhập crew lúc mất mạng là sai hoàn toàn ngữ cảnh. Thêm 2 meta
      `apple-mobile-web-app-capable`/`apple-mobile-web-app-status-bar-style` vào `<head>` (đã có sẵn
      `theme-color` từ trước, `apple-touch-icon` đổi sang icon riêng cùng lúc) — đủ bộ thẻ PWA/iOS
      theo checklist chung của app (xem mục "Tối ưu mobile / PWA").
    - **Chưa test thật trên thiết bị sau fix đợt 15** — mới verify qua `curl` (2 file icon mới trả
      200, `manifest-dat-ve.json` trả đúng `id`/tên/icon mới) — cần crew/owner tự bấm "Thêm vào màn
      hình chính" lại trên điện thoại thật để xác nhận Chrome không còn báo "already installed" và
      app cài mới hiện đúng tên "Booking" + icon vé cam, tách biệt hẳn khỏi app crew trên home
      screen.
    - **Tách hẳn sang ORIGIN RIÊNG `eakar-booking.vercel.app` (2026-09-20)** — đợt 15 (trên) chỉ vá
      được xung đột `scope`/`id`/icon TRONG CÙNG 1 origin (`van-tai-hanh-khach.vercel.app`); scope
      `"./"` của `manifest.json` (crew) VỀ MẶT KỸ THUẬT vẫn bao trùm `/dat-ve.html` (scope chỉ là
      prefix URL, không phải danh sách trang) — vá đủ để 2 app KHÔNG bị Chrome coi là "already
      installed" nữa, nhưng 2 service worker (`sw.js` crew scope `/`, `sw-dat-ve.js` booking scope
      `/dat-ve.html`) vẫn CÙNG origin, về lý thuyết vẫn có thể tranh nhau nếu sau này crew đổi scope
      `sw.js`. Owner yêu cầu tách hẳn origin cho dứt điểm — booking giờ sống ở domain RIÊNG
      `eakar-booking.vercel.app`, thêm vào **CÙNG project Vercel** `van-tai-hanh-khach` (KHÔNG phải
      project riêng — qua `vercel domains add eakar-booking.vercel.app van-tai-hanh-khach`, tự động
      alias theo mỗi lần `vercel --prod`), nên vẫn CÙNG 1 deployment/CÙNG 1 codebase, chỉ khác domain
      request tới.
      - **`middleware.js` (root) — Vercel Routing Middleware, KHÔNG phải `rewrites`/`redirects`
        trong `vercel.json`** — đã THỬ `rewrites` trước (catch-all `/(.*)` kèm `has: host` → 404 cho
        mọi path không nằm trong allow-list) nhưng KHÔNG chặn được các trang crew (`hang.html`,
        `login.html`...) trên host booking: verify thật bằng `curl` cho thấy vẫn 200, vì `rewrites`
        trong `vercel.json` chỉ được xét SAU KHI Vercel đã tìm thấy path khớp đúng 1 file tĩnh có
        sẵn trong deployment — file đó được serve THẲNG, bỏ qua `rewrites` hoàn toàn bất kể thứ tự
        khai báo. Middleware chạy TRƯỚC bước filesystem đó nên chặn đúng ý — trên host
        `eakar-booking.vercel.app`: `/` (rewrite, không phải redirect — giữ `/` trên thanh địa chỉ,
        khớp `start_url: "/?nx=..."` của manifest) → `/dat-ve.html`; allow-list đúng những gì
        `dat-ve.html`/`sw-dat-ve.js` cần (`dat-ve.html`, `sw-dat-ve.js`, `manifest-dat-ve.json` tĩnh
        cũ, `style.css`, `shared.js`, 2 icon booking, `api/manifest-dat-ve`, 6 route
        `api/cong-khai-*`) → cho qua bình thường (`next()` từ `@vercel/functions`, package mới thêm
        vào `package.json`); mọi path khác → `404`. Đã verify thật: `hang.html`/`login.html`/
        `khach.html`/`manifest-hang.html`/`lich-su-chuyen.html`/`auth-callback.html`/
        `api/zalo-login`/`api/zalo-callback`/`api/doi-chieu-sdt` trên host booking đều trả 404; các
        path trong allow-list vẫn 200.
      - **`redirects` trong `vercel.json` (khác `rewrites`) VẪN GIỮ, hoạt động đúng** —
        `redirects` được xét TRƯỚC filesystem (không bị vấn đề như `rewrites` ở trên, đã verify) nên
        không cần chuyển vào middleware: trên host `van-tai-hanh-khach.vercel.app`, `/dat-ve.html`
        và `/api/manifest-dat-ve` → 308 sang `https://eakar-booking.vercel.app` + cùng path, GIỮ
        NGUYÊN query string (`?nx=...`) — link cũ dạng `?nx=eakar` vẫn sống, chỉ đổi domain.
      - **`api/manifest-dat-ve.js`**: `scope`/`start_url`/`id` đổi từ `/dat-ve.html` sang `/` —
        origin booking giờ CHỈ chứa đúng nội dung đặt vé (mọi path khác đã 404 ở middleware) nên
        scope `/` an toàn, không còn gì để tranh chấp.
      - **`dat-ve.html`**: đăng ký `sw-dat-ve.js` với `scope: '/'` (trước `'/dat-ve.html'`).
        **`sw-dat-ve.js`**: `CACHE_NAME` bump `v3` → `v4` (dọn cache/registration cũ ứng với scope
        hẹp trước đó).
      - **KHÔNG đụng `manifest.json`/`sw.js` của crew** — giữ nguyên 100%, xem lại chỉ để xác nhận
        vẫn hoạt động bình thường sau khi thêm `vercel.json`/`middleware.js` (đã verify: crew host
        `login.html`/`hang.html`/`manifest.json`/`sw.js` vẫn 200).
      - **Đánh đổi đã xác nhận với owner**: đổi domain booking sau này (khác `eakar-booking.vercel.app`)
        sẽ BẮT khách cài lại app (icon/app cũ trên home screen trỏ về origin cũ sẽ chết hẳn, giống
        đánh đổi "chưa test thật trên thiết bị" đã ghi ở đợt 15) — chấp nhận được vì đang ở giai
        đoạn TEST tính năng, chưa phát hành rộng.
      - **Đã verify bằng `curl` thật (không chỉ đọc code)**: `eakar-booking.vercel.app/?nx=eakar` →
        200, đúng `dat-ve.html`; `/api/manifest-dat-ve?nx=eakar` → JSON `scope:"/"`,
        `id`/`start_url` đều `/?nx=eakar`; `/api/cong-khai-lich-chay?nx=eakar` → 200; toàn bộ trang/
        route crew trên host này → 404; `van-tai-hanh-khach.vercel.app/dat-ve.html?nx=eakar` và
        `/api/manifest-dat-ve?nx=eakar` → 308 đúng `Location` sang host booking, giữ `?nx=eakar`;
        `van-tai-hanh-khach.vercel.app/login.html`/`/hang.html` vẫn 200.
      - **Chưa test thật trên thiết bị** (cùng ghi chú như đợt 15) — cần crew/owner tự bấm "Thêm vào
        màn hình chính" từ `https://eakar-booking.vercel.app/?nx=eakar` trên điện thoại thật.
  - **⚠️ TOÀN BỘ khối "Luồng 4 bước" + các bullet con bên dưới (đến hết "Đặt TUẦN TỰ từng giường")
    MÔ TẢ BẢN TRƯỚC 2026-09-23 — ĐÃ LỖI THỜI Ở PHẦN BƯỚC 0 (lịch/tuyến/khứ hồi)**, thay bởi mục
    "Lịch chọn ngày đặt vé — popup toàn màn hình + khứ hồi (2026-09-23)" ngay sau mục "Lịch chạy cố
    định" bên dưới. Giữ nguyên văn ở đây vì: (1) lịch sử các quyết định UX (đợt 4→16) vẫn đúng bối
    cảnh, phần lớn hành vi (chọn tỉnh tự do 17 tỉnh, không mặc định ĐL/HD, picker Tỉnh→Xã/Huyện...)
    KHÔNG đổi; (2) Bước 1-3 (sơ đồ giường/form liên hệ/OTP/đặt tuần tự nhiều giường) **KHÔNG đổi gì
    ở đợt 2026-09-23**, vẫn đúng y nguyên. CHỈ riêng cơ chế hiển thị lịch (1 khối tháng + `‹`/`›`)
    và việc "chọn ngày xong = xác nhận luôn" bị thay hẳn — đọc mục mới trước khi sửa bất kỳ gì liên
    quan lịch/ngày/khứ hồi.
  - **Luồng 4 bước theo THỨ TỰ (2026-09-17, thêm Bước 0 "Chọn ngày đi" — trước đó chỉ có 3 bước,
    tự động dùng chuyến `dang_chay` gần nhất, không cho khách chọn gì)**. Bước 0 sau đó đổi tiếp 2
    lần cùng đợt: lần 1 (2026-09-17) từ "1 chuyến cố định" sang "chọn giữa các chuyến crew tự tạo
    tay"; lần 2 (2026-09-19, xem mục "Lịch chạy cố định" bên dưới) đổi UI từ **danh sách phẳng**
    sang **LỊCH DẠNG LƯỚI** (giống Vexere) — bản mô tả dưới đây LÀ BẢN CŨ (xem cảnh báo ngay trên):
    (0) `renderChonChuyenStep` dựng khung `#lich-thang-wrap` (1 khối tháng) + `#lich-chieu-wrap`
    (ẩn ban đầu), gọi `renderLichThang()` vẽ tháng đang xem (`baseMonthOffset`, xem bullet lịch bên
    dưới) từ `lichMap` (dựng 1 lần trong `initPage` từ TOÀN BỘ mảng `api/cong-khai-lich-chay.js`
    trả về, kể cả ngày không hợp lệ). Bấm 1 Ô NGÀY hợp lệ (`chonNgay`) → tô cam (`ngayDangChonTam`),
    hiện khối "Nơi xuất phát / Điểm đến" kiểu Vexere (`renderChieuSelector`, xem bullet riêng bên
    dưới) trong `#lich-chieu-wrap` NGAY BÊN DƯỚI lịch (lịch vẫn hiện nguyên, CHƯA coi là chọn xong)
    — bấm "Tiếp tục" mới thật sự chọn xong (`chonChuyen`, nhận
    `{ngay, lunarDay, lunarMonth, chieu, chuyen_id (có thể null), ten}`), lúc đó mới sang bước
    điểm; (1) `#diem-chon-wrap` — chọn Điểm lên/Điểm xuống (`#diem-len-select`/`#diem-xuong-select`),
    CHỈ hiện sau khi đã chọn xong ở Bước 0; (2) `#so-do-wrap` (sơ đồ giường) — CHỈ hiện khi CẢ 2
    điểm đã chọn (`capNhatHienThiSoDo`, gọi từ listener `change` của cả 2 select) — trống thì hiện
    `#cho-chon-diem-hint` thay chỗ; (3) `#dat-ve-form` — CHỈ còn Tên*/SĐT*/Phương thức thanh toán (2
    field điểm đã dời sang Bước 1) — hiện khi có ít nhất 1 giường đã chọn (`capNhatFormChonGiuong`).
  - **Khối "Nơi xuất phát / Điểm đến" (`renderChieuSelector`, 2026-09-19, đợt 4 — thay 2 nút
    "Đắk Lắk → Hải Dương"/"Hải Dương → Đắk Lắk" đứng cạnh nhau của đợt 3)** — theo yêu cầu làm giống
    layout Vexere (dot xanh "Nơi xuất phát" + dot đỏ "Điểm đến", nối bằng đường kẻ đứt nét, nút
    tròn "⇅" bên phải để đổi chiều). **Khác Vexere ở bản chất**: Vexere cho gõ tự do 2 ô tìm thành
    phố bất kỳ; app này CHỈ CÓ ĐÚNG 2 HƯỚNG CỐ ĐỊNH (Đắk Lắk↔Hải Dương) nên "⇅" không mở ô tìm kiếm
    nào — chỉ `chieuDangChonTrongLich = chieuDangChonTrongLich === 'bac' ? 'nam' : 'bac'` rồi vẽ lại
    đúng khối này với nhãn đảo ngược (`DIEM_THEO_CHIEU`). Bấm ngày mới (`chonNgay`) LUÔN reset
    `chieuDangChonTrongLich` về mặc định `'bac'` — không giữ hướng đã bấm tạm của ngày trước đó.
    - **Bug thật gặp ngay sau khi ra mắt (2026-09-19, đợt 5, cùng ngày)** — listener đổi chiều ban
      đầu chỉ gắn vào `#route-swap-btn` (nút tròn 38px), khách bấm trúng CHỮ "Đắk Lắk"/"Hải Dương"
      (vùng chạm lớn hơn, trực giác hơn nút tròn nhỏ) thì KHÔNG đổi chiều mà bị Android Chrome hiểu
      thành thao tác CHỌN TEXT, bật popup gốc trình duyệt "Tìm kiếm trên Google" — trải nghiệm rất
      tệ trên PWA (giống hệt lý do `confirmDialog()` thay `confirm()` gốc ở các trang crew). Sửa
      bằng `user-select: none` + `-webkit-tap-highlight-color: transparent` trên
      `.route-select-wrap` — chặn hẳn khả năng chọn text trong khối (giữ nguyên tới tận bây giờ,
      không đổi lại dù đợt 6 dưới đây tách lại vùng bắt click).
    - **BỎ nút "Tiếp tục" (2026-09-19, đợt 6, cùng ngày, theo yêu cầu) — tách lại 2 vùng bắt
      click, KHÔNG dùng chung 1 vùng như đợt 5 nữa**: nút tròn `#route-swap-btn` giờ
      `e.stopPropagation()` khi bấm — CHỈ đổi chiều hiển thị, không xác nhận gì; bấm vào PHẦN CÒN
      LẠI của `.route-select-wrap` (2 dòng "Nơi xuất phát"/"Điểm đến") mới THẬT SỰ CHỌN XONG, gọi
      thẳng `chonChuyen` với chiều đang hiển thị tại thời điểm bấm — không còn bước xác nhận riêng
      biệt nào nữa. `user-select:none` của đợt 5 vẫn cần giữ nguyên (lý do không đổi: bấm vào 2
      dòng text giờ là hành động CHỌN XONG, càng cần chặn chọn text hơn cả trước).
    - **Modal chọn địa danh khi bấm TÊN TỈNH (2026-09-19, đợt 8, theo yêu cầu) — tách thành 3 vùng
      bắt click, KHÔNG còn 2 như đợt 6**: `.route-place-value` (span mới bọc riêng "Đắk Lắk"/"Hải
      Dương") giờ `stopPropagation()` + mở `#dia-diem-picker` (bottom-sheet nhỏ, cùng pattern
      `.ve-modal`/`.diemkhach-modal` ở `khach.html`, KHÔNG phải search page tự do kiểu Vexere vì
      app chỉ có đúng 2 địa danh cố định) thay vì lọt xuống vùng confirm của đợt 6 — phần CÒN LẠI
      của dòng (nhãn "Nơi xuất phát"/"Điểm đến", đường kẻ đứt nét, nền row) mới giữ đúng hành vi
      confirm cũ (`chonChuyen` ngay). Chọn 1 trong 2 dòng trong modal chỉ set lại
      `chieuDangChonTrongLich` theo bảng mapping (xuất phát→Đắk Lắk hoặc đến→Hải Dương ⇒ `'bac'`;
      xuất phát→Hải Dương hoặc đến→Đắk Lắk ⇒ `'nam'`) rồi vẽ lại `renderChieuSelector` — KHÔNG gọi
      `chonChuyen`, y hệt cách nút "⇅" hoạt động (chỉ đổi hiển thị, chưa xác nhận). `entryDangChonChieu`
      (biến module-level, gán lại mỗi lần `renderChieuSelector` chạy) giữ tham chiếu `entry` để modal
      vẽ lại đúng khối sau khi đóng, không cần đóng/mở lại cả Bước 0. `user-select:none` (đợt 5) áp
      dụng thêm cho `.dia-diem-picker-card` — modal cũng hiện tên địa danh dạng text, cùng rủi ro
      Android Chrome hiểu nhầm thành chọn text nếu bỏ sót.
    - **Chọn tỉnh TỰ DO trong 17 tỉnh dọc tuyến (2026-09-19, đợt 9, theo yêu cầu) — thay hẳn state
      `chieuDangChonTrongLich: 'bac'|'nam'` bằng `noiXuatPhatTinh`/`diemDenTinh` (object
      `{ma, ten, thu_tu}`, mặc định lấy từ `tinhList` theo `ma` — Đắk Lắk/Hải Dương)** — trước đó
      Bước 0 chỉ có ĐÚNG 2 điểm cố định (2 đầu tuyến), đợt này cho khách chọn CẶP TỈNH bất kỳ dọc
      tuyến (vd Đà Nẵng → Hà Nội), chỉ tổng quát hoá Bước 0 — **Bước 1 (chọn `diem_khach` cụ thể)
      CHƯA lọc gì theo cặp tỉnh đã chọn, vẫn hiện toàn bộ điểm dọc tuyến như cũ**, để nguyên phạm vi
      đợt này. `chieu` (giá trị BE cần, contract KHÔNG đổi — vẫn chỉ nhận `'bac'|'nam'`) không còn
      lưu sẵn, LUÔN SUY RA bằng so `thu_tu`: `noiXuatPhatTinh.thu_tu < diemDenTinh.thu_tu ? 'bac' :
      'nam'` — tính lại NGAY TẠI ĐIỂM CONFIRM (`chonChuyen`, không đọc qua closure `chieu` đã tính ở
      đầu `renderChieuSelector`) để phòng lệch nếu sau này có chỗ khác đổi 2 biến tỉnh mà quên gọi
      lại `renderChieuSelector`. `tinhTuyenChoDatVe()` — TÁI DÙNG `tinhList` đã tải sẵn từ
      `api/cong-khai-diem-khach.js` (đang phục vụ dropdown Bước 1), KHÔNG gọi thêm API riêng — chỉ
      lọc `ma !== 'KHH'` (Khánh Hòa, xe không qua, cùng lý do filter `hang.html`'s `loadTinh()`),
      giữ nguyên thứ tự `thu_tu` server đã trả. `moDiaDiemPicker(vaiTro)` list 17 tỉnh, LOẠI THÊM
      tỉnh đang chọn Ở ĐẦU KIA khỏi danh sách (mở picker "Điểm đến" ẩn `ma` của
      `noiXuatPhatTinh`, và ngược lại) — chặn chọn trùng 1 tỉnh cho cả 2 đầu. `#route-swap-btn` (⇅)
      giờ swap 2 OBJECT TỈNH (`const tam = noiXuatPhatTinh; noiXuatPhatTinh = diemDenTinh;
      diemDenTinh = tam`) thay vì toggle 1 string — behavior y hệt cũ, chỉ tổng quát hoá kiểu dữ
      liệu. `renderChuyenDaChonBar` đổi nhãn "Chuyến đã chọn" từ đọc `c.ten` (chuỗi cố định server
      trả, chỉ đúng cho 2 đầu tuyến) sang tự ghép client `` `${noiXuatPhatTinh.ten} → ${diemDenTinh.ten}`
      `` — 2 biến này KHÔNG bị reset khi confirm, vẫn giữ đúng cặp tỉnh vừa chọn cho tới lần
      `chonNgay` (chọn ngày mới) kế tiếp mới reset lại về mặc định 2 đầu tuyến. `.dia-diem-picker-card`
      thêm `max-height:75vh; overflow-y:auto` (giống `.ve-modal-card` ở `khach.html`) — 17 dòng
      không còn vừa màn hình nhỏ như bản 2 dòng cố định trước đó.
    - **BỎ HẲN Bước "Chọn điểm lên/xuống" (2026-09-19, đợt 10, theo yêu cầu)** — bullet này mô tả
      `timDiemChoTinh`/`diemLenId`/`diemXuongId`, đã BỊ THAY THẾ HOÀN TOÀN bởi picker Tỉnh→Xã/Huyện
      (2026-09-22) — xem mục "Bỏ diem_khach, thay bằng chọn Tỉnh + Xã/Huyện" phía trên. Giữ lại
      nguyên văn bên dưới chỉ để biết lịch sử/lý do "tỉnh chưa có diem_khach vẫn cho đặt vé bình
      thường" (nguyên tắc đó vẫn còn đúng tinh thần dù cơ chế đã đổi hẳn).
      Sau khi xác nhận tỉnh xuất phát/đến ở Bước 0, đi THẲNG sang sơ đồ giường, không còn dropdown
      `#diem-len-select`/
      `#diem-xuong-select` chờ khách chọn `diem_khach` cụ thể (đã bỏ hẳn HTML/CSS `.diem-chon-wrap`/
      `.cho-chon-diem-hint`, hàm `renderDiemKhachOptions`, listener `capNhatHienThiSoDo`). Thay bằng
      `timDiemChoTinh(tinhMa)` — tự lấy điểm ĐẦU TIÊN (sắp theo `thu_tu`, null xuống cuối) của đúng
      tỉnh khách vừa chọn, gán vào `currentChuyen.diemLenId`/`diemXuongId` ngay trong `chonChuyen`.
      **Quyết định owner khi được hỏi (2 câu hỏi riêng)**: (1) tỉnh có NHIỀU điểm (vd Hải Dương có 2
      điểm cùng tên "Sặt") → tự lấy điểm đầu theo `thu_tu`, KHÔNG hỏi lại; (2) tỉnh CHƯA có
      `diem_khach` nào (đa số 17 tỉnh hiện tại, chỉ Đắk Lắk/Hải Dương có điểm thật) → **vẫn cho đặt
      vé bình thường**, `diemLenId`/`diemXuongId` để `null` — 2 cột `ve.diem_len_id`/`diem_xuong_id`
      ĐÃ nullable sẵn trong schema (không cần migration), crew tự điền điểm chính xác sau qua
      `khach.html` nếu cần. `api/cong-khai-dat-ve.js` bỏ hẳn validate `if (!diem_len_id ||
      !diem_xuong_id)` (400 "Vui lòng chọn điểm lên/xuống") — 2 field giờ hoàn toàn optional ở
      tầng API, không riêng gì UI. Đánh số lại 2 bước còn lại: "1. Chọn giường" (trước là "2."),
      "2. Thông tin liên hệ & thanh toán" (trước là "3."). **Lý do phát sinh yêu cầu này**: sau khi
      đợt 9 mở Bước 0 ra 17 tỉnh, khách thử chọn 1 cặp tỉnh giữa tuyến (vd Quảng Ngãi → Thừa Thiên
      Huế) thì dropdown Bước 1 tuy hiện đủ 4 điểm cũ nhưng KHÔNG điểm nào thật sự thuộc 2 tỉnh đó
      (chỉ Đắk Lắk/Hải Dương có `diem_khach`) — "chọn xong không có gì đúng để chọn", owner quyết
      định bỏ hẳn bước hỏi thay vì chờ crew thêm đủ dữ liệu cho 17 tỉnh.
    - **Thêm nút xác nhận tường minh "🪑 Chọn vị trí giường" (2026-09-19, đợt 11, theo phản ánh
      thật)** — trước đó (đợt 6) xác nhận CHỈ xảy ra ngầm khi bấm vào nhãn/nền `.route-select-wrap`,
      không có gì hiện rõ "bấm vào đâu để đi tiếp" — khách xem ảnh chụp thật cho thấy chọn xong tỉnh
      rồi đứng yên không biết bấm gì. `#btn-chon-vi-tri-giuong` render NGAY DƯỚI `.route-select-wrap`
      (sibling trong `#lich-chieu-wrap`, KHÔNG lồng trong khối có `user-select:none` của đợt 5 —
      không cần tính lại vùng bắt click), gọi chung hàm `xacNhanChonChieu()` với vùng bấm ngầm cũ —
      **KHÔNG tháo bỏ hành vi tap-to-confirm của đợt 6**, chỉ thêm 1 đường xác nhận tường minh song
      song, cả 2 cùng dẫn tới `chonChuyen`.
    - **BỎ mặc định Đắk Lắk/Hải Dương (2026-09-18, đợt 14, theo yêu cầu) — `noiXuatPhatTinh`/
      `diemDenTinh` giờ khởi tạo `null`, `chonNgay` reset về `null`/`null` mỗi lần chọn ngày mới**
      — trước đó (đợt 9-13) MỌI lần bấm ngày trên lịch đều TỰ ĐỘNG preset lại 2 đầu tuyến cố định
      (`tinhList.find(t => t.ma === 'DLK'/'HDG')`), kể cả khi khách đã chủ động đổi sang cặp tỉnh
      khác ở lượt chọn ngày trước đó — mỗi lần đổi ngày là mất lựa chọn tỉnh, phải chọn lại từ đầu.
      `renderChieuSelector` giờ hiện **placeholder** "Chọn nơi xuất phát"/"Chọn điểm đến" (class
      `.route-place-placeholder`, chữ nhỏ `16px` màu xám thay vì `28px` bold của tên tỉnh thật) khi
      tương ứng đang `null`, và `#btn-chon-vi-tri-giuong` tự `disabled` (nền xám `#b0bec5`) cho tới
      khi CẢ 2 đã chọn. Vùng bấm ngầm (3) trên `.route-select-wrap` — nếu bấm khi chưa đủ 2 tỉnh —
      giờ báo toast "Vui lòng chọn cả nơi xuất phát và điểm đến" thay vì crash (trước đó code giả
      định 2 biến này LUÔN là object, không bao giờ `null`) chứ không tự tiến hành. `moDiaDiemPicker`
      dùng optional chaining (`tinhBenKia?.ma`, `(...)?.ma`) khi tính danh sách loại trừ/tô đậm —
      tỉnh bên kia `null` thì không loại thêm gì khỏi list 17 tỉnh. `tinhGiaVe()` (đọc
      `noiXuatPhatTinh.gia_moc`) chỉ được gọi từ `capNhatGiaVeBar()` khi `selectedGiuongMap.size >
      0`, tức LUÔN sau khi đã confirm (2 tỉnh chắc chắn không `null` ở thời điểm đó) — không cần
      thêm guard riêng.
  - **`chonNgay` KHÔNG còn reset `noiXuatPhatTinh`/`diemDenTinh` về `null` mỗi lần bấm ngày
    (2026-09-19, đợt 16, theo phản ánh thật — đảo ngược đúng 1 phần của đợt 14 ở trên)** — đợt 14
    cố ý reset để tránh mất lựa chọn cũ khi TỰ ĐỘNG preset lại 2 đầu tuyến, nhưng lại tạo ra 1 bug
    thật khác: bấm Back Android (hoặc "Đổi chuyến khác") quay về Bước 0 rồi bấm lại 1 ngày để tiếp
    tục — `doiChuyenKhac()` không đụng 2 biến tỉnh, nhưng `chonNgay` chạy lại NGAY SAU ĐÓ (do khách
    bấm ngày) lại xoá sạch tỉnh xuất phát/điểm đến khách vừa chọn trước khi bấm Back, cảm giác
    "bấm quay lại là mất hết điểm đi/điểm đến". Giờ 2 biến này **GIỮ NGUYÊN xuyên suốt cả phiên**
    (đổi ngày khác, bấm Back, "Đổi chuyến khác"...) — chỉ `null` ở lần ĐẦU TIÊN (giá trị khởi tạo)
    cho tới khi khách chọn qua `moDiaDiemPicker` lần đầu; sau đó khách chỉ cần đổi lại nếu THẬT SỰ
    muốn (qua `moDiaDiemPicker`/nút "⇅"), không còn bị ép chọn lại mỗi lần bấm ngày.
  - **Lịch dạng lưới (2026-09-19)** — `renderThangBlock({y,m})` vẽ 1 tháng: tuần bắt đầu **Thứ Hai**
    (không phải Chủ Nhật — đúng mẫu Vexere, cột tính bằng `(getUTCDay()+6)%7`), ô trống lấp đầu
    tháng (`.lich-ngay-o.trong`, `visibility:hidden`, chỉ để giữ đúng vị trí cột) render trước ngày
    1. Mỗi ô ngày (`renderNgayO`) hiện dương lịch to phía trên + âm lịch nhỏ phía dưới, **âm lịch
    LUÔN TÍNH LẠI Ở CLIENT** (`convertSolar2Lunar`, hàm global có sẵn từ `shared.js` — KHÔNG phải
    import chéo, chỉ tái dùng đúng như `formatDate` đã làm) cho MỌI ô kể cả ô ngoài khoảng server
    trả (quá khứ, hoặc quá xa nếu khách bấm "›" vượt khoảng mở bán) — chỉ dùng để HIỂN THỊ đúng số
    âm lịch, KHÔNG dùng để tự suy diễn "hợp lệ hay không": cờ `hop_le` LUÔN đọc từ `lichMap.get(ngay)`
    (dữ liệu server), ô không có entry trong map mặc định `hop_le=false`. Định dạng âm lịch: mùng 1
    hiện `"d/M"` (vd `"1/8"`), các ngày sau trong CÙNG tháng âm chỉ hiện số lẻ (`"2"`, `"3"`...) —
    đỡ lặp lại "/8" mỗi ô. Ô `hop_le=false` (ngày lẻ âm, ngày quá khứ, hoặc ngoài khoảng server trả)
    → `.khong-hop-le` (`opacity:0.35`, `pointer-events:none`, không gắn click listener); `hop_le=true`
    → `.hop-le` (viền rõ, hover đổi nền), gắn click mở `chonNgay`. Ô đang tô cam →
    thêm `.dang-chon` (nền cam đặc `#fb8c00`, đè lên `.hop-le`/`.khong-hop-le` vì luôn hợp lệ mới
    chọn được).
  - **CHỈ 1 khối tháng/màn hình (đổi 2026-09-19, đợt 2 — sau khi owner xem ảnh chụp thật trên điện
    thoại)** — spec gốc yêu cầu "2 khối tháng cạnh nhau" giống Vexere; bản đầu implement đúng vậy
    (`renderLichThang` vẽ `thang1`/`thang2 = thang1+1` cạnh nhau), nhưng trong khung 480px của
    `body` (khoá mobile-first, xem đầu file `<style>`), 2 khối 7-cột phải thu nhỏ chữ/ô tới mức khó
    đọc mới đủ chỗ nằm cạnh nhau — ảnh chụp thật cho thấy rõ vấn đề này. Owner yêu cầu quay lại
    **1 khối tháng/màn hình**, dùng `‹`/`›` để lùi/tới xem tháng khác — `renderLichThang()` giờ chỉ
    tính 1 mốc `thang = themThang(goc, baseMonthOffset)` và vẽ đúng 1 `renderThangBlock`.
  - **Điều hướng tháng (`baseMonthOffset`)** — bấm `‹`/`›` đổi `baseMonthOffset--`/`++` rồi
    `renderLichThang()` lại từ đầu. `‹` khoá (`disabled`) khi đang đúng THÁNG HIỆN TẠI
    (`baseMonthOffset <= 0`) — không cho lùi về trước hôm nay. `›` KHÔNG khoá cứng (spec không yêu
    cầu) — bấm vượt quá 45 ngày mở bán vẫn cho xem, chỉ là mọi ô ngày trong vùng đó không có entry
    trong `lichMap` nên tự động `hop_le=false` hết (khoá bấm), không cần thêm điều kiện khoá `›`
    riêng lẫn không cần fetch thêm dữ liệu — khớp đúng "KHÔNG LÀM" của spec gốc (không preload/fetch
    thêm ngoài 1 lần gọi API lúc `initPage`, dữ liệu 46 ngày đã tải sẵn là đủ cho mọi thao tác điều
    hướng, kể cả khi chỉ còn 1 khối tháng thay vì 2).
  - **`currentChuyen.chuyen_id` CÓ THỂ `null`** (2026-09-17, đợt 2) — ngày/chiều khách vừa bấm chưa
    từng có ai đặt thì chưa tồn tại `chuyen` thật trong DB. `taiSoDo()` gọi
    `api/cong-khai-so-do` KHÔNG kèm `chuyen_id` trong trường hợp này (server trả toàn bộ giường
    trống — đúng vì chưa tồn tại chuyến thì chắc chắn chưa ai đặt). Lúc bấm "Đặt vé", request đầu
    tiên gửi `{ngay, chieu, ...}` thay vì `chuyen_id` — `api/cong-khai-dat-ve.js` tự tạo `chuyen` và
    trả lại `chuyen_id` thật trong response, frontend gán ngay vào `currentChuyen.chuyen_id` để các
    lượt đặt tiếp theo (nhiều giường trong cùng lượt, hoặc `taiSoDo()` sau đó) dùng thẳng, không tạo
    lại/tra lại mỗi lần.
  - **Bấm "Đổi chuyến khác" (`doiChuyenKhac`) XOÁ SẠCH lựa chọn điểm + giường, RESET LỊCH** (`ngayDangChonTam
    = null`, `baseMonthOffset = 0`, `selectedGiuongMap.clear()`, reset 2 select điểm về rỗng, ẩn hết
    Bước 1-3) — KHÁC hành vi "đổi điểm lên/xuống" (không xoá giường đã chọn, xem bullet dưới) vì đổi
    SANG NGÀY/CHIỀU KHÁC nghĩa là sơ đồ giường/tập điểm hợp lệ đã đổi hẳn, giữ lại lựa chọn cũ sẽ
    tham chiếu tới giường/context không còn đúng. Reset về đúng tháng hiện tại (không giữ tháng đang
    xem trước đó) — chọn lại luôn bắt đầu từ hôm nay, đơn giản hơn nhớ lại vị trí cũ.
  - **Guard Back Android/trình duyệt (2026-09-19, đợt 7, theo yêu cầu)** — trước đó `dat-ve.html`
    KHÔNG có cơ chế Back riêng (khác 5 trang crew nội bộ, xem "Phím Back Android" ở `hang.html`
    trong CLAUDE.md): bấm Back cứng/vuốt gesture lúc đang ở Bước 1-3 sẽ THOÁT HẲN khỏi trang, MẤT
    TRẮNG mọi lựa chọn — rủi ro cao hơn hẳn app cài đặt riêng vì đây là trang public mở qua link.
    **Chỉ cần ĐÚNG 1 CẤP GUARD** (khác `stepStack` nhiều bước của `hang.html`) vì `dat-ve.html` chỉ
    có ĐÚNG 1 lần chuyển màn thật sự thay thế nội dung — chọn xong ngày/chiều ở Bước 0
    (`chonChuyen`) thu gọn khối lịch thành 1 thanh nhỏ (`renderChuyenDaChonBar`); Bước 1-3 chỉ hiện
    dần thêm nội dung trên CÙNG 1 trang cuộn, không phải màn hình riêng cần guard riêng cho từng
    bước. `pushBackGuard()` (`history.pushState`, có guard `backGuardPushed` chống push trùng) gọi
    ngay đầu `chonChuyen` — Back sau đó (`popstate`, đăng ký DUY NHẤT 1 lần ở top-level) gọi thẳng
    `doiChuyenKhac()` để đưa người dùng về lại Bước 0. **KHÔNG tái tạo guard vĩnh viễn như
    `hang.html`** (trang đó là dashboard chính, cố tình không bao giờ cho thoát qua Back) — ở đây
    Back LẦN NỮA sau khi đã về Bước 0 sẽ THẬT SỰ rời trang, vì đó là màn gốc hợp lý để người dùng
    public rời khỏi trang đặt vé. Nút "Đổi chuyến khác" cũng đi qua ĐÚNG 1 đường xử lý này
    (`history.back()` thay vì gọi thẳng `doiChuyenKhac()`) — tránh lệch giữa history thật của trình
    duyệt và trạng thái UI hiển thị (bấm nút mà không tiêu thụ entry đã push thì lần Back kế tiếp
    của khách sẽ vô tình lùi thêm 1 bước ngoài ý muốn).
  - **Đổi lại điểm lên/xuống (trong CÙNG 1 chuyến) sau khi đã chọn giường KHÔNG xoá giường đã
    chọn** — `selectedGiuongMap` độc lập với việc Bước 2 đang hiện hay ẩn, chỉ ẩn/hiện lại đúng
    khối tương ứng, quay lại chọn điểm khác vẫn thấy nguyên giường đã chọn trước đó (khác hẳn việc
    đổi CHUYẾN ở Bước 0, xem bullet trên).
  - Chọn "Chuyển khoản trước" hiện thêm khối thông tin chuyển khoản TĨNH (số tài khoản/tên/nội
    dung gõ tay, KHÔNG có cổng thanh toán thật/QR động — khách tự chuyển rồi bấm "Đặt vé", crew đối
    chiếu tay qua app ngân hàng sau, không có xác nhận tự động).
  - **Banner nhắc nhường ghế tầng 1 (2026-09-19, theo yêu cầu)** — `.nhuong-ghe-notice`, TĨNH
    (không phải `showToast` tự biến mất sau vài giây — nội dung dài, khách cần đủ thời gian đọc
    trong lúc đang chọn giường), nằm ngay dưới tiêu đề "1. Chọn giường", LUÔN hiện cùng lúc
    `#so-do-wrap` (không có điều kiện riêng, không cần JS set nội dung).
  - **Chọn NHIỀU giường cùng lúc (2026-09-16, theo yêu cầu)** — `selectedGiuongMap`
    (`Map<giuong.id, giuong>`) thay cho biến đơn `selectedGiuong` ban đầu. Bấm giường trống → TOGGLE
    (`toggleChonGiuong`): chưa chọn thì thêm vào map, ĐÃ CHỌN (đang tô xanh dương "Đang chọn") thì
    bấm lại để bỏ chọn — cùng 1 nút bấm, không có nút "Bỏ chọn" riêng. Điều kiện gắn click-listener
    ở `renderMotTang` là `g.hoat_dong && g.trong` — `g.trong` đọc từ server nên KHÔNG đổi khi mới
    chọn (chỉ đổi sau khi đặt vé thành công), giường đang chọn vẫn giữ `trong:true` nên vẫn bấm lại
    được để bỏ chọn, không cần điều kiện riêng. Dòng "Giường đã chọn" đổi thành liệt kê tất cả
    (`capNhatFormChonGiuong`, vd "Giường đã chọn (2): T1-02, T1-03") — form tự ẩn khi bỏ chọn hết
    (0 giường), tự hiện khi có ít nhất 1 giường được chọn (chỉ auto-scroll lúc form từ ẩn sang
    hiện, không cuộn lại mỗi lần bấm thêm/bớt giường khi form đã đang mở).
  - **1 bộ Tên/SĐT/Điểm lên-xuống/Thanh toán áp dụng cho MỌI giường đã chọn** khi bấm "Đặt vé" — v1
    KHÔNG hỗ trợ nhập riêng thông tin từng khách cho từng giường (test tính năng, giữ đơn giản; nếu
    cần đặt cho nhiều người khác thông tin thì bấm "Đặt vé" nhiều lượt riêng, mỗi lượt 1 giường).
  - **Đặt TUẦN TỰ từng giường** (không `Promise.all`) qua vòng lặp gọi `api/cong-khai-dat-ve`, nút
    hiện tiến độ "Đang đặt vé... (X/Y)". Giường nào lỗi (vd bị người khác đặt trước đúng lúc đang xử
    lý — hiếm nhưng có thể xảy ra khi chọn nhiều giường, thời gian xử lý dài hơn 1 giường đơn) được
    gom riêng, KHÔNG chặn các giường còn lại tiếp tục đặt. **Có ít nhất 1 giường thành công** → vẫn
    hiện màn xác nhận (chỉ liệt kê mã giường thành công), kèm toast riêng báo giường nào lỗi nếu có
    — tránh mất trắng cả lượt đặt nhóm chỉ vì 1 giường trong đó bị trùng. **Không giường nào thành
    công** → báo lỗi (dùng thông báo của giường đầu tiên, tránh toast dài dòng liệt kê hết), xoá
    sạch `selectedGiuongMap`, tải lại sơ đồ.
- **"🌐 Đặt online"** — xem bullet badge trong mục `khach.html` phía trên.

### Lịch chạy cố định theo ngày chẵn âm lịch (2026-09-17, đợt 2)

Trước đây `dat-ve.html` chỉ cho khách chọn giữa các chuyến CREW ĐÃ TỰ TẠO TAY (`hang.html`) — nếu
crew chưa tạo chuyến nào cho 1 ngày, khách không có gì để chọn. Đợt này đảo ngược: hệ thống TỰ BIẾT
lịch chạy (xe chạy mọi ngày ÂM LỊCH CHẴN, 2, 4, 6... 30 mỗi tháng âm, mỗi ngày 2 chuyến độc lập —
1 chuyến chiều `bac` + 1 chuyến chiều `nam`, 2 xe khác nhau), khách chọn ngày/chiều TRƯỚC, `chuyen`
thật trong DB chỉ được TẠO LÚC CẦN (khách thật sự bấm "Đặt vé", hoặc crew bấm "Bắt đầu chuyến").

- **`chuyen.trang_thai` thêm giá trị thứ 3: `'dat_truoc'`** (migration `chuyen_trang_thai_dat_truoc`
  — `alter constraint` + `create unique index uq_chuyen_ngay_chieu on chuyen (chuyen_ngay_vn(khoi_hanh), chieu)
  where trang_thai in ('dat_truoc','dang_chay')`) — chuyến hệ thống TỰ TẠO cho 1 ngày/chiều theo
  lịch chẵn âm, CHƯA tới lúc crew "Bắt đầu chuyến". KHÁC `'dang_chay'` để không lẫn vào luồng crew
  đang thao tác (xem các bullet Step 5 bên dưới — đây là điểm quan trọng nhất tránh crew bị rối khi
  thấy chuyến của 10 ngày sau nằm chung danh sách hôm nay). `chuyen_ngay_vn(ts)` là 1 SQL function
  `IMMUTABLE` phụ (đánh dấu IMMUTABLE hợp lý vì `Asia/Ho_Chi_Minh` không có DST, offset cố định
  +07:00 — cần thiết vì Postgres không cho index trực tiếp biểu thức không-IMMUTABLE như
  `ts::date`/`ts AT TIME ZONE ...`), tính "ngày dương lịch VN" của `khoi_hanh` để unique index chặn
  đúng 1 chuyến `dat_truoc`/`dang_chay` cho mỗi (ngày, chiều) — DB tự chặn race condition khi 2
  khách cùng bấm đặt cho cùng ngày gần như đồng thời (1 insert lỗi `23505`, code bắt lỗi này rồi
  SELECT lại lấy đúng bản ghi vừa được request kia tạo, xem `api/cong-khai-dat-ve.js`).
- **`api/cong-khai-lich-chay.js`** (GET, thay hoàn toàn `api/cong-khai-chuyen.js` đã xoá) — tính
  trước `SO_NGAY_MO_BAN_TRUOC = 45` ngày tới (**GIÁ TRỊ TẠM**, owner cần xác nhận thực tế mở bán
  trước bao lâu rồi sửa hằng số này nếu khác). Thuật toán âm lịch (`convertSolar2Lunar` + các hàm
  phụ trợ `_jdFromDate`/`_newMoon`/...) **COPY NGUYÊN VĂN từ `shared.js`** — file đó là script
  trình duyệt thuần (hàm ở global scope, không `module.exports`) nên không `import` thẳng được vào
  route serverless Node ESM, cùng convention "không import chéo" đã dùng cho `chuanHoaSdt`/
  `laSdtHopLe`.
  - **Response shape đổi hẳn (2026-09-19, phục vụ giao diện LỊCH DẠNG LƯỚI)** — trước đó API tự
    LỌC SẴN chỉ trả ngày hợp lệ (danh sách phẳng không cần biết ngày không chạy). Giờ trả về
    **TOÀN BỘ ngày trong khoảng** `[hôm nay, hôm nay+45]` kể cả ngày KHÔNG chạy, để frontend tự vẽ
    đủ ô lịch đúng vị trí (ngày lẻ âm vẫn cần có ô, chỉ mờ/khoá — không thể bỏ qua như bản danh
    sách phẳng cũ, xem `renderThangBlock` ở `dat-ve.html`): `{lich: [{ngay, lunar_day, lunar_month,
    hop_le}, ...]}` — ngày `hop_le: false` KHÔNG có field `bac`/`nam` (frontend không cần); ngày
    `hop_le: true` có thêm `bac: {chuyen_id, ten}` + `nam: {chuyen_id, ten}` (chuyen_id `null` nếu
    `chuyen` chưa tồn tại trong DB). **Phần tử ĐẦU TIÊN của mảng LUÔN LÀ HÔM NAY** (`i=0` trong
    vòng lặp) bất kể `hop_le` — `dat-ve.html` dựa vào bất biến này để lấy `homNayStr` làm mốc tính
    tháng gốc cho lịch, không cần tính lại "hôm nay" ở client.
  - **`hop_le` giờ là 1 cờ DUY NHẤT CHO CẢ NGÀY** (đổi từ loại RIÊNG TỪNG CHIỀU trước đó, đơn giản
    hoá cho giao diện lịch — 1 ô ngày chỉ có đúng 1 trạng thái hợp lệ/không, không còn khái niệm
    "ngày hợp lệ nhưng chỉ 1 trong 2 chiều bán được") — `hop_le = (lunar_day chẵn) && (ngày >= hôm
    nay) && (nếu là hôm nay: chưa qua GIỜ KHỞI HÀNH SỚM NHẤT trong 2 chiều)` (`gioSomNhat`, so
    `gioBac`/`gioNam` theo phút-trong-ngày, lấy giá trị nhỏ hơn). Hệ quả: nếu hôm nay đã qua giờ
    chiều SỚM nhưng chưa qua giờ chiều MUỘN, cả 2 chiều đều bị coi là hết hạn cùng lúc (thà chặn
    nhầm 1 chiều còn kịp giờ, còn hơn giữ logic phức tạp "1 ngày 2 trạng thái" cho 1 giao diện vốn
    chỉ có 1 ô/ngày) — chấp nhận được vì đây là bản TEST, khác biệt rất nhỏ (vài giờ trong ngày).
  - **`bac.ten`/`nam.ten` đổi từ "Ra Bắc (Đắk Lắk → Hải Dương)"/"Vào Nam (Hải Dương → Đắk Lắk)"
    sang chỉ còn ĐÚNG "Đắk Lắk → Hải Dương"/"Hải Dương → Đắk Lắk" (2026-09-19, đợt 3, theo yêu
    cầu)** — khách không cần biết/quan tâm khái niệm hướng tuyến Bắc/Nam nội bộ của crew, chỉ cần
    thấy rõ đi từ đâu tới đâu. `dat-ve.html` không có logic riêng nào phụ thuộc chữ "Ra Bắc"/"Vào
    Nam" (chỉ in thẳng `info.ten`/`c.ten` ra 2 nút chiều + thanh "Chuyến đã chọn") nên đổi 1 chỗ
    duy nhất ở server là đủ, không cần sửa gì thêm ở frontend ngoài việc đổi hardcode cũ
    `chieu === 'bac' ? '🚏 Ra Bắc' : '🚏 Vào Nam'` (trong `chonNgay`) thành `🚏 ${info.ten}`.
- **Giờ khởi hành KHÔNG còn là ENV Vercel (đổi 2026-09-20, Multi-tenant Giai đoạn 5)** — trước đó
  `GIO_KHOI_HANH_BAC`/`GIO_KHOI_HANH_NAM` là 2 biến ENV dùng chung cho MỌI nhà xe (`"07:00"`/
  `"02:00"`, owner xác nhận 2026-09-19), giờ chuyển thành **2 cột DB riêng từng nhà xe**:
  `nha_xe.gio_khoi_hanh_bac`/`nha_xe.gio_khoi_hanh_nam` (kiểu `time`, `NOT NULL`, KHÔNG có
  `DEFAULT` — cố ý, nhà xe mới bắt buộc khai báo tường minh khi onboard ở Giai đoạn 6, không được
  âm thầm rơi vào giờ của nhà xe khác). Đọc ở `api/cong-khai-lich-chay.js` (`docGioTuNhaXe`) và
  `api/cong-khai-dat-ve.js` (`tinhKhoiHanhMacDinh`) — cả 2 nhận `nhaXe` (đã resolve từ `?nx=`) làm
  tham số thay vì đọc `process.env`. 2 biến ENV cũ đã xoá khỏi Vercel (mọi scope) sau khi deploy +
  test pass — sửa giờ 1 nhà xe giờ chỉ cần `UPDATE nha_xe SET gio_khoi_hanh_bac=... WHERE
  slug=...`, không cần set lại env/deploy lại như trước.
- **`api/cong-khai-dat-ve.js` tự tạo `chuyen` nếu chưa có** — nhận `chuyen_id` (chuyến đã tồn tại)
  HOẶC `{ngay, chieu}` (chưa chắc tồn tại). Xem bullet chi tiết ở mục "Đặt vé công khai" phía trên
  (phần `api/cong-khai-dat-ve.js`) — không lặp lại ở đây.
- **`api/cong-khai-so-do.js`'s `chuyen_id` thành optional** — xem bullet ở mục "Đặt vé công khai"
  phía trên.
- **`dat-ve.html` Bước 0 đổi từ "chọn giữa các chuyến đã tạo" sang "chọn ngày+chiều theo lịch"** —
  xem các bullet đã cập nhật trong mục "Đặt vé công khai" phía trên (`renderChonChuyenStep`,
  `chonChuyen`, `taiSoDo`, `currentChuyen.chuyen_id` nullable).
- **Step 5 — phía crew không bị rối bởi chuyến tương lai**:
  - `hang.html` Bước 0 "Chọn chuyến đang chạy" — filter `trang_thai = 'dang_chay'` GIỮ NGUYÊN,
    không đổi gì — chuyến `dat_truoc` KHÔNG hiện ở đây (đúng mục đích: crew không nhập kiện cho
    chuyến chưa tới ngày/chưa "Bắt đầu chuyến").
  - **`lich-su-chuyen.html` thêm nhóm thứ 3 "📅 Chuyến đã đặt trước"** (`trang_thai = 'dat_truoc'`,
    sắp `khoi_hanh` TĂNG DẦN, hiện Ở TRÊN CÙNG — trước cả "Chuyến đang chạy" — vì đây là việc cần
    làm sắp tới, tự nhiên đọc trước) — mỗi card hiện chiều/ngày giờ + số khách đã đặt online
    (`veCountMap`, query `ve` riêng CHỈ cho các chuyến `dat_truoc` đang hiện, không query thừa cho
    50 chuyến). Card này KHÔNG điều hướng khi bấm vào thân (khác 2 nhóm còn lại — chưa "Bắt đầu
    chuyến" thì `manifest-hang.html` chưa có gì để crew làm với chuyến này), chỉ nút **"🚀 Bắt đầu
    chuyến"** (`createChuyenDatTruocCard`) mới có hành động: `confirmDialog()` rồi
    `UPDATE chuyen.trang_thai = 'dang_chay'`, từ đó chuyến này thấy Y HỆT 1 chuyến crew tự tạo tay ở
    mọi trang (`hang.html`/`manifest-hang.html`/`khach.html` không phân biệt nữa). Không có luồng
    ngược lại (đổi `dang_chay` về `dat_truoc`) — chưa cần, xem "KHÔNG LÀM" bên dưới.
  - **`manifest-hang.html`'s `loadChuyenOptions` thêm nhãn `"(đặt trước, chưa bắt đầu)"`** cạnh
    chuyến `dat_truoc` trong dropdown, để crew phân biệt được với chuyến `dang_chay` đang thao tác
    thật, xem trước danh sách khách/kiện nếu cần chuẩn bị sớm. **Ghi chú cũ ở đây từng nói "không
    cần sửa filter, lấy 50 chuyến bất kể trạng thái" — ĐÃ LỖI THỜI sau đợt lọc `'xong'` khỏi
    dropdown 2026-09-21 ở mục Pages phía trên, xem bullet đó.**
- **KHÔNG LÀM (ngoài phạm vi lần này)**: không tự động "Bắt đầu chuyến" theo giờ (cron) — crew bấm
  tay, tránh trường hợp xe không chạy được ngày đó (hỏng xe, tài xế nghỉ) mà hệ thống đã tự chuyển
  trạng thái; không huỷ/gộp chuyến `dat_truoc` nếu 0 khách đặt tới sát ngày — crew tự xử lý tay qua
  Supabase dashboard nếu cần, không có luồng UI riêng cho việc này ở bản test.

### Lịch chọn ngày đặt vé — popup toàn màn hình + khứ hồi (2026-09-23)

**Viết lại gần như toàn bộ Bước 0 của `dat-ve.html`** (commit "v5", `5920c4c`) — không chỉ thêm
tính năng khứ hồi, mà đổi hẳn cơ chế hiển thị lịch từ "1 khối tháng + nút `‹`/`›` hiện thẳng trong
trang" sang "lịch ẩn mặc định, bấm mở popup toàn màn hình cuộn dọc liên tục". Bước 1-3 (sơ đồ
giường/form liên hệ/OTP/đặt tuần tự nhiều giường, xem mục "Đặt vé công khai cho khách" phía trên)
**KHÔNG đổi gì** ở đợt này — `xacNhanChonChieu()`/`batDauChang()` chỉ tái dùng nguyên `chonChuyen()`
đã có sẵn. **Lưu ý cho người đọc sau này**: bản implement gốc của đợt này có nhiều comment trong
code trỏ `"xem SPEC 'Lịch chọn ngày đặt vé' CLAUDE.md"` nhưng mục này KHÔNG được viết vào CLAUDE.md
cùng lúc với code — viết bù lại sau (2026-09-23, cùng ngày, lúc audit lại theo yêu cầu owner).

- **Hàng tóm tắt sticky thay lịch hiện thẳng** (`#ngay-chon-row`, trong `renderChonChuyenStep`) —
  Bước 0 giờ chỉ hiện 1 hàng gọn "Ngày đi / Ngày về (nếu khứ hồi) + toggle Khứ hồi", bấm vào bất kỳ
  đâu trong hàng (trừ toggle, tự `stopPropagation`) mở `#ngay-picker` — popup toàn màn hình
  (`.fullscreen-picker`, DÙNG CHUNG class với picker Tỉnh→Xã/Huyện `#dia-diem-picker`, xem mục "Bỏ
  diem_khach" — 2 element DOM riêng, cùng style, đổi tên chung `.fullscreen-picker*` từ lúc có
  picker thứ 2 để không nhầm). Đóng popup (nút `←`, nút "Xác nhận" trong popup, hay Back Android)
  KHÔNG "huỷ" gì — mọi tap ngày đã commit thẳng vào `ngayDiChon`/`ngayVeChon` (module-level) ngay
  lúc tap, popup chỉ là nơi HIỂN THỊ; đóng xong luôn vẽ lại hàng tóm tắt + khối tuyến + nút "Xác
  nhận" ngoài trang (`dongNgayPicker()`).
- **Khối "Nơi xuất phát / Điểm đến" ĐƯA LÊN TRÊN hàng ngày** (`renderTuyenPickerBlock`, trong
  `.lich-chieu-wrap`) — khác bản cũ (khối này từng nằm DƯỚI lịch, chỉ hiện sau khi tap 1 ngày và
  nhận `entry` qua tham số hàm `renderChieuSelector(entry)`). Giờ khối này KHÔNG còn gắn với 1 lượt
  tap ngày cụ thể nào — đứng độc lập phía trên, tự đọc `ngayDiChon`/`lichMap` mỗi lần render, không
  còn tham số `entry`/biến `entryDangChonChieu`. Tên hàm cũng đổi (`renderChieuSelector` →
  `renderTuyenPickerBlock`) nhưng logic bên trong (chọn tỉnh tự do 17 tỉnh, picker Tỉnh→Xã/Huyện,
  không mặc định Đắk Lắk/Hải Dương, nút "⇅" chỉ swap hiển thị...) **giữ nguyên y hệt** những gì đã
  mô tả ở các bullet "đợt 4→16" phía trên (mục "Luồng 4 bước" — đã đánh dấu lỗi thời phần lịch,
  nhưng phần tuyến vẫn đúng).
- **Nút "Xác nhận" — FIXED ĐÁY MÀN HÌNH** (`.btn-chon-vi-tri-giuong`, navy `#0d1b4c`) thay bản cũ
  (button thường `.btn-primary`, nằm trong dòng chảy trang, dễ bị cuộn khuất khi lịch cao nhiều
  tháng) — luôn trong tầm tay. Dùng CHUNG style với `.gia-ve-bar` ở Bước 1 (2 bar KHÔNG BAO GIỜ
  cùng hiện 1 lúc: bar Bước 0 chỉ tồn tại trong DOM lúc còn ở Bước 0, biến mất ngay khi
  `chonChuyen` thay hẳn nội dung `#chuyen-info-wrap`). `capNhatNutTimChuyen()` bật/tắt `disabled` —
  chỉ bấm được khi ĐÃ chọn đủ tuyến + đủ ngày cần (đi luôn cần; về chỉ cần thêm nếu `khuHoi=true`).
- **Lịch cuộn dọc liên tục, KHÔNG còn `baseMonthOffset`/nút `‹`/`›`** — `soThangCanVe()`
  (`dat-ve.html`) tính số tháng cần vẽ = đủ phủ hết khoảng `lichList` server trả (từ tháng hôm nay
  tới tháng của ngày cuối cùng trong `lichList`), KHÔNG hardcode, chặn an toàn ở 8 tháng (phòng dữ
  liệu server bất thường, không phải giới hạn nghiệp vụ — `SO_NGAY_MO_BAN_TRUOC=45` ở
  `api/cong-khai-lich-chay.js` KHÔNG đổi). `renderLichThang()` vẽ TOÀN BỘ khối tháng xếp dọc trong
  `#lich-thang-wrap` (bên trong `.np-lich-scroll` của popup), người dùng cuộn trang bình thường để
  xem tháng sau — không phải scroll container lồng riêng, không phân trang. `.lich-tuan-header`
  (weekday T2..CN) đứng CỐ ĐỊNH 1 lần ở đầu popup (`renderNgayPickerContent`), KHÔNG lặp lại mỗi
  khối tháng như bản cũ — `renderThangBlock({y,m})` giờ chỉ vẽ đúng 1 khối (header "Tháng M/Y" + lưới
  ngày), không tự vẽ weekday header riêng nữa.
- **Toggle Khứ hồi** (`khuHoi`, mặc định `false`) — hiện ở 2 nơi: hàng tóm tắt ngoài trang
  (`.kh-switch`, `renderNgayChonRow`) và header popup (`.ddp-switch`, `renderNgayPickerContent`),
  cùng gọi `onToggleKhuHoi()` — bật/tắt `khuHoi`, tắt thì xoá `ngayVeChon` (giữ nguyên `ngayDiChon`),
  vẽ lại cả hàng tóm tắt lẫn popup (nếu đang mở).
- **State chọn ngày: `ngayDiChon`/`ngayVeChon` (chuỗi `'YYYY-MM-DD'` hoặc `null`) thay `ngayDangChonTam`
  đơn của bản cũ.** `chonNgay(entry)` (dòng ~1172) là state machine date-range-picker:
  - `khuHoi=false`: tap 1 lần set `ngayDiChon`, xong (hành vi cũ y hệt bản đơn-chiều).
  - `khuHoi=true`, chưa có `ngayDiChon`: tap set `ngayDiChon`.
  - Có `ngayDiChon`, chưa có `ngayVeChon`: tap ngày ≤ `ngayDiChon` → đổi `ngayDiChon`; tap ngày sau
    → set `ngayVeChon` (`pushBackGuard()` — xem bullet Back bên dưới).
  - **Cả 2 đã chọn (range đầy đủ)**: tap ngày TIẾP THEO (bất kể trước hay sau `ngayDiChon` hiện
    tại) **LUÔN khởi động lại lựa chọn** — `ngayDiChon` = ngày vừa tap, `ngayVeChon = null`, đối
    xứng cả 2 chiều tăng/giảm.
    - **⚠️ Sửa bug 2026-09-23 (báo cáo thật từ owner kèm ảnh chụp máy Android, cùng ngày với lúc
      viết section này)** — bản gốc của commit `5920c4c` chỉ có nhánh `ngay <= ngayDiChon` (đổi
      `ngayDiChon` + xoá `ngayVeChon`) và nhánh `else` (LUÔN gán `ngayVeChon = ngay`) — nghĩa là
      khi cả 2 đã chọn, tap bất kỳ ngày SAU `ngayDiChon` nào (kể cả sau cả `ngayVeChon`, ví dụ
      muốn đổi ngày đi 24/9 thành 26/9) luôn bị gán NHẦM thành ngày về, không có cách nào TĂNG ngày
      đi lên được — chỉ giảm được. Đã gộp 2 nhánh cuối thành 1 (luôn reset về ngày vừa tap), commit
      `ca11cfa`. **Chưa test lại bằng thiết bị thật sau fix** — mới verify bằng syntax-check
      (`node -e new Function(...)`) + `curl` xác nhận production đã lên đúng code mới.
  - Vẽ lại NỘI DUNG POPUP mỗi lần tap (`renderNgayPickerContent()`) — hàng tóm tắt/khối tuyến/nút
    "Xác nhận" ngoài trang chỉ làm mới lúc ĐÓNG popup (`dongNgayPicker`), không phải mỗi lần tap.
- **Tô màu ô lịch cho range** — điểm đầu/cuối (`ngayStr === ngayDiChon` hoặc `=== ngayVeChon` khi
  `khuHoi`) dùng class `.dang-chon` (tái dùng có sẵn từ bản đơn-chiều, nền cam đặc `#fb8c00` + icon
  `✓`, KHÔNG đổi tên vì đã gắn với nhiều chỗ khác trong file); các ngày Ở GIỮA range (`ngayDiChon <
  ngayStr < ngayVeChon`) dùng class MỚI `.trong-khoang` (nền vàng nhạt `#fff3cd`) — chỉ có ý nghĩa
  khi `khuHoi=true` và cả 2 đầu đã chọn. Mùng 1/15 âm lịch tô đỏ (`.am-dac-biet`, đặt TRƯỚC
  `.dang-chon` trong CSS để nhường ưu tiên trắng khi trùng cùng lúc là ngày đang chọn); hôm nay tô
  số dương lịch xanh (`.hom-nay`, cùng lý do thứ tự CSS). **Chưa đối chiếu tay với lịch âm thật ở
  mốc ngày cụ thể nào** — chỉ dựa vào `convertSolar2Lunar` đã dùng ổn định ở nơi khác trong app
  (`formatDate` ở `shared.js`), chưa verify riêng cho tính năng này.
- **Đặt khứ hồi = 2 lượt đặt độc lập nối tiếp trong CÙNG 1 phiên UI, KHÔNG thêm bảng/cột DB liên
  kết 2 vé** — `xacNhanChonChieu()` (bấm nút "Xác nhận" ngoài trang HOẶC trong popup) build
  `dsChangDat` (mảng JS thuần, module-level, biến mất khi rời trang): 1 phần tử nếu đơn chiều, 2
  phần tử nếu khứ hồi (`vaiTro: 'di'|'ve'`, route chặng về ĐẢO NGƯỢC tự động theo cặp tỉnh của
  chặng đi — `tinhXuatPhat`/`tinhDiemDen` hoán đổi, `chieuVe = chieuDi === 'bac' ? 'nam' : 'bac'` —
  khách KHÔNG phải chọn lại route cho chiều về). `batDauChang(idx)` gán lại
  `noiXuatPhatTinh`/`diemDenTinh`/`noiXuatPhatDiaDiem`/`diemDenDiaDiem` theo đúng chặng rồi gọi
  THẲNG `chonChuyen()` hiện có (không đổi gì ở `chonChuyen`/sơ đồ giường/form liên hệ/OTP). Đặt
  xong 1 giường của chặng ĐI (trong handler `#btn-dat-ve`) mà còn chặng kế tiếp
  (`changHienTaiIdx < dsChangDat.length - 1`) → tự động ẩn sơ đồ + form, tăng `changHienTaiIdx`,
  gọi lại `batDauChang()` cho chặng về — **tên/SĐT/trạng thái xác thực OTP (`sdtDaXacThucOtp`) GIỮ
  NGUYÊN giữa 2 chặng** (không xoá `#f-ten`/`#f-sdt`), vì cùng 1 SĐT vẫn còn hiệu lực xác thực
  (server tự kiểm tra lại trong 30 phút gần nhất, xem `api/cong-khai-dat-ve.js`), khách không phải
  xác thực lại OTP lần 2. **Kết quả 2 lượt tra thành `ve` gắn 2 `chuyen_id` khác nhau, hoàn toàn
  độc lập ở tầng DB** — đã xác nhận qua `list_migrations` (Supabase): không có migration nào mới
  cho tính năng này (migration gần nhất trước "v5" là `ve_dia_diem_len_xuong_nhan`, 2026-09-22).
  **Chưa có test SQL/Playwright thật nào xác nhận 1 lượt đặt khứ hồi ra đúng 2 dòng `ve`/2
  `chuyen_id`** — chỉ đọc code xác nhận logic, chưa chạy thử.
- **Màn xác nhận cuối gộp CẢ 2 chặng, không hiện riêng từng chặng** — `ketQuaCacChang` (mảng string
  tóm tắt, module-level) được push thêm 1 dòng sau MỖI chặng đặt thành công (nhãn `"Chiều đi — ..."`/
  `"Chiều về — ..."` nếu khứ hồi), chỉ hiện `#xac-nhan-box` sau khi chặng CUỐI xong — nối các dòng
  bằng `<div>` (không phải `<p>`, vì lồng `<div>` trong `<p>` là HTML không hợp lệ, trình duyệt tự
  đóng thẻ `<p>` sớm).
- **Banner "🔁 Chặng X/2 — Chiều đi/về"** (`renderChuyenDaChonBar`, class `.chang-label`) — chỉ hiện
  khi `dsChangDat.length > 1`, cho khách biết đang ở đúng lượt nào giữa 2 lượt đặt liên tiếp.
- **Guard Back Android/trình duyệt — mở rộng thêm 1 case so với bản gốc (đợt 7, xem mục "Luồng 4
  bước" phía trên để biết cơ chế `pushBackGuard`/`backGuardPushed` gốc, KHÔNG đổi)** — `chonNgay()`
  gọi thêm `pushBackGuard()` ngay khi `ngayVeChon` VỪA ĐƯỢC SET (hoàn thành range), tái dùng ĐÚNG 1
  guard entry có sẵn (không push chồng thêm mỗi lần tap). `popstate` handler (dòng ~1541) giờ có 2
  nhánh: đã confirm xong (`currentChuyen` khác `null`) → `doiChuyenKhac()` như cũ; còn ở Bước 0,
  khứ hồi ON và ĐÃ có `ngayVeChon` → Back lùi ĐÚNG 1 nấc của state machine (xoá `ngayVeChon`, KHÔNG
  thoát hẳn lịch), vẽ lại popup (nếu đang mở)/hàng tóm tắt/khối tuyến, rồi `pushBackGuard()` lại để
  lần Back kế tiếp vẫn bị chặn đúng cách. **Chưa test bằng thiết bị thật/gesture Android** — chỉ
  đọc code xác nhận logic không có lỗi tham chiếu rõ ràng (có guard `document.getElementById(...)
  .classList.contains('open')` trước khi vẽ lại popup, phòng trường hợp popup đã đóng từ trước lúc
  bấm Back thật).
- **`doiChuyenKhac()` reset thêm `dsChangDat`/`changHienTaiIdx`/`ketQuaCacChang`** (ngoài các state
  cũ đã reset từ trước — `currentChuyen`/`ngayDiChon`/`selectedGiuongMap`/`soDoData`) — đóng luôn
  popup `#ngay-picker` nếu đang mở. KHÔNG đụng `noiXuatPhatTinh`/`diemDenTinh`/2 biến địa điểm —
  giữ đúng hành vi đã có từ đợt 16 (2 biến tỉnh độc lập với việc chọn ngày).
- **Trạng thái test tổng thể tính năng này (2026-09-23, ghi lại sau khi bị hỏi thẳng và không tìm
  ra bằng chứng nào)**: KHÔNG có Playwright test nào chạy qua, KHÔNG có SQL nào xác nhận 2
  vé/2 chuyến sau 1 lượt đặt khứ hồi thật, KHÔNG có đối chiếu âm lịch tay, KHÔNG có test Back
  Android trên thiết bị thật. Chỉ có: syntax-check `node -e new Function(...)` cho các khối
  `<script>` (không lỗi cú pháp), và `curl` xác nhận production (`eakar-booking.vercel.app`) đang
  chạy đúng code mới nhất sau mỗi lần deploy. **Trước khi tin tưởng tính năng này hoạt động đúng
  trong sản xuất thật, cần chạy ít nhất**: 1 lượt đặt khứ hồi thật qua UI + query `ve`/`chuyen` xác
  nhận đúng 2 dòng độc lập; test tap-range trên thiết bị Android thật (không chỉ đọc code); test
  Back Android/gesture giữa lúc đang chọn range.
- **Deploy** — commit gốc tính năng: `5920c4c` ("v5"). Fix bug tap-range: `ca11cfa`. Cả 2 đã deploy
  production qua `vercel --prod --scope minhwhoa-makers-projects` (session viết code KHÔNG có git
  credentials để `git push` — lỗi `fatal: could not read Username for 'https://github.com'` — nên
  deploy trực tiếp không qua GitHub, đúng cách CLAUDE.md mục Commands đã ghi). **Kiểm tra lại
  `git status`/`git log origin/main` trước khi tiếp tục sửa file này** — có khả năng repo local đi
  trước `origin/main` (commit chưa được push từ máy có credentials), dễ bị đè mất nếu deploy từ máy
  khác mà không pull trước.

### Bảng giá theo tỉnh (2026-09-19, đợt 12)

`tinh_tuyen` thêm cột `gia_moc numeric` (nullable, đơn vị **đồng thật**, giống `ve.gia`/
`kien.tien_thu` — UI luôn nhập/hiện theo nghìn đồng, × 1000 lúc lưu, ÷ 1000 lúc hiện) — **mốc giá**
riêng từng tỉnh, KHÔNG phải bảng giá 2 chiều/cặp tỉnh riêng. **Giá vé = `|gia_moc(tỉnh đến) −
gia_moc(tỉnh đi)|`** — chỉ phụ thuộc CẶP TỈNH đã chọn ở Bước 0 của `dat-ve.html`, không phụ thuộc
`diem_khach` cụ thể trong tỉnh. `null` ở 1 trong 2 tỉnh → "chưa định giá", không chặn đặt vé.

- **Seed ban đầu (owner cung cấp trực tiếp bằng SQL, không qua modal)**: `DLK=0` (gốc),
  `DNG,TTH=550000`, `QTR,QBH=600000`, `HTI,NAN=700000`, `THA,NBH,HNI,HYN,HDG=800000`. **5 tỉnh còn
  lại (KHH, PYN, BDN, QNG, QNM) vẫn `null`** — chưa được owner cho giá, coi như "chưa định giá" cho
  tới khi crew tự nhập qua modal `khach.html` (KHH bị loại khỏi Bước 0 `dat-ve.html` nên thực chất
  không cần giá — 4 tỉnh còn lại PYN/BDN/QNG/QNM chọn được nhưng sẽ luôn hiện "Giá: liên hệ sau" cho
  tới khi có giá).
- **`api/cong-khai-diem-khach.js`** — `.select(...)` của `tinh_tuyen` (response đã có sẵn, dùng cho
  dropdown/picker tỉnh ở `dat-ve.html`) thêm cột `gia_moc`, KHÔNG cần API mới.
- **`dat-ve.html`**: `tinhGiaVe()` đọc `noiXuatPhatTinh.gia_moc`/`diemDenTinh.gia_moc` (đã có sẵn
  trong `tinhList` fetch từ trên, không fetch thêm) — trả `null` nếu thiếu 1 trong 2, ngược lại
  `Math.abs(a - b)`. **Thanh `#gia-ve-bar` cố định đáy màn hình** (`position: fixed; bottom: 0`,
  kiểu Vexere "Đã chọn N chỗ · Tổng: Xđ") — CHỈ hiện khi `selectedGiuongMap.size > 0`, nội dung
  `"Đã chọn N giường · Tổng: {N × giá vé}"` hoặc `"Đã chọn N giường · Giá: liên hệ sau"` nếu `null`.
  **Nút "Tiếp tục" trên thanh (đợt 13, 2026-09-19, theo yêu cầu — đổi ngay sau đợt 12 cùng ngày,
  owner muốn giống đúng luồng Vexere: chọn ghế → bấm Tiếp tục → mới điền thông tin)** — trước đó
  chọn giường XONG là TỰ ĐỘNG hiện `.dat-ve-form` ngay (`capNhatFormChonGiuong` tự set
  `display:block` + cuộn xuống); giờ chọn/bỏ giường CHỈ cập nhật dòng "Giường đã chọn" và số tiền
  trên bar, KHÔNG tự hiện form nữa — `moFormLienHe()` (gọi từ `#btn-gia-ve-tiep-tuc`) là đường DUY
  NHẤT set `display:block` + `scrollIntoView`. Bỏ chọn hết giường vẫn tự ẩn form như cũ (giữ nguyên
  ở `capNhatFormChonGiuong`, chỉ bỏ nhánh TỰ HIỆN). `#gia-ve-bar` đổi cấu trúc: 2 con `#gia-ve-bar-
  text` (nội dung) + `#btn-gia-ve-tiep-tuc` (nút trắng nổi trên nền xanh `--primary` của bar), toggle
  hiện/ẩn qua class `.hien` (`display:flex`) thay vì gán trực tiếp `style.display` như trước — do
  bar giờ là flex-row 2 phần tử, không còn 1 khối text đơn. Cập nhật qua `capNhatGiaVeBar()`, gọi ở mọi điểm đổi `selectedGiuongMap` (
  `toggleChonGiuong`, cả 2 nhánh kết quả đặt vé, `doiChuyenKhac`, đầu `chonChuyen`) và mọi điểm đổi
  tỉnh ở Bước 0 (`#route-swap-btn`, chọn tỉnh trong `#dia-diem-picker`) — dù về lý thuyết tỉnh chỉ
  đổi được TRƯỚC khi có giường nào được chọn (Bước 0 tự thu gọn sau khi confirm) nên 2 nhóm gọi này
  hiếm khi cùng ảnh hưởng 1 lượt, vẫn gọi đủ cả 2 cho đúng tinh thần "luôn đồng bộ với state mới
  nhất", tránh phải nhớ lại chỗ nào cần gọi nếu sau này đổi luồng.
  `body.co-gia-ve-bar { padding-bottom: 92px }` toggle theo cùng lúc với bar — tránh bar (fixed)
  đè lên nút "Đặt vé" khi cuộn hết trang.
- **`api/cong-khai-dat-ve.js` — SERVER TỰ TÍNH LẠI GIÁ, KHÔNG TIN GIÁ CLIENT GỬI LÊN** — nhận thêm
  `tinh_len_ma`/`tinh_xuong_ma` (mã tỉnh, KHÔNG PHẢI `diem_len_id`/`diem_xuong_id` — 2 field đó chỉ
  là điểm cụ thể, có thể `null`, không đủ suy ra tỉnh nếu tỉnh đó chưa có `diem_khach`), tự query
  `tinh_tuyen.gia_moc` của 2 mã này rồi `Math.abs(diff)`, ghi thẳng vào `ve.gia` — **route KHÔNG còn
  nhận `gia` từ body nữa** (đã bỏ hẳn tham số này, trước đó `dat-ve.html` luôn gửi `gia: null`).
  Lý do: giá tính ở client có thể bị sửa qua DevTools trước khi gửi request, không tin dữ liệu tiền
  từ phía client — cùng nguyên tắc "không tin client" đã áp dụng cho các route công khai khác.
- **`khach.html` — modal "💰 Giá vé theo tỉnh"** (`#gia-tinh-modal`, nút mở `#btn-gia-tinh-mo` ngay
  dưới banner "💺 N/44 khách") — list 17 tỉnh (loại Khánh Hòa, sort `thu_tu`, cùng filter đã dùng ở
  `hang.html`'s `loadTinh()`), mỗi dòng 1 ô nhập giá theo nghìn đồng + chữ đọc số (`soTienBangChu`,
  cùng convention `ve.gia`/`kien.tien_thu`), prefill giá hiện có. **1 nút "💾 Lưu bảng giá" duy nhất**
  — `giaTinhOriginal` (Map, chụp lúc MỞ modal) dùng so sánh, CHỈ `UPDATE tinh_tuyen SET gia_moc=...
  WHERE ma=...` cho dòng thật sự đổi giá trị, không ghi lại cả 17 dòng mỗi lần bấm Lưu. KHÔNG dùng
  `confirmDialog()` — đây là chỉnh cấu hình, không phải hành động phá huỷ (khác "Kết thúc chuyến"/
  "Hủy đơn"). `loadTinhList()` (đã có sẵn, dùng cho dropdown chọn tỉnh khi thêm `diem_khach`) thêm
  cột `gia_moc` vào `.select(...)`.

### Multi-tenant — nhiều nhà xe dùng chung 1 hệ thống (2026-09-19, đang triển khai theo giai đoạn)

**Spec B, làm TUẦN TỰ theo yêu cầu owner — KHÔNG đổ hết 1 lần.** Trạng thái hiện tại: **xong Giai
đoạn 1-5** (4 trang crew nội bộ đã đọc/ghi `nha_xe_id` tường minh, RLS theo tenant đã verify bằng
SQL simulation; `api/cong-khai-*.js` + `dat-ve.html` giờ resolve nhà xe từ `?nx=<slug>`, không còn
hardcode `'eakar'` — xem mục "Multi-tenant Giai đoạn 5" bên dưới) — CHƯA `DROP DEFAULT` (chờ owner
xác nhận dùng thử ổn sau khi deploy, xem cuối Giai đoạn 4). Giai đoạn 6 (checklist onboard nhà xe
mới, UI superadmin) **CHƯA LÀM**.

**Quyết định kiến trúc đã chốt** (không tự đổi khi làm các giai đoạn sau):
1. Tách `tinh_tuyen` (bảng cũ, đơn-tenant) → `tinh` (mã/tên tỉnh, dùng chung mọi nhà xe) +
   `tuyen_tinh` (tuyến/thứ tự/giá, RIÊNG từng `nha_xe_id`). `tinh_tuyen` **GIỮ NGUYÊN, KHÔNG xoá**
   cho tới khi xác nhận mọi query đã chuyển hết sang bảng mới — xoá sớm mà sót 1 chỗ là crash âm
   thầm.
2. `nha_xe_id` ghi TRỰC TIẾP (denormalize) vào `kien`/`ve` (không chỉ suy qua join `chuyen_id`) —
   đơn giản hoá RLS, đổi lại tốn 1 cột trùng lặp mỗi dòng, chấp nhận được.
3. `dat_ve_otp` GIỮ GLOBAL, không gắn `nha_xe_id` — xác thực SĐT là chuyện của số điện thoại, khách
   xác thực xong đặt được vé nhà xe khác trong cùng 30 phút không cần OTP lại.
4. Zalo OA dùng CHUNG 1 tài khoản mọi nhà xe (không phải mỗi nhà xe 1 OA riêng).
5. Routing nhà xe qua query param `?nx=<slug>` (không phải path/subdomain riêng) — khớp kiểu
   static-hosting hiện có.
6. Có vai trò "superadmin" (chủ hệ thống) nhìn xuyên suốt mọi nhà xe để support.

**Giai đoạn 1 (2026-09-19) — ĐÃ XONG**, migration `multitenant_giai_doan_1_schema_nen_tang`:
- `tinh` (ma PK, ten, ten_moi) — copy từ `tinh_tuyen`.
- `nha_xe` (id, ten, slug unique, trang_thai `'hoat_dong'|'tam_dung'`).
- `tuyen_tinh` (id, nha_xe_id FK, tinh_ma FK → `tinh`, thu_tu, gia_moc — unique theo
  `(nha_xe_id, tinh_ma)` và `(nha_xe_id, thu_tu)`).
- `nguoi_dung_nha_xe` (user_id FK `auth.users`, nha_xe_id FK, vai_tro `'crew'|'admin'`, PK kép).
- **`app_superadmin` (user_id PK, FK `auth.users`) — bảng phụ THAY VÌ `alter table auth.users add
  column is_superadmin` như spec gốc đề xuất** — schema `auth` do Supabase quản lý, đụng trực tiếp
  vào đó rủi ro hơn khi Supabase nâng cấp/migrate auth về sau (tra `supabase-postgres-best-practices`
  skill trước khi quyết định, không tự đoán). Chưa có ai được thêm vào bảng này — chưa cần superadmin
  thật cho tới khi có ≥2 nhà xe.
- **Seed**: `nha_xe` đầu tiên `('EA KAR Logistics', 'eakar')`, copy 18 dòng `tinh_tuyen` sang
  `tuyen_tinh` gắn `nha_xe_id` đó, gán TOÀN BỘ `auth.users` hiện có (lúc seed chỉ có 1 user — owner)
  làm `admin` của nhà xe này qua `nguoi_dung_nha_xe`. Đã verify: `nha_xe` có đúng 18 dòng
  `tuyen_tinh` + 1 dòng `nguoi_dung_nha_xe`.
**Giai đoạn 2 (2026-09-19) — ĐÃ XONG**, migration `multitenant_giai_doan_2_nha_xe_id_nghiep_vu`:
- Thêm cột `nha_xe_id uuid references nha_xe(id)` vào `diem`/`chuyen`/`kien`/`giuong`/
  `diem_khach`/`ve`, backfill toàn bộ dòng hiện có = nhà xe "eakar", index từng cột.
- **Rủi ro thật phát hiện lúc review spec (owner chỉ ra, không phải Claude Code tự thấy)**: nếu set
  `NOT NULL` ngay sau backfill mà CHƯA deploy code Giai đoạn 4 (5 trang crew tự truyền
  `nha_xe_id`), mọi insert `kien`/`ve` MỚI từ app đang chạy thật (crew nhập kiện/đặt vé hàng ngày)
  sẽ lỗi giữa chừng ngay lập tức — không phải lý thuyết, vì code hiện tại hoàn toàn không biết cột
  này tồn tại. **Sửa bằng cách đặt `DEFAULT` = nhà xe "eakar" TRƯỚC khi set `NOT NULL`** cho cả 6
  cột — code cũ insert thiếu `nha_xe_id` vẫn tự điền đúng, không vỡ.
- **⚠️ VIỆC BẮT BUỘC Ở GIAI ĐOẠN 4, KHÔNG ĐƯỢC QUÊN**: sau khi 5 trang crew đã tự truyền
  `nha_xe_id` tường minh và deploy xong, phải `ALTER COLUMN nha_xe_id DROP DEFAULT` cho cả 6 cột
  (`diem`/`chuyen`/`kien`/`giuong`/`diem_khach`/`ve`). Để quên default này thì sau này có nhà xe
  thứ 2, 1 chỗ code nào đó lỡ quên gắn `nha_xe_id` (bug thường, không cố ý) sẽ ÂM THẦM rơi vào
  default = "eakar" thay vì báo lỗi rõ ràng — đúng dạng lỗi nguy hiểm nhất của multi-tenant (rò data
  chéo giữa nhà xe, phát hiện muộn, có thể sau nhiều ngày).
- `diem.tinh_ma` đổi FK từ `tinh_tuyen(ma)` sang `tinh(ma)` (constraint `diem_tinh_ma_fkey` drop +
  tạo lại) — an toàn vì `tinh` đã copy đủ 18 mã từ `tinh_tuyen` ở Giai đoạn 1, không cần backfill
  dữ liệu `diem` nào.
- Đã verify: cả 6 bảng `nha_xe_id` NOT NULL + có DEFAULT đúng UUID nhà xe "eakar", 0 dòng null,
  FK `diem.tinh_ma` đã trỏ `tinh` không phải `tinh_tuyen`.
- Đã có ở Giai đoạn 2, KHÔNG lặp lại ở Giai đoạn 3: 5 trang crew + `api/cong-khai-*.js` vẫn CHƯA
  đọc/ghi `nha_xe_id` tường minh (đang sống nhờ `DEFAULT` tạm thời) — xem "Chưa làm" cuối Giai đoạn
  3 bên dưới.

**Giai đoạn 3 (2026-09-19) — ĐÃ XONG**, migration `multitenant_giai_doan_3_rls_theo_tenant`:
- **`private.co_quyen_nha_xe(target_nha_xe_id uuid) returns boolean`** — hàm `SECURITY DEFINER`
  DUY NHẤT trong schema mới `private`, dùng chung cho MỌI policy thay vì lặp lại
  `exists(select ... where user_id = auth.uid())` ở từng bảng (khuyến nghị
  `supabase-postgres-best-practices` skill — nhanh hơn + dễ bảo trì hơn). Trả `true` nếu user hiện
  tại (`(select auth.uid())`, wrap trong `select` để Postgres cache thay vì gọi lại mỗi dòng) là
  thành viên `nguoi_dung_nha_xe` của `target_nha_xe_id`, HOẶC có mặt trong `app_superadmin`.
  **`revoke execute ... from public, anon` nhưng GIỮ `grant ... to authenticated`** — đã tra kỹ
  trước khi áp dụng: hàm được GỌI BÊN TRONG policy lúc role `authenticated` đang chạy query, nên
  role đó BẮT BUỘC cần quyền `EXECUTE` để Postgres evaluate được policy; revoke luôn cả
  `authenticated` (như 1 ví dụ chung chung trong skill viết) sẽ khiến MỌI query của app lỗi
  "permission denied" ngay lập tức — đã KHÔNG làm theo y nguyên ví dụ đó sau khi kiểm tra lại.
- **6 bảng nghiệp vụ** (`diem`/`chuyen`/`kien`/`diem_khach`/`ve`: policy `for all`; `giuong`: chỉ
  `for select`, giữ nguyên ý nghĩa cũ vì client chưa từng ghi bảng này) — xoá policy allow-all cũ
  (`*_all`/`giuong_read`), thay bằng `using/with check ((select private.co_quyen_nha_xe(nha_xe_id)))`.
- **`tuyen_tinh`** (bảng mới từ Giai đoạn 1, CHƯA có policy nào trước đó) — bật RLS + scope theo
  tenant NGAY TỪ ĐẦU, dù code chưa đụng vào bảng này (Giai đoạn 4/5 mới chuyển sang dùng) — không
  để hở khoảng trống nào dù tạm thời chưa ai query.
- **`tinh`** — SELECT-only cho `authenticated`, `using(true)` — dữ liệu tỉnh dùng CHUNG mọi nhà xe
  (mã/tên hành chính thật), không nhạy cảm theo tenant, giống `tinh_tuyen` cũ.
- **`nha_xe`** — **QUYẾT ĐỊNH CHẶT HƠN spec gốc** (spec chỉ ghi "cân nhắc nếu sau này nhiều khách
  thấy tên nhau", chưa chốt hẳn) — chọn ngay phương án an toàn: SELECT chỉ thấy nhà xe MÌNH thuộc
  về (qua `private.co_quyen_nha_xe(id)`) hoặc superadmin thấy hết, KHÔNG mở toang cho mọi
  `authenticated` thấy tên/slug mọi nhà xe khác — tránh phải vá lại sau. Không ảnh hưởng hành vi
  hiện tại vì code app CHƯA query bảng này.
- **`nguoi_dung_nha_xe`** — SELECT chỉ dòng CỦA CHÍNH MÌNH (`user_id = (select auth.uid())`) hoặc
  superadmin. KHÔNG có policy ghi (INSERT/UPDATE/DELETE) — chỉ gán/đổi thành viên qua
  `SUPABASE_SERVICE_KEY` (đúng luồng "onboard tay qua SQL" của Giai đoạn 6).
- **`app_superadmin`** — bật RLS, **KHÔNG tạo policy nào** — khoá hoàn toàn với `authenticated`/
  `anon`, chỉ `SUPABASE_SERVICE_KEY` (bypass RLS) đọc/ghi được. Bảng nhạy cảm nhất (ai xem xuyên
  được mọi nhà xe), cố ý không expose dù chỉ để user tự-check qua client.
- **Đã verify BẮT BUỘC theo spec** (không được bỏ qua) — simulate 2 "nhà xe" bằng SQL
  (`set local role authenticated` + `set_config('request.jwt.claims', ...)` giả lập đúng user thật
  đang có), tạo tạm 1 nhà xe test + 1 `kien` test trong đó:
  1. User (thành viên "eakar") đọc `kien` của "eakar" → thấy đủ 71 dòng — đúng.
  2. User đó đọc `kien` của nhà xe test khác → **0 dòng** — RLS chặn đúng.
  3. User đó `UPDATE` thẳng vào `kien` của nhà xe test khác → **0 dòng bị đổi** (verify lại bằng
     query khác, `trang_thai` vẫn nguyên `chua_giao`) — RLS chặn cả ghi, không chỉ đọc.
  Đã xoá sạch data test (`nha_xe`/`chuyen`/`diem`/`kien` test) sau khi verify xong.
- **Lỗ hổng bảo mật THẬT phát hiện tình cờ lúc chạy Supabase security advisor để soát lại (không
  liên quan multi-tenant, sót lại từ session OTP trước)** — bảng `dat_ve_otp` (chứa mã OTP 6 số)
  được tạo mà **QUÊN BẬT RLS** — advisor báo `ERROR` (`rls_disabled_in_public`), nghĩa là bất kỳ ai
  cầm `SUPABASE_ANON_KEY` (public, nằm sẵn trong `shared.js`, không phải bí mật) đều có thể gọi
  thẳng PostgREST đọc được mọi mã OTP đang hiệu lực, VÔ HIỆU HOÁ hoàn toàn tác dụng chống spam của
  tính năng OTP. Sửa ngay (migration `fix_dat_ve_otp_rls_missing`): bật RLS, không tạo policy —
  cùng pattern `app_superadmin`, chỉ `SUPABASE_SERVICE_KEY` (đang dùng trong
  `api/cong-khai-gui-otp.js`/`api/cong-khai-xac-thuc-otp.js`) đọc/ghi được. Đã chạy lại advisor xác
  nhận hết lỗi `ERROR`, chỉ còn 2 `INFO` có chủ đích (`app_superadmin`/`dat_ve_otp` "RLS bật nhưng
  không có policy") + 2 `WARN` không liên quan (search_path của 2 function có từ trước
  `bump_diem_count`/`chuyen_ngay_vn`, và cài đặt "Leaked Password Protection" chưa bật ở tầng Auth
  — ngoài phạm vi việc đang làm, chưa sửa).
- **Chưa làm ở lúc đó** — đã xong ở Giai đoạn 4 bên dưới.

**Giai đoạn 4, phần A (2026-09-19) — 4 lỗ hổng schema THẬT phát hiện lúc review trước khi sửa
code, migration `multitenant_giai_doan_4a_fix_unique_constraint_global`** — Giai đoạn 1-3 chỉ thêm
`nha_xe_id`/RLS nhưng CHƯA soát lại các UNIQUE constraint có sẵn, trong khi 1 số constraint đó vẫn
ở PHẠM VI TOÀN HỆ THỐNG (global) — sẽ va chạm SAI ngay khi có nhà xe thứ 2 thật:
1. `diem`: `UNIQUE(tinh_ma, ten_norm)` → `UNIQUE(nha_xe_id, tinh_ma, ten_norm)` — trước đó 2 nhà xe
   KHÔNG tạo được điểm cùng tên trong cùng 1 tỉnh (vd cả 2 đều muốn có "Bến xe trung tâm" ở Hà Nội)
   dù chẳng liên quan gì tới nhau, DB sẽ báo trùng oan.
2. `chuyen`: `uq_chuyen_ngay_chieu (chuyen_ngay_vn(khoi_hanh), chieu)` → thêm `nha_xe_id` vào đầu
   index — trước đó 2 nhà xe KHÔNG chạy được cùng ngày/cùng chiều, nhà xe B sẽ bị chặn tạo chuyến vì
   tưởng nhầm là "trùng" chuyến của nhà xe A. Đây là lỗi NGHIÊM TRỌNG NHẤT trong 4 lỗi — vỡ hẳn tính
   năng lịch chạy cố định (`api/cong-khai-lich-chay.js`) cho bất kỳ nhà xe thứ 2 nào.
3. `giuong`: `UNIQUE(ma)` → `UNIQUE(nha_xe_id, ma)` — mỗi nhà xe tự đánh `T1-01..T1-22`/`T2-01..
   T2-22` riêng cho sơ đồ giường của mình, không được đụng độ mã giữa các nhà xe.
4. `diem_khach.tinh_ma` — SÓT lại từ Giai đoạn 2 (lúc đó chỉ đổi FK của `diem` sang `tinh(ma)`, quên
   đổi `diem_khach`) — vẫn tham chiếu `tinh_tuyen(ma)`. Đổi sang `tinh(ma)` cho nhất quán.
- `uq_ve_giuong_active (chuyen_id, giuong_id)` trên `ve` **KHÔNG cần sửa** — `chuyen_id` tự thân đã
  tenant-scoped (1 chuyến chỉ thuộc đúng 1 nhà xe), không có rủi ro đụng độ chéo.

**Giai đoạn 4, phần B (2026-09-19) — sửa 5 trang crew đọc/ghi `nha_xe_id` tường minh:**
- **`shared.js`**: thêm `resolveNhaXeId(sb, userId)` — tra `nguoi_dung_nha_xe`, trả `nha_xe_id` ĐẦU
  TIÊN nếu user thuộc nhiều nhà xe (TODO chưa làm, hiếm gặp: chưa có UI chọn giữa các nhà xe), `null`
  nếu user chưa được gán nhà xe nào (lỗi cấu hình).
- **4 trang** `hang.html`/`manifest-hang.html`/`khach.html`/`lich-su-chuyen.html` (KHÔNG phải
  `login.html`/`auth-callback.html` — 2 trang đó chưa có session để tra `nha_xe_id`): mỗi trang có
  biến module-level `currentNhaXeId`, gán ngay sau `requireSession()` trong `initPage()`; `null` →
  `showToast(...)` báo lỗi cấu hình rồi DỪNG (không load tiếp gì khác) — CHẶN HẲN trang thay vì để
  crash mù mờ ở các query sau. Mọi query SELECT tới `chuyen`/`giuong`/`diem_khach` (bảng KHÔNG có
  điều kiện lọc nào khác sẵn có) thêm `.eq('nha_xe_id', currentNhaXeId)`. Query tới `kien`/`ve` (đã
  lọc theo `chuyen_id`/`diem_id`) và mọi `UPDATE ... WHERE id = ...` **KHÔNG cần sửa thêm** — đã
  tenant-scoped gián tiếp qua FK, RLS tự chặn phần còn lại (defense in depth đã đủ ở tầng DB).
- **`loadTinh()`/`loadTinhList()`** (`hang.html`/`khach.html`/`manifest-hang.html`'s `loadManifest`)
  — đổi từ đọc `tinh_tuyen` (bảng cũ, đơn-tenant) sang `tuyen_tinh.select('tinh_ma, thu_tu, gia_moc,
  tinh:tinh_ma(ma, ten)').eq('nha_xe_id', currentNhaXeId)` rồi `.map()` lại thành shape cũ
  `{ma, ten, thu_tu, gia_moc}` — giữ nguyên hết logic phía sau (filter Đắk Lắk/Khánh Hòa, sort theo
  chiều...), chỉ đổi nguồn dữ liệu.
- **Mọi `.insert()` vào 6 bảng nghiệp vụ đã rà lại đủ, thêm `nha_xe_id: currentNhaXeId`** (hoặc
  `rec.nha_xe_id` ở `idb-queue.js`'s `trySyncQueue` — liệt kê tên tay, không spread nguyên `rec`,
  cùng "1 loại lỗi lặp lại nhiều lần" đã ghi chú ở mục AI/OCR, dễ quên field mới): `chuyen`/`diem`
  (`hang.html`), `kien` (offline queue `hang.html`→`idb-queue.js`, và kiện tách trong `traHang` ở
  `manifest-hang.html`), `ve`/`diem_khach` (`khach.html`). `giuong` KHÔNG có đường insert từ client
  (seed tay qua SQL, giữ nguyên).
- **Modal "💰 Giá vé theo tỉnh"** (`khach.html`) — `UPDATE` đổi từ `tinh_tuyen.gia_moc WHERE ma=...`
  sang `tuyen_tinh.gia_moc WHERE nha_xe_id=... AND tinh_ma=...` (`gia_moc` giờ RIÊNG từng nhà xe,
  không còn 1 bảng giá chung).
- **Đã verify**: syntax check qua toàn bộ script inline của 4 trang + `idb-queue.js`/`shared.js`,
  rà lại `grep` toàn bộ `.insert(` vào 6 bảng nghiệp vụ xác nhận đủ `nha_xe_id` ở cả 5 điểm insert
  trong code (không tính `giuong`).
- **CHƯA làm** (để dành, KHÔNG tự ý làm): `ALTER COLUMN ... DROP DEFAULT` cho 6 cột `nha_xe_id` (đặt
  tạm ở Giai đoạn 2) — **CHỈ chạy SAU KHI đã deploy code này lên production VÀ owner tự xác nhận
  dùng thử ổn** (tạo kiện/chuyến/vé/điểm mới bình thường không lỗi) — dropping quá sớm mà code còn
  sót 1 chỗ chưa phát hiện sẽ biến lỗi "âm thầm rơi vào default" thành lỗi "insert fail giữa chừng"
  ngay lập tức, cũng tệ không kém nếu chưa kịp verify.

**Giai đoạn 5 (2026-09-20) — ĐÃ XONG**, routing `?nx=<slug>` cho booking công khai — gỡ BLOCKER
hardcode `'eakar'` ở 4 route `api/cong-khai-*.js` (đặt tạm lúc audit Giai đoạn 4, xem
`layNhaXeIdMacDinh` ở mục "Security audit" bên dưới). **Nguyên tắc bất biến, không tự nới**:
KHÔNG có default ngầm — thiếu `nx` → 400, slug không tồn tại → 404, nhà xe `tam_dung` → 403, TUYỆT
ĐỐI không fallback về `'eakar'` (đúng dạng lỗi "âm thầm rơi vào default" đã lo ở `DROP DEFAULT`
trên). KHÔNG tin client — route dùng `SUPABASE_SERVICE_KEY` (bypass RLS), nên mọi id client gửi
lên (`chuyen_id`, `giuong_id`, `diem_len_id`, `diem_xuong_id`, `tinh_len_ma`, `tinh_xuong_ma`) phải
verify thuộc đúng `nha_xe_id` đã resolve.

- **`api/_lib/nha-xe.js`** (helper DÙNG CHUNG cho cả 4 route + route manifest — NGOẠI LỆ có chủ
  đích so với convention "không import chéo giữa route": đây là code bảo mật, copy 4-5 bản dễ lệch
  nhau và 1 bản sai là rò data chéo). File/thư mục bắt đầu bằng `_` trong `api/` không bị Vercel
  coi là 1 Serverless Function riêng — đã verify qua `vercel build`, không xuất hiện trong
  `.vercel/output/functions`, chỉ được bundle làm module thường bên trong từng function dùng nó.
  - `docNx(req)` — đọc `nx` từ query (GET) hoặc body (POST).
  - `layNhaXe(sbAdmin, nx)` — **PHẢI là việc ĐẦU TIÊN của mọi handler** (ngay sau kiểm tra method),
    trước MỌI tính toán/early-return khác — kể cả 1 nhánh trả 200 sớm hiếm gặp (vd
    `cong-khai-lich-chay.js` từng có early-return khi 0 ngày hợp lệ, đã sửa gọi `layNhaXe` trước
    nhánh đó). Validate format bằng đúng regex của constraint `nha_xe_slug_format` trước khi query
    DB, rồi tra `nha_xe` theo slug — throw lỗi có `status` + message tiếng Việt (400 thiếu/sai định
    dạng, 404 không tồn tại, 403 `tam_dung`).
  - `xacMinhThuocNhaXe(sbAdmin, bang, id, nhaXeId)` — CHỈ dùng cho lookup theo PK `id`
    (`chuyen`/`giuong`/`diem_khach`). KHÔNG dùng cho `tinh_len_ma`/`tinh_xuong_ma` (giá trị
    `tuyen_tinh.tinh_ma`, không phải `tuyen_tinh.id`) — chỗ đó tự viết query riêng (xem
    `cong-khai-dat-ve.js` bên dưới). Không phân biệt "không tồn tại" với "thuộc nhà xe khác" trong
    response (luôn 404) — tránh lộ thông tin.
- **Migration** (`nha_xe` thêm `gio_khoi_hanh_bac`/`gio_khoi_hanh_nam` `NOT NULL` không `DEFAULT`,
  seed giờ thật cho `eakar`, + constraint `nha_xe_slug_format` check định dạng slug an toàn cho
  URL) — xem mục "Env / Vercel" để biết chi tiết đổi từ ENV sang cột DB.
- **4 route công khai**: resolve `nx` đầu handler, lọc mọi query theo `nha_xe_id` đã resolve.
  `cong-khai-so-do.js` — có `chuyen_id` thì `xacMinhThuocNhaXe` TRƯỚC khi query `ve` (không verify
  trước sẽ lộ ghế trống/đã đặt của chuyến nhà xe khác). `cong-khai-lich-chay.js` — response thêm
  `nha_xe: {ten, slug}` ở MỌI nhánh 200 (kể cả nhánh 0 ngày hợp lệ). `cong-khai-dat-ve.js` — verify
  sở hữu ĐẦY ĐỦ trước khi insert: `chuyen_id` (ownership 404 + trạng thái `in
  ('dat_truoc','dang_chay')` riêng, KHÔNG gộp — gộp sẽ khiến 1 chuyến `xong` hợp lệ của ĐÚNG nhà xe
  này báo nhầm 404 thay vì 400); `giuong_id` (ownership 404 + `hoat_dong=true` riêng — **nhân tiện
  vá 1 lỗ hổng có sẵn KHÔNG liên quan multi-tenant**: trước đợt này route không hề check
  `hoat_dong`, gọi thẳng API vẫn đặt được giường UI đã khoá); `diem_len_id`/`diem_xuong_id` (khi có
  giá trị); `tinh_len_ma`/`tinh_xuong_ma` (query riêng theo `tinh_ma`, KHÔNG qua
  `xacMinhThuocNhaXe` — mỗi mã ĐƯỢC GỬI validate ĐỘC LẬP, mã lạ không thuộc `tuyen_tinh` của đúng
  nhà xe này → 400 hard-fail dù đứng một mình hay đủ cặp; `gia_moc` null ở tỉnh hợp lệ vẫn giữ hành
  vi cũ, `ve.gia = null`, không chặn đặt vé). `cong-khai-gui-otp.js`/`cong-khai-xac-thuc-otp.js`
  KHÔNG đổi — `dat_ve_otp` cố ý GLOBAL, không gắn `nha_xe_id`.
- **`api/manifest-dat-ve.js?nx=<slug>`** (route MỚI) — manifest PWA ĐỘNG theo nhà xe, thay thế vai
  trò của `manifest-dat-ve.json` tĩnh cho việc cài app. `id`/`start_url` gắn `?nx=<slug>` (mỗi nhà
  xe là 1 app cài riêng biệt trên máy khách — tránh lặp lại bug "already installed" đã gặp ở đợt
  15). `name`/`short_name` lấy từ `nha_xe.ten`. `nx` sai/`tam_dung` → route trả lỗi, KHÔNG trả
  manifest. `dat-ve.html` **KHÔNG còn `<link rel="manifest">` tĩnh trong `<head>`** — JS tự tạo
  `<link>` trỏ tới route này SAU KHI đọc `nx` và resolve nhà xe thành công (KHÔNG chỉ đổi `href`
  của 1 link tĩnh có sẵn — trình duyệt có thể đã chụp manifest lúc parse HTML ban đầu, đổi `href`
  muộn không chắc được tính cho việc xét install). File `manifest-dat-ve.json` tĩnh GIỮ LẠI trong
  repo cho tới khi test xong trên điện thoại thật. **Chưa test tay trên điện thoại thật** (chỉ
  verify qua `curl`/query DB) — cần crew/owner tự bấm "Thêm vào màn hình chính" xác nhận Chrome cài
  đúng app riêng theo từng `nx`.
- **`dat-ve.html`** — đọc `const nx = new URLSearchParams(location.search).get('nx')` MỘT LẦN lúc
  load. Thiếu `nx` → hiện màn "Link đặt vé không hợp lệ, vui lòng liên hệ nhà xe", KHÔNG gọi API
  nào. Mọi `fetch` tới `api/cong-khai-*` (kể cả gửi/xác thực OTP, dù server không dùng `nx` ở 2
  route đó) truyền `nx`. Tên nhà xe (`nha_xe.ten` từ response `cong-khai-lich-chay`) hiện ở
  header/title thay nhãn cố định "EaKar Xe Khách". Lỗi 404/403 hiện đúng thông điệp server trả,
  không retry. `sw-dat-ve.js` bump `CACHE_NAME` `v2` → `v3` (dat-ve.html đổi cách đọc `nx`/gọi API,
  cần dọn cache cũ để khách không kẹt ở bản không đọc `nx`).
- **`private.ve_check_tenant()` + trigger `trg_ve_check_tenant`** (khoá tenant ở tầng DB cho `ve`,
  lớp phòng thủ THỨ 2 sau khi route đã verify ở tầng API) — `BEFORE INSERT OR UPDATE OF
  nha_xe_id, chuyen_id, giuong_id ON ve`, raise exception nếu `ve.nha_xe_id` không khớp
  `chuyen.nha_xe_id`/`giuong.nha_xe_id`. Đóng đúng lỗ hổng đã ghi ở audit Giai đoạn 4 ("Không có
  constraint đảm bảo `ve.nha_xe_id = chuyen.nha_xe_id = giuong.nha_xe_id`"). Đã verify: insert `ve`
  cố tình lệch `nha_xe_id` bị chặn (`P0001`), security advisor không sinh lỗi mới sau khi tạo
  trigger.
- **Test bắt buộc đã chạy thật (không chỉ đọc code)** — tạo tạm nhà xe `test-b` (kèm `tuyen_tinh`
  có 1 tỉnh `gia_moc` null, `giuong` có 1 giường `hoat_dong=false`, `diem_khach`, 1 `chuyen`
  `dat_truoc` + 1 `chuyen` `xong`), `curl` vào production: isolation đúng (`nx=test-b` không lẫn
  data `eakar`); 400/404/403 đúng cho thiếu/sai/không tồn tại/`tam_dung` `nx`; cross-tenant
  `chuyen_id`/`giuong_id`/`diem_len_id` đều 404; mã tỉnh lạ 400 (kể cả gửi 1 mình), mã hợp lệ +
  `gia_moc` null vẫn 200 với `ve.gia = null`; giường `hoat_dong=false` → 400; chuyến `xong` → 400
  (không phải 404, xác nhận ownership/status là 2 kiểm tra riêng); 2 nhà xe cùng ngày/chiều tạo
  `chuyen` riêng không đụng `uq_chuyen_ngay_chieu`; đặt vé `nx=eakar` end-to-end (qua API, tương
  đương luồng thật của `dat-ve.html`) ra đúng `nguon='khach_tu_dat'`/`gia` tính đúng — khớp badge
  "🌐 Đặt online" ở `khach.html`; trigger `ve_check_tenant` chặn insert lệch tenant. Đã xoá sạch data
  test (`test-b` + các `ve`/`chuyen` test tạo dưới `eakar` trong lúc test) sau khi xong. Sau khi
  deploy + test pass: đã xoá `GIO_KHOI_HANH_BAC`/`GIO_KHOI_HANH_NAM` khỏi Vercel (mọi scope).
- **KHÔNG LÀM ở Giai đoạn 5 (ghi nợ)**: `DROP DEFAULT` 6 cột `nha_xe_id` (vẫn chờ owner test tay 4
  trang crew, xem Giai đoạn 4); lịch chạy "ngày chẵn âm lịch" vẫn hardcode cho `eakar`
  (`cong-khai-lich-chay.js`) — nhà xe thứ 2 có lịch khác sẽ cần cột kiểu `nha_xe.lich_chay`, chưa
  làm; các hardcode riêng `eakar` còn sót (tên chuyến "Đắk Lắk → Hải Dương", lọc `ma !== 'KHH'`
  trong `dat-ve.html`, mã `DLK`/`HDG`) — nhà xe khác tuyến sẽ hiện sai, ghi nhận không sửa; Giai
  đoạn 6 (onboard nhà xe mới), UI superadmin, Zalo OA/SMS Brandname riêng từng nhà xe — ngoài phạm
  vi.

### Security audit sau Giai đoạn 4 (2026-09-19) — checklist 10 mục, chạy thật không chỉ đọc code

Owner yêu cầu audit độc lập sau khi xong Giai đoạn 1-4, vì phiên chat ngoài (không có quyền
`bash`/query DB thật) không tự verify được. Chạy đủ 10 mục, dùng công cụ thật (SQL simulation,
`curl` với anon key thật, security advisor) — không chỉ đọc code rồi suy luận:

1. **RLS coverage toàn bộ `public` schema** — liệt kê `pg_tables` × `pg_policies`: cả 13 bảng đều
   `rowsecurity=true`, không bảng nào bị bỏ sót. `storage.objects` (bucket `kien`, Public) — CHỈ có
   `bucket_id = 'kien'` trong policy, **KHÔNG scope theo nhà xe** (phát hiện thật, CHƯA sửa — xem
   "Lỗ hổng chưa sửa" cuối mục này).
2. **`nha_xe.ten`** — đã tự quyết ở Giai đoạn 3 rồi (chọn phương án chặt hơn spec gốc): chỉ
   `SELECT` được nhà xe MÌNH thuộc về, không mở cho mọi `authenticated`. Verify lại policy còn
   đúng: `nha_xe_tenant_read` dùng `private.co_quyen_nha_xe(id)`.
3. **`api/cong-khai-*.js` HOÀN TOÀN CHƯA được sửa ở Giai đoạn 4** (Giai đoạn 4 chỉ đụng 4 trang
   crew) — kiểm tra lộ ra ĐÚNG như lo ngại: mọi route công khai query `giuong`/`chuyen`/`diem_khach`
   KHÔNG lọc `nha_xe_id` chút nào (đọc TOÀN BỘ mọi nhà xe). Vô hại lúc này (chỉ có 1 nhà xe thật)
   nhưng là lỗ hổng rò dữ liệu chéo THẬT nếu có nhà xe thứ 2 trước khi Giai đoạn 5 xong — **đã vá
   TẠM THỜI ngay trong lúc audit** (xem "Đã sửa" bên dưới, hardcode tạm `layNhaXeIdMacDinh` — đã gỡ
   hẳn khi Giai đoạn 5 xong, xem mục "Multi-tenant Giai đoạn 5" bên dưới).
4. **Trust boundary `api/cong-khai-*.js`** — rà lại đủ cả 6 route: `cong-khai-dat-ve.js` (giá tự
   tính server, OTP tự verify server, KHÔNG tin `gia`/cờ verify từ client — đúng thiết kế), các
   route còn lại chỉ đọc (GET), không có field nhạy cảm nhận từ client. Không phát hiện thêm lỗ
   hổng trust boundary nào ngoài các lỗ `nha_xe_id` ở mục 3.
5. **Secret key trong file client** — `grep` `SUPABASE_SERVICE_KEY`/`DASHSCOPE_API_KEY`/
   `ZALO_APP_SECRET`/`ZALO_OA_ACCESS_TOKEN`/`SMS_PROVIDER_API_KEY`/`sb_secret_` trên mọi `.html`
   ngoài thư mục `api/` — **sạch, không có kết quả nào**.
6. **Cookie `zalo_pkce`** — vẫn đúng `HttpOnly; Secure; SameSite=Lax; Path=/api/zalo-callback;
   Max-Age=300` như spec gốc, chưa bị đổi qua các đợt sửa sau này.
7. **Test `ve` cross-tenant (CHƯA từng test trước đây, chỉ mới test `kien` ở Giai đoạn 3)** — tạo
   nhà xe test + `chuyen`/`giuong`/`ve` test, simulate user thật (`set local role authenticated` +
   `set_config('request.jwt.claims', ...)`): đọc chéo → 0 dòng; `UPDATE` chéo → 0 dòng bị đổi
   (verify lại `trang_thai` không đổi); **regression**: 2 vé active cùng `(chuyen_id, giuong_id)`
   trong CÙNG 1 nhà xe vẫn bị chặn đúng (`23505 uq_ve_giuong_active`) — không bị nới lỏng nhầm khi
   thêm `nha_xe_id`. Đã xoá sạch data test.
8. **Rà lại insert nào đang ngầm dựa vào `DEFAULT`** — `grep` lại TOÀN BỘ `.insert(` vào 6 bảng
   nghiệp vụ trên CẢ REPO (không chỉ 4 trang crew đã sửa ở Giai đoạn 4 — lần trước chỉ rà trong
   phạm vi đó) — phát hiện đúng 2 điểm insert SÓT trong `api/cong-khai-dat-ve.js` (`chuyen` và `ve`,
   xem mục 3) đang ngầm dựa vào `DEFAULT` thay vì set tường minh. Đã sửa cùng lúc.
9. **RLS `dat_ve_otp` — verify bằng anon key THẬT qua HTTP, không chỉ tin advisor** — insert 1 dòng
   OTP thật qua SQL, gọi `GET /rest/v1/dat_ve_otp` bằng `SUPABASE_ANON_KEY` thật: trả `200 []` dù
   bảng CÓ dữ liệu (không phải trả rỗng vì bảng vốn trống) — xác nhận RLS chặn đúng, không phải suy
   luận từ advisor. Đã xoá dòng test.
10. **Rate limit OTP — test thật qua `curl` vào endpoint production**, không chỉ tin code — gọi
    `POST /api/cong-khai-gui-otp` 4 lần liên tiếp cùng SĐT: 3 lần đầu qua được bước rate-limit (fail
    ở bước gửi SMS vì chưa có provider — đúng thiết kế), lần thứ 4 nhận `429 "Gửi quá nhiều lần"` —
    đúng ngưỡng `≥3 lần/10 phút`. Đã xoá data test.

**Đã sửa ngay trong lúc audit** (không đợi Giai đoạn 5 đầy đủ, vì đây là lỗ hổng/bug thật đang chạy
trên production):
- **Regression THẬT tự gây ra ở Giai đoạn 4** (mức độ nghiêm trọng: giá vé khách thấy bị đứng yên) —
  `khach.html`'s modal "Giá vé theo tỉnh" đã đổi ghi sang `tuyen_tinh.gia_moc`, nhưng
  `api/cong-khai-dat-ve.js` (tính giá lúc đặt) và `api/cong-khai-diem-khach.js` (hiển thị giá cho
  khách xem trước khi đặt) VẪN đọc từ `tinh_tuyen` (bảng cũ, ngừng cập nhật từ lúc đó) — sửa crew
  giá không còn ảnh hưởng gì tới khách nữa. Đã sửa cả 2 route đọc đúng `tuyen_tinh` join `tinh`.
- **4 route công khai (`cong-khai-dat-ve.js`/`cong-khai-diem-khach.js`/`cong-khai-so-do.js`/
  `cong-khai-lich-chay.js`) thêm `layNhaXeIdMacDinh(sbAdmin)`** — hàm nhỏ lặp lại ở từng file (cùng
  convention "không import chéo" đã có), TẠM THỜI hardcode `SLUG_NHA_XE_MAC_DINH = 'eakar'` (tra
  `nha_xe.id` theo slug) vì Giai đoạn 5 (`?nx=slug` từ URL thật) CHƯA làm — dùng để `.eq('nha_xe_id',
  nhaXeId)` cho mọi query `giuong`/`chuyen`/`diem_khach`/`tuyen_tinh`, và gắn `nha_xe_id: nhaXeId`
  vào 2 điểm insert (`chuyen`/`ve`) trong `cong-khai-dat-ve.js` — đóng lỗ hổng rò dữ liệu chéo NGAY,
  không đợi routing `?nx=` đầy đủ. **(2026-09-20) Đã gỡ hẳn khi Giai đoạn 5 xong** — xem mục
  "Multi-tenant Giai đoạn 5" bên dưới, không còn hardcode `'eakar'` nào trong `api/`.

**Lỗ hổng CHƯA sửa (ghi nhận, cần quyết định riêng, không tự ý làm vì đụng kiến trúc lớn hơn)**:
- **Bucket `kien` KHÔNG scope theo nhà xe — CHỦ ĐÍCH, không phải bug sót.** Public bucket từ đầu, path
  `{kien.id}.jpg` là UUID khó đoán; policy chỉ check `bucket_id = 'kien'`. Đã cân nhắc (audit 2026-09-19)
  và chấp nhận vì đổi path scheme + migrate toàn bộ ảnh cũ tốn hơn rủi ro thực tế. Không "vá" trừ khi
  owner quyết định lại.
- **Không có constraint đảm bảo `ve.nha_xe_id = chuyen.nha_xe_id` VÀ `= giuong.nha_xe_id`** (3 giá
  trị đang độc lập, không ép buộc khớp nhau ở tầng DB) — hiện KHÔNG có đường khai thác qua code app
  (UI/API đều tự suy `nha_xe_id` nhất quán từ 1 nguồn), nhưng về lý thuyết 1 bug tương lai có thể
  tạo `ve` với `giuong_id` của nhà xe khác `chuyen_id`. Cần trigger hoặc check constraint riêng nếu
  muốn ép cứng ở tầng DB — chưa làm, mức độ ưu tiên thấp (không phải lỗ hổng đang khai thác được).

### OTP bắt buộc mọi lượt đặt vé công khai (2026-09-19)

Chống đặt ảo/spam ở `dat-ve.html` — khách phải xác thực SĐT bằng mã 6 số (qua Zalo ZNS hoặc SMS
Brandname, tự chọn) trước khi bấm "Đặt vé" được. **TÁCH BIỆT HOÀN TOÀN với auth crew** (`auth.users`/
Zalo Login OAuth ở `login.html`) — mục đích khác nhau, không liên quan gì tới đăng nhập.

- **`dat_ve_otp`** (bảng mới, `id, sdt, ma_otp, kenh 'zalo'|'sms', het_han, da_dung, xac_thuc_luc,
  so_lan_sai, created_at`, index theo `sdt`) — chỉ server (`SUPABASE_SERVICE_KEY`) đụng vào.
  **RLS ĐÃ BẬT (không có policy nào)**, migration `fix_dat_ve_otp_rls_missing`, 2026-09-19 — lúc
  tạo bảng ban đầu QUÊN bật RLS, bị Supabase security advisor báo `ERROR` (`rls_disabled_in_public`)
  khi soát lại lúc làm multi-tenant Giai đoạn 3, nghĩa là ai cầm `SUPABASE_ANON_KEY` (public) đều
  đọc được mọi mã OTP qua PostgREST trực tiếp — đã sửa ngay, xem mục "Multi-tenant" để biết chi
  tiết phát hiện.
- **`api/cong-khai-gui-otp.js`** (POST `{sdt, kenh}`) — validate SĐT, rate-limit chống lạm dụng chi
  phí (≥3 lần/10 phút hoặc ≥10 lần/24h cho cùng SĐT → 429), sinh mã 6 số random, hết hạn sau 5 phút,
  gọi `guiOtpZalo`/`guiOtpSms` theo kênh khách chọn. **KHÔNG BAO GIỜ trả mã OTP trong response.**
  - `guiOtpZalo` — gọi Zalo ZNS (Notification Service, **KHÁC HẲN** Zalo Login OAuth đã có), cần
    `ZALO_OA_ACCESS_TOKEN` + `ZALO_ZNS_TEMPLATE_ID` (mẫu tin phải được Zalo duyệt nội dung trước) —
    ***CHƯA CÓ 2 ENV NÀY***, throw lỗi rõ ràng "Kênh Zalo chưa cấu hình" thay vì fail âm thầm.
  - `guiOtpSms` — placeholder, chưa gắn nhà cung cấp cụ thể (owner chưa chốt eSMS/SpeedSMS/nhà
    mạng, cần tài khoản Brandname + giấy tờ HKD, duyệt vài ngày) — luôn throw lỗi "chưa tích hợp
    xong" cho tới khi có credential thật và code phần gọi API nhà cung cấp.
  - **⚠️ `OTP_TEST_MODE` (env Vercel, thêm 2026-09-23) — ĐANG BẬT ở Production, xem mục "TODO trước
    khi go-live" ở đầu file** — cho phép test hết luồng OTP/đặt vé trong lúc Zalo ZNS/SMS Brandname
    chưa có credential thật (2 hàm `guiOtpZalo`/`guiOtpSms` ở trên vẫn luôn throw nếu gọi thật).
    So sánh **ĐÚNG CHUỖI** `process.env.OTP_TEST_MODE === 'true'` (KHÔNG dùng truthy-check trần) —
    env var Vercel luôn là string, set `"false"` mà check truthy sẽ bị coi là BẬT, đây là bug rất
    dễ mắc. Bọc ĐÚNG bước gọi `guiOtpZalo`/`guiOtpSms` (không đụng gì phía trước) — dòng `dat_ve_otp`
    vẫn INSERT bình thường trước đó (thứ tự code vốn đã đúng: insert trước, gửi sau), chỉ BỎ QUA
    lời gọi gửi thật, log 1 dòng `[OTP_TEST_MODE] Bỏ qua gửi thật cho <sdt>, kenh=<kenh>` ra Vercel
    function logs (không phải response) để có dấu vết debug. **KHÔNG đổi gì về việc client có thấy
    mã OTP hay không** — response vẫn chỉ `{ok:true}`, không bao giờ trả `ma_otp` dù test mode bật
    hay tắt (giữ nguyên nguyên tắc đã có ở trên); người test phải tự tra `dat_ve_otp.ma_otp` qua
    Supabase (SQL hoặc Table Editor — cột này lưu **plaintext, không hash**, đọc trực tiếp được).
    Rate-limit (≥3 lần/10 phút, ≥10 lần/24h) và validate SĐT **KHÔNG đổi gì**, chạy y hệt dù test
    mode bật hay tắt. **Đã verify thật (không chỉ đọc code, 2026-09-23)**: gọi
    `POST /api/cong-khai-gui-otp` với SĐT test → `{ok:true}`; tra `dat_ve_otp` qua SQL lấy đúng
    `ma_otp` plaintext; gọi `POST /api/cong-khai-xac-thuc-otp` với mã đó → `{ok:true}`, SQL xác
    nhận `da_dung=true`; đặt vé thật qua `api/cong-khai-dat-ve.js` bằng đúng SĐT đó → thành công,
    tạo `ve` với `trang_thai='da_dat', nguon='khach_tu_dat'`; **test âm**: đặt vé bằng 1 SĐT KHÁC
    CHƯA xác thực OTP lần nào → vẫn `403 "Vui lòng xác thực số điện thoại trước khi đặt vé"` như
    bình thường — xác nhận test mode không làm yếu bước kiểm tra ở `api/cong-khai-dat-ve.js`. Đã
    dọn sạch data test (`ve`/`dat_ve_otp`/`chuyen` vừa tạo) sau khi xong.
- **`api/cong-khai-xac-thuc-otp.js`** (POST `{sdt, ma_otp}`) — lấy dòng `dat_ve_otp` MỚI NHẤT của
  SĐT chưa dùng/chưa hết hạn (mã cũ hơn tự động mất hiệu lực dù chưa hết 5 phút, phòng khách bấm gửi
  lại nhiều lần), sai mã → `so_lan_sai += 1`, ≥5 lần sai → khoá phải gửi mã mới. Đúng mã →
  `da_dung=true, xac_thuc_luc=now()`.
- **`api/cong-khai-dat-ve.js`** — thêm bước SERVER TỰ KIỂM TRA đã xác thực chưa (cùng nguyên tắc
  "không tin client" đã áp dụng cho giá vé) — trước khi insert `ve`, query `dat_ve_otp` có dòng
  `sdt` khớp, `da_dung=true`, `xac_thuc_luc` trong 30 phút gần nhất không; không có → 403. Đây là
  chốt chặn THẬT, UI chỉ là lớp UX.
- **`dat-ve.html`** — trong `#dat-ve-form`, sau ô SĐT: radio chọn kênh Zalo/SMS → nút "Gửi mã xác
  thực" (tự disable 60s sau khi bấm, đếm ngược trên chính nút, chỉ là UX vì server đã rate-limit
  thật) → hiện ô nhập 6 số + nút "Xác nhận". Đúng mã → `sdtDaXacThucOtp` (biến module-level) ghi lại
  đúng số vừa xác thực, hiện dấu "✓ Đã xác thực". Nút "Đặt vé" so `sdt` đang gõ với
  `sdtDaXacThucOtp` — lệch (kể cả đổi số sau khi đã xác thực số khác) → chặn, báo toast yêu cầu xác
  thực lại; listener `input` trên `#f-sdt` tự ẩn dấu ✓/khối nhập mã khi số không khớp nữa.

### Xem lại vé đã đặt — `xem-ve.html` + `api/cong-khai-xem-ve.js` (2026-09-23)

Trước đó màn xác nhận đặt vé nói thẳng "hệ thống chưa hỗ trợ tra cứu lại vé" — khách đóng tab là
mất trắng thông tin, phải gọi nhà xe hỏi lại. Thêm khả năng quay lại xem (tên/SĐT/giường/ngày giờ/
tuyến/giá/hình thức thanh toán/trạng thái) qua 1 link riêng, **bảo mật dựa vào `ve.id` (UUID khó
đoán) — đúng pattern app đang dùng cho ảnh Storage (`{kien.id}.jpg`), không thêm cơ chế token/login
riêng.**

- **`api/cong-khai-xem-ve.js`** (GET, `?id=<ve.id>`, CÓ THỂ lặp lại `id` nhiều lần trong query
  string để gộp nhiều vé vào 1 link — dùng cho khứ hồi 2 chặng) —
  - **KHÔNG bắt buộc `?nx=`** — NGOẠI LỆ CÓ CHỦ ĐÍCH so với 4 route `cong-khai-*` khác (`layNhaXe`
    luôn là việc đầu tiên của mọi handler ở các route đó, xem mục "Multi-tenant Giai đoạn 5"). Lý
    do: các route kia thao tác TRÊN TOÀN BỘ tài nguyên của 1 nhà xe (đặt vé mới, xem lịch chạy...)
    nên cần `nx` để biết phạm vi truy vấn; route này chỉ TRA CỨU ĐIỂM theo đúng `ve.id` — UUID đã
    tự xác định duy nhất 1 nhà xe rồi, không có gì mơ hồ cần `nx` để phân giải. Vẫn dùng
    `SUPABASE_SERVICE_KEY` (bypass RLS) như các route công khai khác.
  - **Xử lý cả 2 dạng Vercel trả `req.query.id`** — string đơn nếu chỉ 1 `?id=`, mảng nếu ≥2
    (`Array.isArray(raw) ? raw : [raw]`) — lỗi rất dễ quên case 1-phần-tử-không-phải-mảng.
  - **Lọc UUID hợp lệ trước khi query** (regex, không để lọt chuỗi rác xuống Postgres gây lỗi cú
    pháp uuid) — id sai định dạng coi như "không tìm thấy" ngay từ đầu, gộp chung với id đúng định
    dạng nhưng không có trong DB vào 1 field `khong_tim_thay: [...]` ở response — **KHÔNG hard-fail
    cả request nếu 1 phần id thiếu**, để frontend hiện đúng phần tìm được + báo thiếu phần kia
    thay vì trắng trang.
  - **Guard mọi `id` phải cùng `nha_xe_id`** — URL bị chỉnh tay ghép 2 id của 2 nhà xe khác nhau →
    400 rõ ràng, KHÔNG âm thầm hiện lẫn lộn data 2 nhà xe trên cùng 1 trang.
  - `ve.tinh_len_ma`/`tinh_xuong_ma` **KHÔNG có FK trực tiếp tới `tinh`** (FK thật là composite qua
    `tuyen_tinh`, xem mục "`ve_tinh_len_xuong_ma`" ở Database) nên KHÔNG embed được qua cú pháp
    PostgREST `tinh_len:tinh_len_ma(ten)` — phải gom hết mã tỉnh cần tra (từ cả `tinh_len_ma`/
    `tinh_xuong_ma` lẫn `diem_khach.tinh_ma` fallback) rồi query riêng bảng `tinh`, build map ở JS.
  - **Nhãn địa điểm ƯU TIÊN `dia_diem_*_nhan`** (vé mới, xem mục "Bỏ diem_khach" bên dưới),
    **FALLBACK `diem_khach`** (embed thẳng qua `diem_len:diem_len_id(ten, tinh_ma)` — cột này CÓ FK
    thật, embed được bình thường) cho vé CŨ trước 2026-09-22 chưa có field mới — cùng tinh thần
    `tenDiaDiem()` đã có ở `khach.html`, không viết lại từ đầu logic ưu tiên.
  - **Gom vé theo `chuyen_id`** (1 chặng = 1 chuyến, có thể nhiều giường/vé nếu đặt nhóm cùng lúc)
    rồi **sort theo `khoi_hanh` TĂNG DẦN** — không phụ thuộc thứ tự `id` trong URL, luôn hiện chiều
    đi trước chiều về (đã test đảo ngược thứ tự 2 `id` trong URL, vẫn ra đúng thứ tự).
  - `tinh_len_ten`/`tinh_xuong_ten` ở cấp CHẶNG (tóm tắt tuyến cho tiêu đề) lấy từ **vé ĐẦU TIÊN**
    gặp trong nhóm — hợp lý vì mọi vé cùng `chuyen_id` luôn cùng `tinh_len_ma`/`tinh_xuong_ma` (đặt
    cùng lúc theo cùng 1 tuyến đã chọn ở Bước 0 của `dat-ve.html`/`khach.html`). Từng vé vẫn có
    `dia_diem_len`/`dia_diem_xuong` RIÊNG (đã kèm tên tỉnh) để hiện chi tiết xã/huyện hơn nếu khác
    nhau giữa các vé trong cùng nhóm.
  - `Cache-Control: no-store` — data có thể đổi bất kỳ lúc nào (crew huỷ vé qua `khach.html`), phải
    luôn tải mới, không cache.
  - Response KHÔNG có field nào ngoài phạm vi đã hiện sẵn ở màn xác nhận lúc đặt — không thêm gì
    nhạy cảm hơn.
  - **KHÔNG rate-limit route này** — UUID khó đoán, rủi ro dò quét thấp, không đáng thêm phức tạp
    ở bản TEST.
- **`api/cong-khai-dat-ve.js` response thêm `ve_id`** (trước chỉ có `chuyen_id`) — `.insert(...)
  .select('id').single()` thay vì `.insert(...)` trơn. `dat-ve.html` cần giá trị này để build link
  xem lại vé ở màn xác nhận.
- **`xem-ve.html`** — trang PUBLIC, KHÔNG `requireSession`/hamburger (giống `dat-ve.html`), KHÔNG
  đăng ký service worker riêng (trang tĩnh, không có luồng nhập liệu dài cần offline-first). Đọc
  `id` bằng `URLSearchParams.getAll('id')` (KHÔNG phải `.get('id')` — mới lấy đủ nhiều giá trị).
  Không có `id` nào → "Link không hợp lệ". Âm lịch/thứ trong tuần tính LẠI Ở CLIENT từ
  `chuyen.khoi_hanh` (timestamptz) bằng `convertSolar2Lunar` (hàm global có sẵn từ `shared.js`,
  cùng cách tái dùng đã áp dụng nhiều nơi khác trong app) — dịch `+7h` rồi đọc qua getter UTC để ra
  đúng ngày/giờ VN, CÙNG kỹ thuật `ranhGioiNgayVN`/`tinhKhoiHanhMacDinh` đã dùng ở
  `api/cong-khai-dat-ve.js` (Asia/Ho_Chi_Minh không DST, offset cố định +07:00). Vé
  `trang_thai = 'huy'` → hiện rõ badge đỏ "❌ Vé này đã bị huỷ" (không xoá khỏi trang, khách cần
  biết trạng thái thật), ẩn dòng "Chờ nhà xe xác nhận chuyển khoản" nếu đã huỷ. `khong_tim_thay`
  không rỗng → hiện dòng nhỏ "⚠ 1 phần thông tin không tìm thấy, có thể đã bị xoá" cuối trang.
- **`dat-ve.html`** — màn xác nhận (`#xac-nhan-box`) đổi câu "Vui lòng lưu lại thông tin này — hệ
  thống chưa hỗ trợ tra cứu lại vé" (bỏ vế sau) thành nút "🔗 Sao chép link xem lại vé"
  (`navigator.clipboard.writeText`, fallback `document.execCommand('copy')` qua `<textarea>` ẩn cho
  WebView cũ không hỗ trợ Clipboard API) + nút "📤 Chia sẻ" (chỉ hiện nếu `navigator.share` tồn
  tại — dùng share sheet gốc để khách tự chọn gửi qua Zalo/SMS/Ghi chú, KHÔNG hardcode link chia sẻ
  riêng cho Zalo). `veIdCacChang` (mảng module-level, CÙNG vòng đời reset với `ketQuaCacChang` —
  đầu `xacNhanChonChieu()`, trong `doiChuyenKhac()`) gom `ve_id` của MỌI vé đặt thành công xuyên
  suốt cả phiên (kể cả khứ hồi 2 chặng), build link `xem-ve.html?id=...&id=...` từ mảng này.
- **`middleware.js`** — thêm `/xem-ve.html` + `/api/cong-khai-xem-ve` vào allow-list host booking
  (thiếu bước này thì trang mới trả 404 y hệt các trang crew khác trên host đó).
- **`vercel.json`** — thêm redirect `/xem-ve.html` (host crew → host booking, 308, giữ nguyên query
  string), nhất quán với `/dat-ve.html`/`/api/manifest-dat-ve` đã có sẵn — link cũ/copy nhầm domain
  vẫn dẫn đúng chỗ. **Lưu ý khác biệt với 2 redirect kia**: các route `api/cong-khai-*` khác (bao
  gồm `api/cong-khai-xem-ve`) KHÔNG có redirect riêng — chúng vốn đã 200 trên CẢ 2 host (middleware
  chỉ chặn host booking, không chặn gì trên host crew `van-tai-hanh-khach.vercel.app`), vì
  `dat-ve.html` gọi API bằng path tương đối `/api/cong-khai-*` — cần hoạt động trên bất kỳ host nào
  đang serve trang đó, không riêng gì `xem-ve.html`.
- **Đã verify bằng `curl`/SQL thật (2026-09-23, không chỉ đọc code)**: đặt 1 vé đơn chiều thật
  (`nx=eakar`) → response có `ve_id` → gọi route mới với đúng id → JSON trả đúng tên/SĐT/giường/
  tuyến/giá/tỉnh/địa điểm khớp vé vừa đặt; đặt khứ hồi thật (2 chuyến khác `chuyen_id`, khác
  `chieu`) → gọi route với **2 id đảo ngược thứ tự trong URL** (id chặng về đứng trước) → response
  vẫn trả ĐÚNG THỨ TỰ chặng đi trước/về sau (sort theo `khoi_hanh`, không phụ thuộc thứ tự URL); id
  UUID giả không tồn tại → `200 {chang:[], khong_tim_thay:[...]}`, không crash/500; 1 id thật + 1
  id giả trộn lẫn → trả đúng phần tìm được + báo thiếu phần kia; id chuỗi rác không đúng định dạng
  UUID (`"abc123"`) → không rớt lỗi cú pháp Postgres, xử lý y hệt "không tìm thấy"; thiếu `id` hẳn
  → `400 "Thiếu id vé"`; `UPDATE ve.trang_thai='huy'` trực tiếp (tương đương crew huỷ qua
  `khach.html` — cùng 1 UPDATE, xem mục "Trả khách" ở `manifest-hang.html`) → gọi lại route → phản
  ánh đúng `trang_thai: "huy"` ngay; `curl` xác nhận `xem-ve.html`/`api/cong-khai-xem-ve` đều 200
  trên CẢ 2 host (booking VÀ crew — xem giải thích ở bullet `vercel.json` trên, đây LÀ hành vi
  đúng, không phải sót middleware), redirect 308 từ host crew sang host booking giữ nguyên query
  string, các trang crew khác (`hang.html`...) vẫn 404 trên host booking (không bị allow-list mới
  vô tình mở rộng). Đã dọn sạch toàn bộ data test (`ve`/`chuyen`/`dat_ve_otp`) sau khi xong.

### Bỏ `diem_khach`, thay bằng chọn Tỉnh + Xã/Huyện (2026-09-22)

Áp dụng cho `dat-ve.html` (khách tự đặt online) + `khach.html` (crew đặt vé nội bộ). **KHÔNG áp
dụng cho `hang.html`** (nhập kiện hàng) — trang đó dùng bảng `diem` riêng, không liên quan gì tới
`diem_khach`, giữ nguyên 100% cách chọn tỉnh hiện có.

**Vấn đề gốc**: từ đợt "Bỏ hẳn Bước Chọn điểm lên/xuống" (2026-09-19, đợt 10) ở `dat-ve.html`,
khách đặt vé cho cặp tỉnh CHƯA có `diem_khach` (đa số 15/17 tỉnh, chỉ ĐL/HD có điểm thật) sẽ có
`diem_xuong_id = null`. `manifest-hang.html` có guard `if (!v.diem_xuong) return` — vé này bị
loại thẳng khỏi manifest, KHÔNG hiện ở đâu cả — crew không biết khách này tồn tại nếu chỉ xem
trang đó. Giải pháp: bỏ hẳn khái niệm `diem_khach` (điểm cụ thể, kiểu bến xe) khỏi luồng đặt vé,
thay bằng chọn **Tỉnh → Xã/Huyện**, có toggle tìm theo tên hành chính CŨ (trước sáp nhập 7/2025,
63 tỉnh) hoặc MỚI (sau sáp nhập, 34 tỉnh) — giống pattern Vexere (nút gạt "Địa chỉ mới", gõ để lọc
gợi ý). `manifest-hang.html` nhóm lại theo `ve.tinh_xuong_ma` (đã có sẵn cột này từ đợt
2026-09-21) — không còn phụ thuộc `diem_khach` có tồn tại dữ liệu hay không, giải quyết đúng gốc
vấn đề.

**18 dòng `tinh_tuyen` của app giữ nguyên rời rạc, KHÔNG gộp lại** dù tên tỉnh MỚI trùng nhau —
quan trọng để không mất `thu_tu`/`gia_moc` cần cho tính giá và xếp thứ tự manifest. Việc phân biệt
tỉnh CŨ vẫn làm được ở CẤP TỈNH (không cần xuống xã) vì 18 dòng không gộp; dữ liệu xã/huyện chỉ cần
cho việc chọn vị trí cụ thể HƠN tỉnh (Bước 2), không phải để giải quyết trùng tên.

- **Nguồn dữ liệu xã/huyện** — `data/tinh-xa-huyen.json` (JSON tĩnh, KHÔNG phải bảng DB — cùng
  tiền lệ `data/tinh_km_range.json`/`data/tuyen_chuan_bactien.json`, tránh migration/RLS cho dữ
  liệu tham chiếu chỉ đọc, không đổi thường xuyên) — build 1 LẦN từ file CSV
  `convert_legacy_2025_with_location_and_default_ward.csv` của repo GitHub
  **`tranngocminhhieu/vietnamadminunits`** (MIT license, đã trinh sát/kiểm chứng trước khi dùng:
  10.602 dòng, đủ trường `province`/`district`/`ward` (CŨ) + `newProvince`/`newWard` (MỚI), số
  liệu khớp thực tế khi lọc theo tỉnh — xem lịch sử trinh sát trong session; `sapnhap.bando.com.vn`
  có API ẩn thật (`POST /p.co_dvhc`, không cần key) nhưng dataset trên ĐÃ dùng chính nguồn đó làm
  input nên không cần tự cào lại). **17 tỉnh** (18 dòng `tinh_tuyen` trừ Khánh Hòa — quy ước có sẵn
  ở `tinhTuyenChoDatVe()`), mỗi tỉnh 1 entry key theo `tinh_tuyen.ma`:
  ```json
  { "DLK": { "ten_cu": "Đắk Lắk", "ten_moi": "Đắk Lắk", "huyen_cu": [...], "xa_moi": [...] }, ... }
  ```
  `huyen_cu` = tên huyện CŨ đã bỏ tiền tố loại (Thành phố/Thị xã/Huyện/Quận); `xa_moi` = tên xã MỚI
  GIỮ NGUYÊN tiền tố loại (Phường/Xã, để phân biệt trùng tên hiếm gặp). `ten_moi` GEN SẴN nhãn phân
  biệt cho dòng KHÔNG PHẢI "chính" — quy tắc mechanical: so `ten_cu` với tên tỉnh mới đã bỏ tiền tố
  ("Tỉnh"/"Thành phố"), TRÙNG Y HỆT → "chính" → giữ nguyên tên mới; KHÔNG trùng (kể cả chỉ đổi
  tên, không sáp nhập — vd Thừa Thiên Huế→Huế) → `"<tên mới> (vùng <tên cũ> cũ)"`. Kết quả gen ra
  khớp đúng bảng đối chiếu tay đã kiểm trước khi build: DLK/PYN đều → "Đắk Lắk" (PYN thêm hậu tố),
  DNG/QNM đều → "Đà Nẵng" (QNM thêm hậu tố), QTR/QBH đều → "Quảng Trị" (QBH thêm hậu tố), NBH/HNM
  đều → "Ninh Bình" (HNM thêm hậu tố), BDN → "Gia Lai (vùng Bình Định cũ)", TTH → "Huế (vùng Thừa
  Thiên Huế cũ)", HDG → "Hải Phòng (vùng Hải Dương cũ)", còn lại (QNG, HTI, NAN, THA, HNI, HYN)
  giữ nguyên tên không đổi. Script build KHÔNG lưu trong repo (chạy 1 lần thủ công lúc làm tính
  năng) — cần build lại thì lặp lại đúng logic mechanical trên từ file CSV gốc.

- **Schema `ve`** (migration `ve_dia_diem_len_xuong_nhan`) — **KHÔNG xoá** `diem_len_id`/
  `diem_xuong_id` (giữ nullable, chỉ ngừng ghi từ ứng dụng — dữ liệu vé CŨ đã có 2 cột này vẫn tra
  cứu/hiển thị lại được bình thường qua `tenDiemKhach()`, xem bullet `khach.html` bên dưới). Thêm
  4 cột mới: `dia_diem_len_nhan`/`dia_diem_xuong_nhan` (text, nullable — nhãn địa điểm cụ thể chọn
  ở Bước 2, vd `"Xã Bản Nguyên"`) và `dia_diem_len_loai`/`dia_diem_xuong_loai` (text, check
  `in ('xa','huyen')`, nullable — tránh phải suy luận qua tiền tố chữ trong nhãn lúc hiển thị lại).
  Bảng `diem_khach` **KHÔNG DROP** — giữ nguyên trong DB (dữ liệu ĐL/HD cũ vẫn còn), chỉ ngừng dùng
  ở tầng ứng dụng, coi như **deprecated**.

- **Middleware/Service Worker** — `middleware.js` (allow-list origin booking) thêm
  `/point-match.js` + `/data/tinh-xa-huyen.json` (2 dependency mới của `dat-ve.html`, thiếu sẽ
  404 trên `eakar-booking.vercel.app`). `sw-dat-ve.js` bump `v4` → `v5` (thêm 2 asset trên vào
  `STATIC_ASSETS`). `sw.js` (crew) bump `v2` → `v3` (thêm `point-match.js` — SÓT từ đợt
  `manifest-hang.html` dùng trước đó, không phải lỗi mới của đợt này — + `data/tinh-xa-huyen.json`
  cho `khach.html`).

- **Component picker Tỉnh→Xã/Huyện — VIẾT RIÊNG trong TỪNG file** (`dat-ve.html` và `khach.html`
  đều có bản implementation riêng của mình, KHÔNG tách ra file JS dùng chung) — khác quyết định ban
  đầu cân nhắc tách file `dia-diem-picker.js` giống `shared.js`/`idb-queue.js`; chọn giữ tại chỗ vì
  2 trang có 3+ điểm gọi khác nhau (dải Bước 0, nút sửa vé đã đặt, form đặt-nhiều-vé) với
  `onChonXong` callback riêng biệt từng nơi, tách file sẽ cần truyền quá nhiều tham số qua lại,
  không rõ lợi ích hơn giữ tại chỗ ở quy mô 2 file này. Cả 2 bản đều mở rộng CHÍNH modal
  `#dia-diem-picker` có sẵn (đổi `.dia-diem-picker-card` từ nội dung tĩnh sang `id` rỗng, JS tự
  build lại toàn bộ nội dung mỗi lần mở/đổi bước) thành **drill-down 2 bước trong CÙNG 1 phiên mở
  picker**: Bước 1 chọn tỉnh (17 tỉnh, loại tỉnh đang chọn ở ĐẦU KIA nếu có — không cho trùng
  xuất phát/điểm đến), Bước 2 chọn xã (toggle "Mới") hoặc huyện (toggle "Cũ") CỦA ĐÚNG tỉnh vừa
  chọn, đọc từ `data/tinh-xa-huyen.json`. Chọn xong Bước 2 mới gọi `onChonXong({tinh, nhan, loai})`
  rồi đóng picker.
  - **Search input KHÔNG bị re-render khi gõ** — tách `renderDiaDiemPicker()` (vẽ khung: header/
    toggle/search input, gọi khi đổi bước/toggle) khỏi `renderDdpList()` (chỉ vẽ lại
    `#ddp-list`, gọi thêm mỗi lần gõ) — cùng bài học đã áp dụng cho `.item-qty-input` ở
    `hang.html`: re-render nguyên khối kể cả input đang gõ sẽ làm mất focus/con trỏ giữa chừng.
  - **Đổi toggle Cũ/Mới GIỮA CHỪNG lúc đang ở Bước 2 → reset về Bước 1, xoá tỉnh đang chọn tạm**
    (quyết định owner, hỏi qua `AskUserQuestion` trước khi code — tránh kẹt "tỉnh hiện tên cũ
    nhưng xã bên dưới lại là danh sách xã mới") — cùng nguyên tắc `doiChuyenKhac()` đã áp dụng ở
    `dat-ve.html`. Đổi toggle lúc còn Bước 1 (chưa chọn tỉnh) chỉ vẽ lại list theo nguồn mới,
    không cần reset gì.
  - **Toggle mặc định = tên CŨ** (quyết định owner) — giữ trải nghiệm hiện tại của app (tên cũ làm
    chuẩn xuyên suốt `tinh_tuyen.ten`/`hang.html`/`dat-ve.html`).

- **`dat-ve.html`** — `moDiaDiemPicker(vaiTro)` (gọi từ bấm `.route-place-value` ở
  `renderChieuSelector`, xem mục "Đặt vé công khai") giờ mở picker 2 bước thay vì list tỉnh đơn.
  Chọn xong Bước 2 set CẢ `noiXuatPhatTinh`/`diemDenTinh` (như trước) LẪN state mới
  `noiXuatPhatDiaDiem`/`diemDenDiaDiem` ({nhan, loai}) — 2 biến mới CÙNG vòng đời với
  `noiXuatPhatTinh`/`diemDenTinh` (không reset theo `chonNgay`/`doiChuyenKhac`, chỉ đổi khi khách
  tự chọn lại). `renderChieuSelector` hiện thêm nhãn xã/huyện đã chọn (`.route-place-sub`, chữ nhỏ
  màu muted) ngay dưới tên tỉnh. `chonChuyen()`/submit `#btn-dat-ve` KHÔNG còn gọi `timDiemChoTinh`
  (hàm đã XOÁ, cùng biến `diemKhachList` không dùng nữa) — gửi thẳng `dia_diem_len_nhan/loai`,
  `dia_diem_xuong_nhan/loai` thay cho `diem_len_id`/`diem_xuong_id` trong body POST tới
  `api/cong-khai-dat-ve.js`.
  - **`api/cong-khai-dat-ve.js`** — bỏ hẳn nhận/verify `diem_len_id`/`diem_xuong_id` (KHÔNG còn là
    FK từ client, không cần `xacMinhThuocNhaXe`). Nhận `dia_diem_len_nhan/loai`,
    `dia_diem_xuong_nhan/loai` — validate NHẸ (chỉ check `loai` nếu có phải đúng `'xa'`/`'huyen'`,
    thà chặn ở API với thông điệp rõ ràng hơn để insert dưới rớt lỗi DB khó hiểu), KHÔNG cần
    verify ownership (không phải FK). `diem_len_id`/`diem_xuong_id` KHÔNG còn truyền vào `.insert`
    (tự `null` vì cột nullable, không có default).

- **`khach.html`** — 3 nơi từng dùng `diem_khach` đều đã chuyển sang picker Tỉnh→Xã/Huyện, **không
  sót luồng nào**:
  1. **Dải "Nơi xuất phát/Điểm đến"** (Bước 0 Sơ đồ, `moDiaDiemPickerCrew` — wrapper gọi
     `moTinhXaHuyenPicker` dùng chung) — y hệt `dat-ve.html`, set `noiXuatPhatDiaDiem`/
     `diemDenDiaDiem`. Form đặt-nhiều-vé (`#dat-nhieu-modal`) đã BỎ HẲN 2 dropdown "Điểm đón/trả"
     + 2 nút "+" (`openDiemKhachModal` cũ) — chỉ còn 1 dòng hiển thị LẠI (không chọn lại) nhãn đã
     chọn sẵn ở dải phía trên, để crew đối chiếu trước khi bấm "Đặt vé". `btn-dn-dat-ve` insert
     ghi `dia_diem_len_nhan/loai`/`dia_diem_xuong_nhan/loai` thay `diem_len_id`/`diem_xuong_id`.
  2. **`renderVeRowEdit`** (Danh sách, sửa-1-vé-tại-chỗ) — 2 `<select>` cũ đổi thành 2 nút "📍 Đón:
     .../📍 Trả: ..." (`.edit-diem-btn`), bấm mở `moTinhXaHuyenPicker` với `tinhHienTai` suy từ
     `ve.tinh_len_ma`/`tinh_xuong_ma` hiện có (tra ngược qua `tinhList`) và `tinhBenKiaMa` = tỉnh
     phía CÒN LẠI (đón loại tỉnh đang chọn ở trả, và ngược lại — không cho trùng 1 tỉnh 2 đầu,
     giống `dat-ve.html`). State `lenChon`/`xuongChon` là biến CỤC BỘ trong closure của lần
     `renderVeRowEdit` đó (khác `openVeModal`, xem dưới) — lưu xong ghi cả
     `tinh_len_ma`/`tinh_xuong_ma` LẪN `dia_diem_*_nhan/loai`.
  3. **`openVeModal`** (Sơ đồ, sửa vé ĐÃ ĐẶT — bấm giường đã có `ve`) — cùng pattern nút "📍",
     nhưng state `veModalLenChon`/`veModalXuongChon` là **module-level** (KHÔNG dùng closure cục
     bộ được vì `btn-ve-luu` là listener đăng ký 1 LẦN ở top-level script, không phải mỗi lần mở
     modal) — reset về `null` trong `closeVeModal()`. Nhánh `insert` (tạo mới) trong save handler
     vẫn còn code (dead path — `openVeModal` giờ chỉ gọi khi `ve` đã tồn tại, xem bullet
     `renderMotTang`) nhưng vẫn cập nhật field cho nhất quán, không xoá nhánh đó (ngoài phạm vi
     đợt này).
  - **Modal "Thêm điểm đón/trả mới" (`#diemkhach-modal`, `openDiemKhachModal`,
    `renderDiemKhachTinhOptions`) ĐÃ GỠ BỎ HOÀN TOÀN** (HTML + JS, cả 4 nút "+" trigger) — không
    còn đường tạo `diem_khach` mới từ app. `renderDiemKhachOptions` (dropdown builder cũ) cũng đã
    xoá (hết nơi gọi). **`loadDiemKhachList()`/`diemKhachList`/`tenDiemKhach()` VẪN GIỮ** — dùng
    làm FALLBACK hiển thị cho vé CŨ (`renderVeRowView`'s `tenDiaDiem(ve, vaiTro)`: ưu tiên
    `dia_diem_*_nhan`, fallback `tenDiemKhach(diem_*_id)` nếu vé chưa có field mới).
  - **`loadVeChoChuyen`'s `.select(...)`** thêm `tinh_len_ma`/`tinh_xuong_ma`/`dia_diem_len_nhan`/
    `dia_diem_len_loai`/`dia_diem_xuong_nhan`/`dia_diem_xuong_loai` (giữ `diem_len_id`/
    `diem_xuong_id` cho fallback) — thiếu field nào thì `tenDiaDiem`/nút "📍"/state khôi phục lúc
    sửa sẽ sai/thiếu.

- **`manifest-hang.html`** — bullet "Điểm trả khách chen vào cuối mỗi nhóm tỉnh" (2026-09-16) đổi
  hẳn cách nhóm: TRƯỚC join `ve.diem_xuong_id → diem_khach` rồi nhóm theo `diem_khach.id` (nhiều
  khách cùng 1 điểm gộp lại), GIỜ nhóm THẲNG theo `ve.tinh_xuong_ma` (không qua join gì) — KHÔNG
  còn khái niệm "điểm" để nhóm con bên trong 1 tỉnh nữa, mỗi khách hiện thẳng thành 1 dòng trong
  danh sách chung của tỉnh (`createKhachXuongGroupRow`, đổi tên từ `createDiemXuongRow`), kèm nhãn
  `dia_diem_xuong_nhan` hoặc `"Chưa rõ vị trí cụ thể"` nếu null. Tiêu đề nhóm tỉnh đổi từ
  `"+ N điểm trả khách"` sang `"+ N khách cần trả"` (khớp đúng ý nghĩa mới — đếm khách, không phải
  đếm điểm). Sắp xếp trong tỉnh theo NHÃN xã/huyện (bỏ dấu), khách chưa rõ vị trí cụ thể xuống
  cuối. Vé CŨ (trước 2026-09-21) không có `tinh_xuong_ma` → bị loại khỏi khối này (`if
  (!v.tinh_xuong_ma) return`) — chấp nhận được, dữ liệu lịch sử không có gì để nhóm theo tỉnh.

- **Test bắt buộc đã chạy** — xem cuối phần implementation trong lịch sử phiên làm việc: build
  `data/tinh-xa-huyen.json` đối chiếu đúng bảng tay 17 tỉnh (4 cặp trùng tên: DLK/PYN, DNG/QNM,
  QTR/QBH, NBH/HNM đều gen đúng hậu tố phân biệt); migration verify qua SQL trực tiếp (đủ 4 cột
  mới, đúng check constraint); syntax check `node -e` cho cả 3 file HTML + `node --check` cho
  `api/cong-khai-dat-ve.js` sau MỖI lần sửa lớn.

### Toạ độ điểm giao + km_moc (`km-moc.js`, `data/*.json`)

Mục đích: trong `manifest-hang.html`, sắp xếp thứ tự kiện *bên trong 1 tỉnh* theo đúng thứ tự đi trên đường (tránh xe chạy ngược xuôi khi giao nhiều điểm cùng tỉnh) — dùng `diem.km_moc` (km tích lũy từ Đắk Lắk).

- **KHÔNG bắt GPS lúc tạo điểm** (`hang.html`) — điểm được tạo lúc bốc hàng ở Đắk Lắk, bắt GPS lúc đó sẽ ra toạ độ sai hoàn toàn cho điểm giao ở ngoài Bắc.
- **Bắt GPS lúc bấm "Hoàn thành"** (`manifest-hang.html`, `toggleDaGiao`) — đúng lúc xe đang đứng tại điểm giao. Chỉ bắt khi `diem.lat`/`lng` đang NULL (không ghi đè điểm đã định vị từ lần giao trước), chỉ nhận nếu `pos.coords.accuracy <= 50` (mét). Từ chối quyền/lỗi/timeout/độ chính xác kém → bỏ qua lặng lẽ, không chặn luồng "Hoàn thành" chính, toạ độ bị mất (không lưu tạm) — **quyết định có chủ đích**: `kien.trang_thai` vẫn là UPDATE trực tiếp lên Supabase (cần mạng, giống code cũ), phần GPS/km_moc KHÔNG đi qua `idb-queue.js` (việc mở rộng hàng đợi offline cho "cập nhật bản ghi đã tồn tại" bị cất lại, xem TODO bên dưới) — nếu bước update `trang_thai` thất bại vì mất mạng, giữ nguyên hành vi lỗi hiện tại, toạ độ GPS vừa bắt bị bỏ luôn.
- `diemMap` trong `loadManifest` gộp mọi kiện cùng `diem_id` về chung 1 object — bắt/sửa toạ độ 1 lần thì mọi dòng kiện cùng điểm trong phiên hiện tại tự thấy giá trị mới, tránh xin quyền GPS lặp lại.
- `tinhKmMoc(lat, lng, tinhMa, tuyenChuan, tinhKmRange)` (`km-moc.js`) — nearest-neighbor thuần nhưng **giới hạn tìm kiếm theo `tinh_ma` đã biết** (qua `data/tinh_km_range.json`) để tránh nhảy nhầm sang đoạn tuyến khác xa hàng trăm km (đèo, khúc cua, vòng qua thành phố). `data/tuyen_chuan_bactien.json` là tuyến chuẩn rút gọn (2644 điểm `{lat,lng,km}`, ~500m/điểm) tính từ GPX thật — dùng chung cho cả 2 chiều, `sapXepTrongTinh(dsKien, chieu)` chỉ đảo ASC/DESC theo `chieu`, null luôn xuống cuối bất kể chiều.
- 2 file JSON tĩnh nạp qua `fetch()` (không nhúng vào JS), có trong `STATIC_ASSETS` của `sw.js` cùng các asset khác (HTML/CSS/JS chính của app) — xem bullet Service Worker riêng bên dưới.

### Service Worker (`sw.js`) — đăng ký 2026-09-14

- **`navigator.serviceWorker.register('/sw.js')`** giờ có ở CẢ 5 trang HTML (`login.html`, `hang.html`, `manifest-hang.html`, `lich-su-chuyen.html`, `auth-callback.html`) — script cuối `<body>` mỗi trang, gọi trong `window.addEventListener('load', ...)`, lỗi chỉ log không chặn gì. Trước đó `sw.js` tồn tại nhưng KHÔNG được register ở đâu — PWA installable chưa hoạt động đúng dù đã có `manifest.json` (Chrome cần active service worker mới coi app "installable").
- **Fix quan trọng TRƯỚC khi bật đăng ký (phát hiện lúc review, không phải lỗi có sẵn từ trước)**: fetch handler trong `sw.js` ban đầu dùng **cache-first** cho mọi request không phải navigate — nghĩa là `style.css`/`idb-queue.js`/`km-moc.js`/2 file JSON (đều nằm trong `STATIC_ASSETS`, bị cache ngay lúc `install`) sẽ **kẹt vĩnh viễn ở bản cũ** qua mọi lần deploy sau, vì cache không tự invalidate nếu `CACHE_NAME` không đổi — nếu đăng ký nguyên trạng, crew sẽ thấy bug thật "code đã deploy bản mới nhưng app vẫn chạy bản cũ", rất khó debug vì nhìn ngoài như deploy thành công. Đã sửa: fetch handler đổi sang **network-first cho MỌI request cùng-origin** (không chỉ navigate) — luôn fetch bản mới khi có mạng, chỉ rơi về cache đã lưu lúc offline. `CACHE_NAME` cũng bump `v1` → `v2` cùng lúc để dọn sạch cache cũ (nếu có) từ trước khi sửa.
- **Chưa test thật trên thiết bị** (Android Chrome, DevTools Application → Service Workers) — cần crew/owner tự kiểm tra: (1) nút cài đặt PWA/"Thêm vào màn hình chính" tạo được app standalone thật; (2) SW ở trạng thái "activated and running", không lỗi; (3) tắt mạng vẫn dùng được (offline-first IndexedDB hiện có không phụ thuộc SW, chỉ cần xác nhận SW không phá luồng đó); (4) sau khi sửa `sw.js`/deploy tiếp, xác nhận KHÔNG bị kẹt cache cũ (đúng mục tiêu của fix network-first ở trên).
- **TODO cất lại cho sau (Phương án B)**: làm "Hoàn thành" chạy offline-first hoàn toàn (cả `trang_thai` lẫn toạ độ) — cần mở rộng `idb-queue.js` với khái niệm "cập nhật bản ghi đã tồn tại" (hiện chỉ có tạo mới), nạp `idb-queue.js` + gọi `setupQueueAutoSync` trong `manifest-hang.html` (hiện chưa nạp), và UI hiển thị trạng thái "chờ đồng bộ". Khối lượng việc lớn hơn đáng kể so với phạm vi ban đầu nên tách riêng.

## Database (đối chiếu `eakar_hang_v1.sql`)

```
tinh_tuyen (ma text PK, ten, ten_moi, thu_tu smallint, gia_moc numeric)
           -- gia_moc: thêm sau v1 (alter table, 2026-09-19), nullable, đơn vị đồng — mốc giá riêng
           -- từng tỉnh, giá vé = |gia_moc(tỉnh đến) − gia_moc(tỉnh đi)| (xem mục "Bảng giá theo
           -- tỉnh"). Sửa qua modal "💰 Giá vé theo tỉnh" ở khach.html, KHÔNG có UI ở hang.html/
           -- manifest-hang.html.
diem       (id uuid PK, ten, ten_norm, tinh_ma FK -> tinh_tuyen.ma,
            huyen_cu, lat, lng, km_moc, so_lan_giao, created_at)
           -- UNIQUE(tinh_ma, ten_norm): DB tự chặn trùng điểm trong cùng tỉnh
           -- ten_norm = boDau(ten), tính ở client khi insert (point-match.js)
chuyen     (id uuid PK, chieu 'bac'|'nam', khoi_hanh, trang_thai 'dang_chay'|'xong',
            ghi_chu, tao_boi default auth.uid(), created_at)
           -- tao_boi KHÔNG gửi từ client, để DB default tự điền
kien       (id uuid PK — CLIENT TỰ SINH qua crypto.randomUUID() để offline-first,
            chuyen_id FK -> chuyen.id, diem_id FK -> diem.id,
            anh_path, anh_url, nguoi_nhan_sdt, nguoi_gui_sdt, trang_thai 'chua_giao'|'da_giao'|'huy'|'tra_lai',
            ghi_chu, so_luong int, loai_hang text, tien_thu numeric, hinh_thuc_thu text, tien_thu_ho numeric,
            kien_goc_id uuid null references kien(id), created_at)
           -- trang_thai 'huy': thêm sau v1 (alter constraint kien_trang_thai_check) — hủy hẳn 1
           -- kiện vì khách đổi ý không gửi nữa, set qua nút "Hủy đơn" trong menu "⋯" ở
           -- manifest-hang.html (chỉ hiện khi 'chua_giao', khác "Hủy giao" chỉ đảo chua_giao/
           -- da_giao qua lại). KHÔNG xoá bản ghi, chỉ ẩn khỏi manifest + mọi tổng tiền/COD qua
           -- filter ở query nguồn (manifest-hang.html loadManifest, lich-su-chuyen.html) — xem
           -- ngay dưới, filter này giờ loại CẢ 'huy' lẫn 'tra_lai'. Không có UI khôi phục — cần
           -- thì sửa tay qua Supabase dashboard.
           -- trang_thai 'tra_lai': thêm sau v1 (cùng alter constraint với 'huy') — crew đã tới
           -- điểm giao nhưng KHÔNG giao được (người nhận từ chối/không liên lạc được), khác hẳn
           -- 'huy' (huy = hàng chưa từng rời điểm gửi; tra_lai = hàng đã đi hết tuyến, phải
           -- mang NGƯỢC LẠI trên chuyến chiều đối diện). Set qua nút "↩️ Trả hàng" trong menu
           -- "⋯" ở manifest-hang.html (`traHang`, chỉ hiện khi 'chua_giao', cùng pattern với
           -- `huyDon`: UPDATE rồi refetch `loadManifest` toàn bộ). **VẪN hiện trong danh sách
           -- kiện của chuyến đó** (KHÔNG bị ẩn/biến mất như 'huy') — hiện dưới dạng badge
           -- "Hàng hoàn" riêng (`.badge.tra_lai`, nền be `#e9e2d6`) + nền dòng riêng
           -- (`.kien-row-tra-lai`, `#f2ede6`) để phân biệt trực quan với "Chưa giao"/"Đã giao",
           -- xem `renderKienRowView` ở manifest-hang.html — vì crew cần thấy lại kiện này trong
           -- đúng chuyến đã trả để biết còn phải mang về, không phải chỉ audit qua Supabase
           -- dashboard. Chỉ `trang_thai 'huy'` mới bị loại khỏi `loadManifest`
           -- (`.neq('trang_thai', 'huy')`) — 'tra_lai' được fetch bình thường. Loại khỏi
           -- `renderCodSummary`/badge COD (hàng đã hoàn không còn khả năng thu) và khỏi điều
           -- kiện bắt buộc của nút "Kết thúc chuyến" (`updateEndTripButton` coi `tra_lai` là đã
           -- xử lý xong, không chặn như `chua_giao`) — nhưng `lich-su-chuyen.html` vẫn loại
           -- `tra_lai` khỏi tổng "Đã thu"/đếm kiện (`.not('trang_thai', 'in', '(huy,tra_lai)')`)
           -- vì đó là tổng hợp cấp chuyến, không phải danh sách kiện chi tiết. Có nút "↺ Khôi
           -- phục (bỏ trả hàng)" trong menu "⋯" (`khoiPhucTraLai`) để đảo ngược về `chua_giao`
           -- nếu bấm nhầm. KHÔNG có cơ chế tự động chuyển kiện qua chuyến
           -- ngược lại — khi chuyến chiều đối diện chạy, crew tự tạo kiện MỚI ở `hang.html` như
           -- luồng bình thường (điểm đến Đắk Lắk đã có sẵn trong danh sách chọn tỉnh ở chiều
           -- `nam`). KHÔNG giới hạn cứng số lần thử liên lạc trước khi được phép "Trả hàng" (quyết định
           -- nghiệp vụ: để crew tự quyết định) — app chỉ hỗ trợ ghi log qua nút "📞 Ghi nhận đã
           -- gọi" (append dòng `"[HH:mm dd/MM] Thử liên lạc - không nghe máy"` vào `ghi_chu` hiện
           -- có, KHÔNG ghi đè, KHÔNG thêm cột DB riêng) — `demSoLanThuLienLac(ghi_chu)` (khớp
           -- đúng cụm "Thử liên lạc", KHÔNG PHẢI mọi dòng bắt đầu bằng `[` — sửa bug 2026-09-22,
           -- xem bullet `ghiNhanDaGoi` ở mục Pages) chỉ còn dùng để quyết định cảnh báo mềm
           -- trong `confirmDialog` của `traHang` nếu N = 0, vẫn cho tiếp tục nếu crew xác nhận —
           -- KHÔNG có badge nào hiện số lần gọi cạnh SĐT ở `renderKienRowView` (đã bị gỡ, xem
           -- bullet đó).
           -- kien_goc_id: thêm sau v1 (alter table), nullable, tự tham chiếu `kien(id)` — Ý ĐỊNH
           -- BAN ĐẦU là đánh dấu 1 kiện "mang hàng trả về" ứng với 1 kiện `tra_lai` cụ thể, qua
           -- nút "🔗 Liên kết kiện trả lại" ở `hang.html` bước 3. **UI này ĐÃ BỊ GỠ BỎ theo yêu
           -- cầu** (không dùng nữa, phát sinh thêm 1 bước phụ trợ không cần thiết trong luồng nhập
           -- kiện chính) — cột `kien_goc_id` vẫn còn trong schema (không rollback migration) và
           -- `kien.trang_thai = 'tra_lai'`/`traHang`/`khoiPhucTraLai` vẫn hoạt động bình thường,
           -- CHỈ riêng đường ghi giá trị cho `kien_goc_id` từ `hang.html` không còn tồn tại — cột
           -- này giờ luôn `null` cho kiện mới, chỉ có thể set tay qua Supabase dashboard nếu thật
           -- sự cần audit liên kết trả về sau này.
           -- tien_thu: thêm sau v1 (alter table), nullable — số tiền THỰC thu, CÓ 2 ĐƯỜNG GHI:
           -- (1) nhập ở "Hoàn thành"/"Sửa tiền" tại manifest-hang.html khi giao xong (cách gốc),
           -- (2) nhập ở nút "Đã thu cước" tại hang.html bước 3 khi khách trả cước ngay lúc gửi
           -- (CÓ trong idb-queue.js qua đường này) — cùng 1 cột, chỉ khác thời điểm/nơi ghi,
           -- không phải 2 loại tiền khác nhau. Nếu đã có giá trị từ đường (2) thì toggleDaGiao
           -- bỏ qua bước hỏi lại tiền lúc giao (xem bullet toggleDaGiao ở manifest-hang.html)
           -- hinh_thuc_thu: thêm sau v1 (alter table), nullable, 'tien_mat'|'chuyen_khoan' — ghi
           -- lại hình thức thu tiền, chọn bằng cách bấm 1 trong 2 nút khi lưu tiền thu ở
           -- manifest-hang.html (renderKienRowThuTien, thay cho nút "Lưu" chung chung trước đây)
           -- tien_thu_ho: thêm sau v1 (alter table), nullable — số tiền CẦN thu hộ (COD) do
           -- người gửi yêu cầu, nhập lúc chụp ảnh ở hang.html (bước 3), CÓ trong idb-queue.js
           -- so_luong: thêm sau v1 (alter table), default 1 — số lượng kiện trong 1 bản ghi
           -- (vd 1 khách gửi 3 thùng cùng điểm/cùng lúc), nhập bằng stepper +/- ở hang.html
           -- (bước 3), CÓ trong idb-queue.js. Không phải "số lần giao" (đó là diem.so_lan_giao)
           -- loai_hang: thêm sau v1 (alter table), nullable, text tự do (KHÔNG check constraint,
           -- KHÔNG bảng danh mục riêng) — CHUỖI ĐÃ RENDER SẴN liệt kê từng loại + số lượng
           -- riêng, vd "Thùng giấy ×2, Thùng xốp ×3" (không phải JSON, không phải 1 loại duy
           -- nhất) — build ở client từ mảng loaiHangItems, xem bullet "Số lượng / Loại hàng"
           -- ở hang.html bước 3, CÓ trong idb-queue.js. so_luong đi kèm luôn là TỔNG cộng dồn
           -- mọi loại trong chuỗi này, không phải số lượng của riêng 1 loại.
           -- nguoi_gui_sdt: thêm sau v1 (alter table, 2026-09-12), nullable, text — SĐT NGƯỜI GỬI,
           -- KHÁC nguoi_nhan_sdt (dùng để giao hàng) — owner xác nhận đây là dữ liệu khách hàng
           -- tiềm năng có giá trị lâu dài (đối tượng đúng để chủ động liên hệ lại sau này), độ
           -- chính xác quan trọng hơn vì sai số nằm ÂM THẦM trong DB, không ai phát hiện tới khi
           -- thật sự gọi lại. Nhập tay ở hang.html bước 3 (#kien-nguoi-gui-sdt, CÓ trong
           -- idb-queue.js) hoặc gợi ý bởi AI đọc ảnh (api/doi-chieu-sdt.js, cả 3 nhánh gọi) —
           -- NGUYÊN TẮC CỐT LÕI khác hẳn nguoi_nhan_sdt: KHÔNG BAO GIỜ có cơ chế tự động ghi
           -- thẳng DB (không có "⚡ Điền tất cả" cho field này), chỉ gợi ý ở manifest-hang.html
           -- (khối "📇 SĐT người gửi AI gợi ý"), luôn cần crew xác nhận bằng mắt qua nút "Sửa"
           -- (renderKienRowEdit) trước khi lưu. Xem bullet chi tiết ở mục "Chưa làm" (AI/OCR).
```

- Trigger DB: insert vào `kien` tự +1 `diem.so_lan_giao` — app không tự cộng tay.
- **RLS: BẬT trên cả 4 bảng gốc + 3 bảng module hành khách (`giuong`/`diem_khach`/`ve`, thêm 2026-09-14), policy allow-all cho role `authenticated`** (`using (true) with check (true)`, riêng `giuong`/`tinh_tuyen` chỉ có policy `SELECT` vì đó là dữ liệu tĩnh không cần ghi từ client). **Sửa lại ghi chú cũ (đã sai)**: từng ghi "RLS disabled" ở đây — tra thực tế trên Supabase (2026-09-14) thì RLS đã BẬT từ trước, chỉ là policy allow-all khiến hành vi ngoài giống hệt "disabled" đối với user đã đăng nhập (nhưng CHẶN đúng nghĩa mọi truy vấn ẩn danh/chưa đăng nhập, khác thật với tắt hẳn RLS) — không rõ khi nào ghi chú cũ bị lệch so với DB thật, cẩn thận `list_tables`/`pg_policies` để xác minh lại trước khi dựa vào tài liệu nếu nghi ngờ.

## Storage

Bucket `kien` (Public). Path: `{kien.id}.jpg`. `idb-queue.js` upload khi đồng bộ, set `anh_path`/`anh_url`.

- **Public bucket chỉ cấp quyền đọc (SELECT), không tự cấp ghi.** `storage.objects` luôn tự có RLS riêng, độc lập với quyết định "RLS disabled" ở 4 bảng app phía trên. Muốn `sb.storage.from('kien').upload(...)` chạy được từ client phải tạo thêm Storage Policy cho phép INSERT/UPDATE (role `authenticated`, `bucket_id = 'kien'`) — thiếu bước này thì upload throw lỗi, kéo theo cả record `kien` không insert được (xem `trySyncQueue` bên dưới).

## Offline write-queue (`idb-queue.js`)

IndexedDB store `kien_queue`, keyPath `id`. `hang.html` luôn ghi vào đây trước (không insert thẳng Supabase), rồi gọi `trySyncQueue(sb)` — upload ảnh + upsert `kien`, đánh dấu `da_sync=true` khi xong. Tự sync khi có event `online` + fallback interval 30s (`setupQueueAutoSync`).

## Env / Vercel

- Supabase project **`van-tai-hanh-khach`** (ref `ycifioonjzrdasofdmjb`) — khác project `eakar-logistics`. `SUPABASE_URL`/`SUPABASE_ANON_KEY` đã điền trong `shared.js`.
- Vercel env (KHÔNG lộ ra client): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (secret key `sb_secret_...`, dùng trong `api/zalo-callback.js` để gọi Admin API), `ZALO_APP_ID`, `ZALO_APP_SECRET`, `DASHSCOPE_API_KEY` (Alibaba Cloud Model Studio, dùng trong `api/doi-chieu-sdt.js` — **đã set ở scope Production**, 2026-09-09).
- Google Client ID/Secret nằm trong Supabase Dashboard (Authentication → Providers), không cần set ở Vercel.

## Chưa làm (theo kế hoạch v1)

- `diem-quan-ly.html` — màn quản lý/seed điểm ngoài luồng nhập kiện
- Không giá vé/cước hàng, không sơ đồ ghế/khách, không chia doanh thu crew
- **AI/OCR đọc ảnh: chủ trương "không dùng" ĐÃ BỊ ĐẢO NGƯỢC** (quyết định owner, thay cho dòng cấm tuyệt đối trước đây), qua 2 giai đoạn: (1) **đối chiếu SĐT người nhận** — `api/doi-chieu-sdt.js` mode `compare` + nút "🔍 Đối chiếu SĐT bằng AI" ở `manifest-hang.html`, chỉ so khớp số ĐÃ CÓ SẴN trong DB, kích hoạt theo yêu cầu (crew chủ động bấm nút); (2) **AI TỰ ĐỌC VÀ ĐIỀN SĐT ngay lúc chụp ảnh** — `api/doi-chieu-sdt.js` mode `read` + `tryAutoReadSdt` ở `hang.html` bước 3 (**ĐÃ TRIỂN KHAI**, 2026-09-10), tự động cho MỌI kiện có ảnh, không cần crew bấm gì — mở rộng phạm vi so với (1), owner đã xác nhận riêng lần 2 (xem bullet chi tiết ở mục Pages, `hang.html`). SĐT gõ tay (`#kien-sdt`) vẫn KHÔNG bắt buộc thay đổi luồng gõ tay gốc — AI chỉ tự điền nếu ô đang trống, crew luôn xem/sửa/xoá tay được. KHÔNG phải OCR toàn diện thay thế nhập tay, KHÔNG áp dụng cho việc gì khác ngoài phạm vi SĐT người nhận. Ảnh + SĐT (dữ liệu cá nhân) được gửi cho AI provider bên thứ 3 (Alibaba Cloud/DashScope) — ban đầu chỉ khi crew bấm nút đối chiếu hàng loạt, giờ THÊM cả mỗi lần chụp ảnh 1 kiện (tự động) — không giới hạn/không cache ở cả 2 luồng, đánh đổi owner đã xác nhận chấp nhận cho cả 2 lần mở rộng. Xem bullet riêng ở mục Pages (`manifest-hang.html` cho mode `compare`, `hang.html` cho mode `read`) để biết chi tiết cách hoạt động.
  - **Đã test end-to-end trên production (2026-09-09)** bằng `curl` thẳng vào `/api/doi-chieu-sdt` (chưa qua UI, chỉ test tầng API + kết nối DashScope) — cả 3 nhánh đều đúng: đọc đúng số + báo lệch khi gõ sai (`khop:false`), đọc đúng số + chuẩn hóa đúng trường hợp `+84 0912345678` viết dư số `0` so với gõ tay `0912345678` (xác nhận bug double-zero đã sửa hoạt động đúng với dữ liệu thật, không chỉ đúng trên test giả lập), và báo đúng "không đọc được" khi ảnh không có số. Dùng ảnh test sinh bằng `dummyimage.com` (chữ in, không phải viết tay) — **CHƯA test với ảnh chữ viết tay thật** (chưa có kiện nào trong DB có `anh_url` để lấy mẫu thật), vẫn là việc cần làm trước khi tin dùng kết quả đối chiếu cho vận hành thật, xem "Test khi xong" ở lịch sử spec.
  - **Latency đo được: ~2s/ảnh** (gọi tuần tự, batch 3 ảnh mất ~6s tổng) — với `BATCH_SIZE = 3` hiện tại, 1 lần gọi API route mất ~6s, vẫn nằm trong ngưỡng an toàn dù chưa xác minh Fluid Compute có bật hay không. Có thể cân nhắc tăng `BATCH_SIZE` sau khi có thêm dữ liệu latency với ảnh thật (thường nặng hơn ảnh test dummy, có thể chậm hơn).
  - Từng debug 1 lỗi lúc test: dùng thẳng URL ảnh Wikipedia (`upload.wikimedia.org/.../thumb/...`) làm `anh_url` test bị DashScope từ chối tải (`InvalidParameter.DataInspection: Unable to download the media resource`) — không phải lỗi code, do nguồn ảnh đó không tải được từ phía DashScope (có thể chặn bot/thiếu header). Ảnh thật từ bucket Storage `kien` (Public, `anh_url` dạng `https://ycifioonjzrdasofdmjb.supabase.co/storage/v1/object/public/kien/...`) chưa gặp vấn đề này khi test nhưng cũng CHƯA test trực tiếp — nếu sau này gặp lỗi `InvalidParameter.DataInspection` với ảnh thật, kiểm tra lại nguồn ảnh trước khi nghi code. Đã thêm log lỗi chi tiết (`console.error` kèm body response DashScope, xem Vercel function logs) vào `catch` trong `api/doi-chieu-sdt.js` để debug nhanh hơn lần sau, thay vì chỉ có `loi: true` không rõ nguyên nhân trả về client.
  - **3 lớp phòng vệ độ tin cậy thêm vào sau khi test ảnh thật (2026-09-10)** — 2 vấn đề thật phát hiện lúc test batch trên production: (1) cùng 1 ảnh gọi 2 lần (`hang.html` lúc chụp vs `manifest-hang.html` lúc đối chiếu hàng loạt) ra 2 SỐ KHÁC NHAU — dấu hiệu model chạy với `temperature` mặc định > 0 (sampling ngẫu nhiên), không phải lỗi code; (2) model trả về 1 chuỗi 13 chữ số (không thể là SĐT VN) nhưng vẫn lọt ra UI như gợi ý hợp lệ — thiếu validate định dạng, không phải lỗi model. Sửa cả 3 lớp trong `docSdtTuAnh`/`docSdtTinCay` (`api/doi-chieu-sdt.js`), áp dụng cho CẢ 3 nhánh gọi (`read` đơn ảnh, `read` theo lô, `compare`) vì validate ở server bảo vệ được cả nhánh gọi thẳng từ `hang.html`:
    1. **`temperature: 0`** trong request DashScope — không đảm bảo đọc ĐÚNG, chỉ đảm bảo đọc NHẤT QUÁN (cùng 1 ảnh nhiều lần ra cùng 1 kết quả), cần thiết để lớp 3 có ý nghĩa.
    2. **`laSdtHopLe(daChuanHoa)`** — regex `^0(3|5|7|8|9)\d{8}$` (đúng 10 số, đầu số di động VN hợp lệ) chạy NGAY sau `chuanHoaSdt()` bên trong `docSdtTuAnh`, trước khi trả kết quả ra ngoài — không khớp → LUÔN coi như `khong_doc_duoc: true` bất kể model "tự tin" trả về gì, không có đường nào để 1 chuỗi sai định dạng lọt ra ngoài hàm này.
    3. **`docSdtTinCay(imageUrl, apiKey, timeoutMs)`** — gọi `docSdtTuAnh` **2 LẦN song song** (`Promise.all`) cho CÙNG 1 ảnh, so kết quả: cả 2 khớp nhau → trả `{sdt_ai_doc}` bình thường (đáng tin hơn hẳn 1 lần gọi đơn, đặc biệt sau khi đã có `temperature: 0`); lệch nhau (kể cả trường hợp chỉ 1 trong 2 lần đọc ra số hợp lệ) → trả `{khong_chac: true, sdt_lan_1, sdt_lan_2}`, KHÔNG tự chọn liều 1 bên. Chi phí tăng gấp đôi (~$0.0003/ảnh thay vì $0.00015) nhưng không đáng kể so với lợi ích. Cả 3 nhánh gọi trong `handler()` đều gọi qua `docSdtTinCay` thay vì gọi thẳng `docSdtTuAnh`.
    - **Prompt cũng đổi** — thêm ràng buộc cụ thể (10 số, đầu số 03/05/07/08/09, liệt kê rõ các cặp chữ số viết tay dễ nhầm `3↔8`, `4↔9`, `1↔7`, `0↔6`, dặn không "làm tròn" số mơ hồ thành số nghe hợp lý) thay cho prompt chung chung "đọc số điện thoại" ban đầu — giảm tỷ lệ model tự bịa số khi chữ mờ, nhưng KHÔNG thay thế lớp validate/self-consistency ở trên (model vẫn có thể "tự tin" sai).
    - **`khong_chac` lan ra UI ở cả `hang.html` và `manifest-hang.html`**: `hang.html`'s `tryAutoReadSdt` coi `khong_chac` như `khong_doc_duoc`/`loi` — im lặng bỏ qua, không điền (guard có sẵn `!data.sdt_ai_doc` đã tự động loại vì response `khong_chac` không có field `sdt_ai_doc`, không cần sửa thêm). `manifest-hang.html`'s `chayDoiChieuSdt` thêm khối thứ 3 "🤔 M kiện AI đọc không chắc — cần xem ảnh gốc" (class `.sdt-goi-y`, hiện cả `sdt_lan_1`/`sdt_lan_2`), nút "Sửa" (không prefill, dùng lại `.btn-sua-lech` — 2 giá trị xung đột nên không tự chọn 1 bên để điền sẵn, giống cách xử lý khối "lệch"). Ở `mode: 'compare'`, `khong_chac` được gộp luôn vào khối "⚠️ lệch" hiện có (set `khop: false`) thay vì tách khối riêng — vì bản chất cũng là "không nên tin số này", chỉ khác nhãn hiển thị (`Không chắc (x / y)` thay vì `AI đọc: x`).
  - **SĐT người gửi (`kien.nguoi_gui_sdt`) — dữ liệu khách hàng tiềm năng, thêm 2026-09-12.** Owner xác nhận SĐT người gửi có giá trị lâu dài (đối tượng đúng để chủ động liên hệ lại sau này, không phải chỉ phục vụ giao hàng) — độ chính xác quan trọng hơn SĐT người nhận vì sai số nằm ÂM THẦM trong DB, không ai phát hiện cho tới khi thật sự gọi lại (có thể nhiều tháng sau). **Nguyên tắc cốt lõi, KHÁC HẲN `nguoi_nhan_sdt`: KHÔNG BAO GIỜ tự động ghi thẳng DB, chỉ gợi ý, luôn cần crew xác nhận bằng mắt qua nút "Sửa"** — không có phiên bản "⚡ Điền tất cả" cho field này.
    - **`api/doi-chieu-sdt.js` response shape đổi hẳn** — không còn `sdt_ai_doc`/`khop`/`khong_doc_duoc`/`khong_chac` phẳng ở gốc, giờ lồng theo vai trò: `{ nguoi_nhan: <role-result>, nguoi_gui: <role-result> }`, `<role-result>` là 1 trong `{sdt_ai_doc}` / `{khong_doc_duoc:true}` / `{khong_chac:true, sdt_lan_1, sdt_lan_2}` — giữ nguyên 3 dạng cũ, chỉ khác chỗ lồng. Chỉ `nguoi_nhan` có thêm `khop` (từ `mode: 'compare'`, so với `sdt_da_nhap`) — `nguoi_gui` không có gì để so nhưng **vẫn luôn được đọc + trả về ở CẢ 3 nhánh gọi kể cả `compare`** (quyết định quan trọng: đa số kiện thật đã có sẵn `nguoi_nhan_sdt` nên đi qua nhánh `compare`, nếu nhánh này bỏ dữ liệu người gửi thì tính năng chỉ có tác dụng cho thiểu số kiện thiếu hẳn SĐT người nhận).
    - **Prompt đổi sang yêu cầu model trả đúng 2 dòng cố định** (`NGUOI_GUI: ...`/`NGUOI_NHAN: ...`, giá trị là 10 số hoặc `KHONG_XAC_DINH`) thay vì 1 sentinel đơn `KHONG_DOC_DUOC` — chọn format 2-dòng-cố-định thay vì JSON để giảm rủi ro model chèn markdown/giải thích thừa. **CHƯA test format này trên ảnh thật ở quy mô lớn** — cần theo dõi qua Vercel function logs/kết quả thực tế xem model có tuân thủ đúng 2 dòng ổn định như sentinel đơn cũ hay không.
    - **Luật gán vai trò phân biệt rõ 3 tình huống (sửa 2026-09-13, sau khi phát hiện thụt lùi so với hành vi trước 12/9)**: (1) có nhãn chữ rõ ("Gửi"/"Người gửi"/"Nhận"/"Người nhận"...) → luôn gán theo đúng nhãn, không suy diễn thêm; (2) **CHỈ có ĐÚNG 1 số trên ảnh, không nhãn** → mặc định gán là `NGUOI_NHAN` (`NGUOI_GUI: KHONG_XAC_DINH`), vì thực tế đa số nhãn dán kiện hàng chỉ ghi 1 số để gọi lúc giao; (3) **từ 2 số trở lên, không nhãn phân biệt rõ số nào của ai** → cả 2 dòng đều `KHONG_XAC_DINH`, TUYỆT ĐỐI không đoán theo vị trí/thứ tự viết (gán nhầm vai trò nguy hiểm hơn không đọc được số). Luật ban đầu (trước bản sửa này) gộp chung case (2) và (3) vào 1 luật "không nhãn → không đoán", khiến ảnh chỉ có 1 số không nhãn (đa số nhãn thật của tuyến này) bị chặn oan thành `KHONG_XAC_DINH` cho cả 2 vai trò — thụt lùi so với hành vi trước khi có tính năng người gửi (12/9), lúc đó ảnh 1-số-không-nhãn luôn được đọc đúng thành SĐT người nhận. Chỉ sửa nguyên văn prompt trong `docSdtTuAnh`, không đổi format output/`laSdtHopLe`/`docSdtTinCay` (self-consistency per-vai-trò áp dụng tự nhiên cho case 1-số này, không cần sửa thêm).
    - **Test thật đầu tiên (2026-09-13, ảnh có nhãn "Người gửi"/"Người nhận" rõ ràng viết tay)** — model gán ĐÚNG vai trò cho cả 2 số (không phải bug gán nhầm vai trò như lo ngại ở trên), nhưng SĐT người gửi vẫn không tự điền vì **model đọc THỪA 1 chữ số**: số thật `0972156414` (10 số) bị đọc thành `09721564141` (11 số) — cả 2 lần gọi self-consistency ra CÙNG kết quả sai này (deterministic do `temperature: 0`), nên không rơi vào `khong_chac`, mà bị `laSdtHopLe()` (đòi đúng 10 số) chặn lại thành `khong_doc_duoc` — **lớp validate hoạt động đúng thiết kế** (thà không điền còn hơn điền sai), KHÔNG PHẢI bug code, KHÔNG PHẢI bug prompt over-cautious. Đây là 1 dạng lỗi OCR viết tay CHƯA lường trước trong thiết kế self-consistency ban đầu: 2 lần gọi model **lệch giống nhau** (cùng đọc sai theo 1 kiểu) thay vì lệch khác nhau — self-consistency vốn chỉ bắt được trường hợp 2 lần gọi ra kết quả KHÁC NHAU, không bắt được trường hợp cả 2 lần cùng sai giống hệt. Debug bằng cách thêm tạm `console.error('[DEBUG raw model output]', raw)` trong `docSdtTuAnh` trước khi parse, xem qua `vercel logs`, đã xoá sau khi xác định xong nguyên nhân. **CHƯA sửa gì** (đúng theo spec debug đã chốt: đổi ngưỡng self-consistency phải bàn trước, liên quan trực tiếp nguyên tắc "sai số người gửi âm thầm hại hơn").
    - `docSdtTinCay` áp dụng self-consistency (gọi model 2 lần) **ĐỘC LẬP cho từng vai trò** (`gopKetQuaVaiTro`) — người nhận có thể thống nhất giữa 2 lần gọi trong khi người gửi không (hoặc ngược lại), mỗi vai trò tự có trạng thái tin cậy riêng.
    - **`hang.html`**: thêm ô `#kien-nguoi-gui-sdt` cạnh `#kien-sdt` (không bắt buộc, cùng mức với ô người nhận), hint riêng `#nguoi-gui-sdt-ai-hint`. `tryAutoReadSdt` gọi chung 1 request API rồi áp dụng kết quả cho CẢ 2 ô độc lập qua hàm `apDungKetQuaVaiTro` (mỗi ô tự kiểm tra: đã có giá trị thì không ghi đè, dùng chung `kienSessionToken` guard, không cần token riêng). Field mới đi qua đúng các điểm mà `nguoi_nhan_sdt` đã đi qua trước đó, PHẢI đồng bộ ở TẤT CẢ (rà soát khi thêm field mới tương tự sau này nhớ check đủ cả 6 chỗ, từng bị bỏ sót khi làm feature này — đây là "1 loại lỗi lặp lại nhiều lần" đáng lưu ý cho lần sau): object `record` khi build (trước `queueKien`), khối liệt kê field trong `trySyncQueue` (`idb-queue.js` — KHÔNG spread nguyên `rec`, liệt kê tên tay, dễ quên field mới nhất im lặng không tới DB), snapshot `lastSaved` (dùng cho "← Sửa lại kiện này" — quên chỗ này thì MẤT DATA THẬT vì kiện cũ đã bị xoá trước khi restore form), và `renderReviewCard`.
    - **`manifest-hang.html`**: `loadManifest`'s `.select(...)` và `chayDoiChieuSdt`'s `.select(...)` đều cần có `nguoi_gui_sdt` (2 query riêng biệt, không dùng chung) — thiếu 1 trong 2 thì field luôn `undefined` ở đúng nửa còn lại của trang. `renderKienRowView` hiện thêm 1 dòng phụ (không nổi bật như SĐT người nhận). `renderKienRowEdit` thêm ô `.edit-gui-sdt`, `.update({...})` VÀ gán lại `k.nguoi_gui_sdt` sau khi lưu (2 bước, thiếu bước gán lại thì UI hiện sai cho tới khi reload dù DB đã đúng). `traHang` (tách kiện `so_luong > 1`) copy `nguoi_gui_sdt` sang kiện tách, giống `nguoi_nhan_sdt` (khác `hinh_thuc_thu` — cố ý không copy, xem mục Database). `chayDoiChieuSdt` build thêm khối "📇 N SĐT người gửi AI gợi ý" (class `.sdt-goi-y`, đọc gộp từ CẢ `ketQuaCompare` lẫn `ketQuaRead`, lọc theo `r.nguoi_gui.sdt_ai_doc` + kiện `k.nguoi_gui_sdt` đang trống) — nút "Sửa" dùng lại `.btn-sua-lech`/`moFormSua` sẵn có (mở `renderKienRowEdit`), **không có nút gộp tự động ghi** như khối "🆕 thiếu SĐT" của người nhận.
    - **NGOẠI LỆ DUY NHẤT cho phép tự động ghi `nguoi_gui_sdt`: lúc bấm "🏁 Kết thúc chuyến"** (2026-09-13, quyết định owner) — handler `#btn-ket-thuc-chuyen` chèn 1 bước quét ngầm NGAY SAU `confirmDialog()`, TRƯỚC `UPDATE chuyen.trang_thai = 'xong'`: lấy kiện của chuyến còn thiếu `nguoi_gui_sdt` (cùng bộ lọc `chayDoiChieuSdt`), gọi `api/doi-chieu-sdt.js` theo lô (`mode: 'read'`, không cần `compare` vì không so khớp gì), ghi thẳng `UPDATE ... WHERE nguoi_gui_sdt IS NULL` (giữ guard chống ghi đè crew vừa gõ tay) cho kiện đọc được hợp lệ, append audit RIÊNG BIỆT `"...lúc kết thúc chuyến..."` (khác câu chữ audit của "⚡ Điền tất cả" người nhận, để truy đúng nguồn gốc/thời điểm sau này). Nút đổi label + `disabled=true` lúc quét, **khôi phục lại TRƯỚC KHI** gọi `UPDATE trang_thai` (không phải sau) — để nếu bước đó lỗi, nút vẫn về trạng thái bấm lại được bình thường thay vì kẹt label "Đang kiểm tra...". Lỗi ở bước quét (API/mạng) → log, bỏ qua, KHÔNG chặn việc kết thúc chuyến. **QUAN TRỌNG — bản chất quyết định này, tránh hiểu lầm khi đọc lại sau này**: đây KHÔNG PHẢI checkpoint làm tăng độ tin cậy đọc số — "chuyến xong" là mốc nghiệp vụ, không liên quan gì tới việc model đọc đúng chữ viết tay hay không (rủi ro đọc nhầm 1 chữ số ra số khác vẫn hợp lệ, vd `4↔9`, không giảm đi chút nào so với tự ghi giữa chuyến — xem ca lỗi thật "đọc thừa 1 số" ở bullet dưới). Đây THUẦN là quyết định "giảm phiền cho crew, chấp nhận rủi ro còn lại giống hệt cơ chế '⚡ Điền tất cả' của người nhận" — KHÔNG mở rộng nguyên tắc "không tự ghi DB" ra bất kỳ nơi nào khác, nút "🔍 Đối chiếu"/khối "📇 gợi ý" giữa chuyến vẫn giữ nguyên y hệt hành vi cũ.
    - **Upload ảnh từ thư viện** (`hang.html`, độc lập với tính năng người gửi ở trên, cùng thêm 1 lượt) — nút riêng `#btn-chon-thu-vien` + input ẩn `#kien-thuvien-input` (KHÔNG có `capture`), KHÔNG sửa `#kien-camera-input` hiện có. Lý do bắt buộc tách riêng: `openCameraFlow()` trên Android khi `getUserMedia` thành công (đa số trường hợp) mở thẳng camera nhúng sống, không bao giờ đụng tới `#kien-camera-input` — nếu chỉ bỏ `capture` khỏi input đó, crew Android sẽ không có cách nào bấm vào để chọn thư viện. Ảnh chọn đi qua ĐÚNG pipeline `handleNewPhotoBlob()` như ảnh chụp trực tiếp, không có luồng riêng. Chưa xử lý gì đặc biệt cho ảnh chất lượng thấp (vd đã nén qua Zalo) — `resizeImage` áp dụng chung, tỷ lệ AI đọc sai với ảnh loại này có thể cao hơn ảnh chụp trực tiếp, coi là rủi ro đã biết chứ không phải bug.

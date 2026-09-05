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

## Tiện ích dùng chung (`shared.js`)

- `formatDate(dateStr)` — hiện giờ + ngày âm lịch + ngày dương, vd `13:03 - 20/7 ÂL - 01/09/26`, dùng cho label chuyến ở cả `hang.html` và `manifest-hang.html`. Âm lịch tính bằng thuật toán Hồ Ngọc Đức viết thuần JS ngay trong file (`convertSolar2Lunar` + các hàm phụ trợ `_jdFromDate`/`_newMoon`/`_sunLongitude`/...), không phụ thuộc thư viện ngoài, múi giờ cố định UTC+7 (khớp app chỉ chạy tuyến trong nước).
- `renderSideMenu(sb)` — menu trượt từ trái (`.side-drawer*` trong `style.css`, panel `left:0` + `translateX(-100%→ 0)`), dùng chung cho cả 3 trang `hang.html`/`manifest-hang.html`/`lich-su-chuyen.html`. Thay thế hoàn toàn cách cũ (link `header-nav-desktop` rời rạc nhét trực tiếp 2 bên header — class này và toàn bộ CSS của nó **đã bị xoá khỏi `style.css`**, không còn dùng nữa). Header mỗi trang giờ chỉ còn nút `#btn-open-menu` (☰) bên trái + `h2` tiêu đề (absolute-center) + `<div></div>` rỗng bên phải (giữ chỗ cho `justify-content:space-between` đẩy nút sang trái — ban đầu nút từng ở bên phải/trượt từ phải, đã đổi sang trái theo yêu cầu sau). Nhận `sb` làm tham số thay vì tự `createSb()` — mỗi trang đã có sẵn instance `sb` riêng, dùng chung để `signOut()` đúng session. Tự so `location.pathname` để bôi đậm (`.active`) link trỏ tới trang hiện tại, không ẩn link đó đi. Mỗi trang gọi 1 lần: `const { open } = renderSideMenu(sb)` rồi gắn `open` vào `#btn-open-menu`.

## Pages

- Cả 3 trang `hang.html` ↔ `manifest-hang.html` ↔ `lich-su-chuyen.html` nối vòng qua menu trượt `renderSideMenu` (xem trên) — không còn link rời rạc trong header.
- `login.html` — màn đăng nhập (2 nút Google/Zalo)
- `auth-callback.html` — bridge verifyOtp cho nhánh Zalo, không dùng cho Google
- `hang.html` — nhập kiện: chọn/tạo **chuyến** (chiều bắc/nam) → chọn tỉnh → chọn/tạo điểm → chụp ảnh + SĐT người nhận + ghi chú → lưu offline-first vào IndexedDB (`idb-queue.js`), tự đồng bộ khi có mạng
  - **Danh sách "1. Chọn tỉnh" loại Đắk Lắk theo chiều, luôn loại Khánh Hòa** (`loadTinh()`) — chiều `bac`: hàng bốc ở Đắk Lắk (điểm xuất phát, không phải điểm giao) nên ẩn khỏi danh sách chọn; chiều `nam`: Đắk Lắk lại là điểm đến cuối cùng (order by `thu_tu` DESC nên tự nhiên rơi xuống cuối danh sách) nên **giữ lại** để chọn giao hàng — filter là `(currentChuyen.chieu === 'nam' || t.ma !== 'DLK')`. Khánh Hòa loại bỏ ở cả 2 chiều vì xe không chạy tuyến qua đó. Đây là filter cứng ở client, không phải xoá khỏi bảng `tinh_tuyen` — cả 2 tỉnh vẫn còn trong DB, chỉ ẩn/hiện có điều kiện khỏi UI chọn tỉnh giao hàng. Lưu ý `data/tinh_km_range.json` cũng không có entry cho Khánh Hòa (đi thẳng `DLK` → `PYN`), khớp với việc tuyến không qua đó.
  - **Bước 0 chỉ hiện chuyến `dang_chay`** (`loadChuyenList`, render qua `renderChuyenItem`) — từng thử hiện thêm nhóm "Chuyến đã hoàn thành" ở đây (bấm để xem lại) nhưng đã bỏ theo yêu cầu: nhập kiện mới không cần thấy chuyến cũ, xem lại chuyến đã xong thì qua `lich-su-chuyen.html`. `lich-su-chuyen.html` vẫn giữ nguyên 2 nhóm (xem bên dưới) — 2 trang khác nhau ở điểm này, không phải bug.
  - **Tạo chuyến mới chỉ có 1 field (Chiều)** — không còn nhập tay giờ khởi hành hay ghi chú; `khoi_hanh` luôn = `new Date()` lúc bấm "Tạo chuyến" (`chuyen.ghi_chu` vẫn còn cột trong DB, chỉ không thu thập ở form này nữa, luôn `null` cho chuyến mới).
  - **Bước 3 (chụp ảnh) có nút "💰 Thu hộ (COD)"** (`#btn-thu-ho-toggle`) — bật lên mới hiện ô nhập `#kien-thu-ho`, bắt buộc số dương nếu bật (validate trước khi `queueKien`). Lưu vào `record.tien_thu_ho`, đi qua `idb-queue.js` như các field khác (khác với `tien_thu` — field đó chỉ nhập được ở `manifest-hang.html` sau khi giao, không có trong hàng đợi offline).
  - **Ảnh chụp: hiện preview ngay bằng `URL.createObjectURL`, resize chạy ngầm phía sau** — trước đây dùng `FileReader.readAsDataURL(activePhotoBlob)` để hiện preview, phải đọc + encode base64 TOÀN BỘ ảnh gốc camera (chưa resize, thường 3-8MB) trước khi `<img>` nhận `src`, gây cảm giác "chậm vài giây sau khi chụp" — đây là nguyên nhân chính, không phải do ghi IndexedDB (Blob ghi thẳng, rất nhanh). Giờ preview hiện gần như tức thời qua object URL (chỉ tạo con trỏ, không đọc nội dung), còn `resizeImage(file, 1600)` (canvas, JPEG quality 0.82) resize ảnh xuống tối đa 1600px cạnh dài chạy `.then()` phía sau, gán lại `activePhotoBlob` khi xong — nếu resize lỗi (vd định dạng canvas không decode được) thì fallback về giữ nguyên ảnh gốc (`activePhotoBlob` đã được set trước đó). Nếu bấm "Lưu kiện hàng" trước khi resize kịp xong thì `record.anh_blob` là ảnh gốc chưa resize — chấp nhận được, không chặn luồng lưu để chờ resize. `activePreviewUrl` được `URL.revokeObjectURL()` mỗi khi chụp ảnh mới hoặc sau khi lưu, tránh rò rỉ bộ nhớ.
  - **Camera nhúng CHỈ trên Android, iOS giữ nguyên `<input type="file" capture>`** (`openCameraFlow`, phát hiện bằng UA sniffing `isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)`) — cố ý dùng UA sniffing thay vì feature-detection: iOS về kỹ thuật vẫn "hỗ trợ" `getUserMedia`, nhưng PWA standalone trên iOS có lịch sử lỗi camera lặp lại nhiều lần qua các bản cập nhật WebKit (gần nhất iOS 18, vá ở 18.1.1) — quyết định chọn theo độ tin cậy thực tế của nền tảng, không phải API có tồn tại hay không. Android: `getUserMedia({ video: { facingMode: 'environment' } })` hiện `<video>` sống (`#camera-live`) đè lên `#camera-box`, bấm "📸 Chụp" vẽ frame hiện tại lên `<canvas id="camera-canvas">` (ẩn) rồi `toBlob()` — Blob này đưa thẳng vào `handleNewPhotoBlob()`, **cùng 1 pipeline** với ảnh từ `<input type="file">` (không viết lại logic preview/resize). `getUserMedia` lỗi (từ chối quyền, thiết bị/WebView không hỗ trợ) → bắt ở `catch`, rơi về `kien-camera-input.click()` như iOS, không để màn hình đứng/trắng. `stopCameraStream()` tắt hẳn track camera (đèn camera, tốn pin) khi: bấm chụp xong, bấm "Hủy", hoặc tab/app bị ẩn (`visibilitychange`) — **chưa test được trên thiết bị Android thật** trong quá trình phát triển (sandbox không có camera thật, headless Chrome + fake-device flag không mô phỏng đúng hành vi WebView Android), cần crew test thực tế trước khi tin tưởng hoàn toàn luồng này.
- `manifest-hang.html` — chọn 1 chuyến, xem kiện gom theo tỉnh (thứ tự theo `tinh_tuyen.thu_tu`, chiều lấy từ `chuyen.chieu`: bac = ASC, nam = DESC). Mỗi dòng kiện chuyển đổi tại chỗ trong cùng 1 `.kien-row` (không điều hướng trang) qua các hàm `renderKienRowView` / `renderKienRowEdit` / `renderKienRowThuTien` / `renderKienRowViTri`:
  - **`?chuyen_id=<uuid>` trong URL preselect dropdown** (`loadChuyenOptions`) — nếu id có trong danh sách 50 chuyến gần nhất thì chọn chuyến đó thay vì mặc định chuyến mới nhất; dùng bởi link từ `lich-su-chuyen.html`. `loadChuyenOptions` vốn không lọc `trang_thai` (lấy cả `dang_chay` lẫn `xong`, `order by created_at desc limit 50`) nên chuyến đã xong luôn có sẵn trong dropdown, kể cả không qua query param.
  - **Nút "🏁 Kết thúc chuyến"** (`#btn-ket-thuc-chuyen`, cạnh dropdown chọn chuyến) — `confirm()` rồi `UPDATE chuyen.trang_thai = 'xong'` cho chuyến đang chọn trên dropdown. Tự ẩn nếu chuyến đã `xong` (qua `updateEndTripButton`, gọi lại mỗi lần đổi chuyến trong `loadManifest`). Đây là nơi DUY NHẤT trong app set `trang_thai = 'xong'` — trước đó không có UI nào làm việc này, chuyến chỉ có thể được tạo (`dang_chay`) chứ không bao giờ kết thúc được. Kết thúc chuyến khiến nó biến mất khỏi danh sách "0. Chọn chuyến đang chạy" ở `hang.html` (lọc `trang_thai = 'dang_chay'`) và mở khoá nút "+ Tạo chuyến mới" ở đó (bị khoá khi đang có chuyến `dang_chay`) — không có nút "mở lại chuyến" (chưa yêu cầu).
  - **`renderKienRowView` chỉ có 1 nút chính + 1 menu "⋯"** (không còn nhiều nút `.btn-sm` cùng hàng như trước) — tránh bấm nhầm khi crew thao tác 1 tay lúc xe rung lắc. Chưa giao: nút chính `.btn-primary-action` "Hoàn thành" (gọi `toggleDaGiao`), menu chỉ có "Sửa" (`renderKienRowEdit`). Đã giao: KHÔNG có nút chính (mọi thao tác còn lại đều là sửa sai, tần suất thấp) — menu gộp cả "Sửa", "Hủy giao" (`toggleDaGiao` theo chiều ngược), "Sửa tiền"/"Thu tiền" (`renderKienRowThuTien`). Badge trạng thái + dòng "Đã thu"/"Thu hộ" giữ nguyên vị trí, không đổi.
  - **Menu "⋯" dùng `.kien-menu` với `position: fixed`, toạ độ tính bằng JS** (`openKienMenu`, dựa `getBoundingClientRect()` của nút vừa bấm) — KHÔNG dùng `position: absolute` neo theo `.kien-actions` như cách thường làm, vì `.tinh-group` cha có `overflow: hidden` (để bo góc `<h3>` tiêu đề tỉnh) sẽ cắt mất phần menu tràn ra ngoài khung nếu dùng absolute. `openKienMenu` hiện menu (`classList.add('open')`) TRƯỚC rồi mới đo `offsetWidth`/`offsetHeight` thật để tính vị trí — bắt buộc phải đo sau khi hiện vì phần tử `display:none` luôn có `offsetWidth/offsetHeight = 0`. Neo theo mép PHẢI của nút "⋯" rồi kẹp `left` trong khoảng `[8px, innerWidth - width - 8px]`, KHÔNG neo cứng bằng `right` — trên mobile khi `.kien-actions` chỉ có 1 mình nút "⋯" (trạng thái đã giao), nút nằm sát mép trái (flex-start), nếu chỉ set `right` theo mép nút thì menu bị đẩy tràn hẳn ra ngoài mép trái màn hình, nhìn như 1 khối trắng trống không chữ (đã gặp lỗi này thực tế trên điện thoại, đã fix). Tương tự theo chiều dọc: mặc định mở `top = rect.bottom + 4` (xuống dưới nút), nhưng nếu `top + offsetHeight` tràn quá `innerHeight` (dòng kiện cuối cùng của danh sách thường sát đáy màn hình) thì lật lên mở phía TRÊN nút (`top = rect.top - offsetHeight - 4`) thay vì cứ cắm xuống dưới — cũng đã gặp lỗi thực tế (chữ "Hủy giao" bị cắt nửa dòng ở đáy màn hình khi mở dòng kiện cuối), đã fix. Đóng menu khi: bấm lại chính nút "⋯" (toggle), bấm 1 mục trong menu (row re-render/innerHTML thay thế), hoặc bấm ra ngoài (1 listener `click` gắn ở `document`, đăng ký DUY NHẤT 1 lần ở top-level script — không đặt trong `renderKienRowView` vì hàm đó chạy lại mỗi lần render 1 dòng, đặt trong đó sẽ tích luỹ nhiều listener trùng lặp qua các lần re-render).
  - **`toggleDaGiao`** chuyển UI sang `renderKienRowThuTien` (nhập tiền thu) **ngay lập tức, không chờ mạng/GPS** — set `k.trang_thai = 'da_giao'` optimistic trước, rồi mới bắt GPS (nếu `diem` chưa có toạ độ, có thể mất tới 15s — xem mục "Toạ độ điểm giao + km_moc") và `UPDATE kien.trang_thai` chạy ngầm phía sau; nếu update DB lỗi thì revert `k.trang_thai` về `chua_giao` + render lại `renderKienRowView` kèm toast lỗi. Theo chiều ngược ("Hủy giao", không có GPS nên vẫn update đồng bộ như cũ) quay về `renderKienRowView`.
  - **`renderKienRowViTri`** (sửa tay `lat`/`lng` của `diem`, tính lại `km_moc` khi lưu) — code vẫn còn nguyên nhưng **không có đường gọi tới từ UI** (đã bị ẩn khỏi `renderKienRowView` từ trước, và không được thêm vào menu "⋯" khi làm lại UI nút — dead code có chủ đích, giữ lại phòng khi cần bật lại lối sửa tay toạ độ)
  - **Cảnh báo thu hộ (COD)** — `renderCodSummary` hiện banner `#cod-summary` phía trên danh sách CHỈ KHI còn kiện `tien_thu_ho > 0` mà `tien_thu < tien_thu_ho` (chưa thu đủ): tổng cần thu, tổng đã thu, số kiện chưa thu đủ. Đã thu đủ hết (hoặc chuyến không có kiện COD) → banner tự ẩn, không còn gì để cảnh báo. Mỗi dòng kiện có `tien_thu_ho` cũng hiện badge màu `--warning` "💰 Thu hộ: Xđ" (kèm "⚠ chưa thu đủ" nếu đã giao mà `tien_thu < tien_thu_ho`) — badge này hiện cả khi chưa giao, không tự ẩn như banner. Số tiền cần thu hộ cũng hiện lại trong `renderKienRowThuTien` lúc nhập tiền thực thu để đối chiếu.
  - **Kiện đã giao tô nền xanh nhạt** (`.kien-row-da-giao`, `background: var(--success-light)`) — toggle qua `row.classList.toggle('kien-row-da-giao', daGiao)` trong `renderKienRowView`, giúp quét mắt nhanh biết kiện nào xong trong danh sách dài mà không cần đọc từng badge. Chỉ set trong `renderKienRowView`, không set khi `toggleDaGiao` nhảy thẳng sang `renderKienRowThuTien` (kiện vừa đánh dấu xong sẽ chưa có nền xanh cho tới khi quay lại view sau khi Lưu/Hủy tiền) — chấp nhận được vì đó chỉ là khoảnh khắc đang nhập liệu.
  - Bấm vào ảnh thumbnail mở lightbox phóng to (`#lightbox`)
  - **Dưới 600px** (`@media (max-width: 600px)` trong `<style>` của trang): `.kien-row` chuyển `flex-wrap: wrap` — ảnh/tên điểm/badge giữ 1 hàng, `.kien-actions` LUÔN xuống hàng riêng full-width (áp dụng chung cho mọi trạng thái, không chỉ form Lưu/Hủy) — `.btn-primary-action` (nếu có) chiếm phần lớn hàng đó (`flex: 1`), `.btn-menu-more`/`.btn-sm` (form Sửa/Thu tiền/Vị trí) chia đều phần còn lại. **Đã thử để `.kien-actions` của `renderKienRowView` nằm chung hàng với ảnh/tên/badge (không full-width) — lỗi**: `.info` có `flex:1` + `min-width:0` nên bị bóp gần bằng 0 thay vì tự xuống dòng (flex-wrap chỉ ngắt dòng theo từng flex-item nguyên khối, không "cứu" được item co giãn được), khiến tên điểm/SĐT/ghi chú vỡ chữ chồng chéo lên nhau — y hệt lỗi gốc mà bản `.btn-sm` 4-nút trước đây từng gặp. Bài học: `.kien-actions` trên mobile PHẢI luôn full-width riêng hàng, không được để chung hàng với `.info`, bất kể có bao nhiêu nút bên trong.
- `lich-su-chuyen.html` — liệt kê 50 chuyến gần nhất (`order by khoi_hanh desc`, cả `dang_chay` lẫn `xong` — KHÔNG chỉ chuyến xong dù tên trang là "lịch sử"), chia 2 nhóm "Chuyến đang chạy" / "Chuyến đã hoàn thành". Card của CẢ 2 nhóm đều điều hướng `manifest-hang.html?chuyen_id=<id>` để xem/giao tiếp — trang này không có khái niệm "nhập kiện mới" (khác `hang.html` bước 0, giờ CHỈ hiện chuyến `dang_chay`, xem trên) nên không cần phân biệt hành vi click theo nhóm. Mỗi card show `X kiện · Đã thu: Yđ` (tổng `tien_thu` các kiện của chuyến, tính ở client — 1 query `kien` duy nhất với `.in('chuyen_id', ...)` cho cả 50 chuyến rồi filter/group theo `chuyen_id`, không dùng RPC/view riêng vì data nhỏ) và cảnh báo "⚠ Còn N kiện chưa thu đủ COD" nếu có.

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

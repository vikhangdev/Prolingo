# Nghé English — Ôn tiếng Anh chuyên ngành

Web tĩnh (HTML + CSS + JavaScript thuần) chạy trên **GitHub Pages**, dữ liệu & tài khoản nằm trên **Supabase**.
Admin thêm/sửa/xóa ngành, unit, từ vựng, bài tập ngay trên web → học viên thấy ngay, **không cần sửa code**.

```
index.html            khung trang
css/                  base · learn · admin · mascot
js/
  config.js           ← CHỈ SỬA FILE NÀY (URL + anon key Supabase)
  main.js             khởi động, header, route, phân quyền
  auth.js             đăng ký / đăng nhập / đăng xuất / đổi & quên mật khẩu
  api.js              mọi lời gọi Supabase
  quiz.js, quiz-data.js   engine làm bài (trắc nghiệm, điền từ, nối, flashcard)
  progress.js         lưu & tính tiến độ
  dictionary.js       tra nghĩa, phát âm, dịch
  mascot.js           bạn trâu + pháo giấy
  views/              màn hình học viên (auth, learn, progress)
  views/admin/        màn hình quản trị (ngành, unit, từ vựng, bài tập, người dùng, dữ liệu)
supabase/01_schema.sql  bảng + phân quyền (RLS)
supabase/02_delete_rules.sql  (chỉ cần nếu đã chạy 01 từ bản cũ) khóa xóa cha khi còn con
supabase/04_user_account_management.sql  (cần chạy nếu database đã được tạo trước tính năng quản lý tài khoản)
supabase/05_user_industry_and_study_time.sql  (ngành chính tùy chọn, nhật ký học và thời lượng học)
supabase/06_user_avatars.sql  (ảnh đại diện lưu trong Supabase Storage)
data/itfield.json      dữ liệu mẫu CNTT (8 unit) chuyển từ bản cũ
tools/export-seed.mjs   script đã dùng để chuyển script.js cũ → JSON
```

## Cài đặt (làm 1 lần, ~10 phút)

### 1. Tạo project Supabase
1. Vào https://supabase.com → **New project** (gói Free là đủ).
2. **SQL Editor → New query** → dán toàn bộ `supabase/01_schema.sql` → **Run**.
3. Chạy tiếp `supabase/06_user_avatars.sql` để tạo vùng lưu ảnh đại diện.

### 2. Cấu hình Auth
**Authentication → URL Configuration**
- *Site URL*: địa chỉ GitHub Pages, ví dụ `https://tenban.github.io/ten-repo/`
- *Redirect URLs*: thêm đúng địa chỉ đó (và `http://localhost:5500/` nếu muốn thử ở máy).

(Tùy chọn) **Authentication → Providers → Email**: tắt *Confirm email* nếu muốn đăng ký xong dùng được ngay.
Khi bật, người dùng phải bấm link xác nhận trong email.

### 3. Điền khóa kết nối
Mở `js/config.js`, dán **Project URL** và **anon public key** (Project Settings → API).
Không bao giờ dán `service_role` key.

### 4. Đưa lên GitHub Pages
Đẩy toàn bộ thư mục này lên một repo → **Settings → Pages → Deploy from branch → main / (root)**.

### 5. Tạo admin đầu tiên
1. Mở web, **Đăng ký** một tài khoản (và xác nhận email nếu bật).
2. Trong SQL Editor chạy (thay email của bạn):
   ```sql
   update public.profiles set role = 'admin' where email = 'email-cua-ban@example.com';
   ```
3. Đăng xuất / đăng nhập lại → menu **Quản trị** xuất hiện.
4. Vào **Quản trị → Quản lý dữ liệu → Nhập dữ liệu → Nạp dữ liệu mẫu CNTT** để đưa 8 unit cũ lên Supabase.

Từ đó, admin cấp quyền cho người khác ở **Quản trị → Người dùng**.

Khi đăng ký, học viên có thể chọn **Ngành chính** hoặc bỏ qua và chọn sau ở **Tài khoản của tôi**.

## Quản lý tài khoản người dùng
Trong **Quản trị → Người dùng → Quản lý tài khoản**, admin có thể xem thông tin, sửa tên hiển thị, ẩn/mở hoặc xóa tài khoản học viên. Mỗi thao tác cần xác nhận; tài khoản admin chỉ xem và sửa được, không thể ẩn hoặc xóa. Email chỉ xem được trong trang này.

Nếu database đã chạy `01_schema.sql` trước các tính năng quản lý tài khoản/ngành chính, hãy chạy lần lượt `supabase/04_user_account_management.sql` và `supabase/05_user_industry_and_study_time.sql` trong Supabase SQL Editor. Database mới chỉ cần chạy `01_schema.sql` bản hiện tại. Tài khoản cũ có thể chọn ngành chính ở **Tài khoản của tôi** hoặc nhờ admin cập nhật trong **Quản lý tài khoản**.

Để bật ảnh đại diện, chạy `supabase/06_user_avatars.sql` trong SQL Editor sau các migration hiện có. Học viên và admin có thể tải ảnh của mình lên ở **Tài khoản của tôi**; admin cũng có thể cập nhật ảnh của tài khoản trong **Quản lý tài khoản**. Ảnh được lưu ở bucket công khai `avatars`, hỗ trợ JPG, PNG, WebP và GIF tối đa 5 MB.

## Theo dõi học viên
Vào **Quản trị → Người dùng → Quá trình học** để xem:
- **Các lần làm**: từng lượt làm bài, điểm, chi tiết từng câu (học viên chọn gì / đáp án đúng).
- **Câu sai cần hướng dẫn**: các câu đang sai kèm đáp án và lời giải.
- **Chưa hoàn thành**: bài chưa làm hoặc làm dở.
- **Gửi lời nhắc**: soạn lời nhắc (tự gợi ý nội dung), gửi trong web (hiện ở Trang chủ của học viên) hoặc mở email.
Có thể lọc theo ngành, unit, trạng thái và thời gian. Ngành đã học được xác định từ tiến độ/lượt học đã ghi nhận; đây không phải danh sách đăng ký riêng. Thời gian học là ước tính giữa các câu trả lời; dữ liệu lượt cũ chưa có thời lượng.

## Quy tắc xóa dữ liệu
Cấu trúc: **Ngành → Unit → (Từ vựng | Bài tập → Câu hỏi)**. Cha chỉ xóa được khi con đã hết, nên xóa theo thứ tự
**Câu hỏi → Bài tập / Từ vựng → Unit → Ngành**. Quản trị → **Quản lý dữ liệu → Xóa dữ liệu** có cây xóa theo từng cấp
và nút "Xóa toàn bộ dữ liệu" (phải gõ `XOA TAT CA` để xác nhận). Quy tắc này cũng áp dụng ở các trang Ngành, Unit, Bài tập
và được khóa ở database (ON DELETE RESTRICT).
Nếu bạn đã chạy `01_schema.sql` từ phiên bản trước, hãy chạy thêm `supabase/02_delete_rules.sql` một lần.

## Phân quyền
| | Học viên | Admin |
|---|---|---|
| Đăng ký, đăng nhập, đăng xuất, đổi/quên mật khẩu | ✔ | ✔ |
| Chọn ngành, học theo unit & phần, nghe phát âm, tra từ | ✔ | ✔ |
| Xem tiến độ của mình | ✔ | ✔ |
| CRUD ngành, unit, từ vựng, bài tập, bài đọc | ✘ | ✔ |
| Xem danh sách người dùng, đổi quyền | ✘ | ✔ |

Quyền được **Supabase RLS** kiểm soát ở phía máy chủ, nên dù ai sửa JavaScript trên trình duyệt cũng không thể ghi dữ liệu nếu không phải admin.

## Ghi chú
- Link "quên mật khẩu" dùng PKCE: người dùng cần mở link **trong cùng trình duyệt** đã yêu cầu.
- Dùng thử ở máy: `npx serve .` hoặc extension Live Server (ES Modules cần chạy qua http, không mở file trực tiếp).
- Nhờ AI soạn câu hỏi: ở **Bài tập & bài đọc → JSON** có mẫu để dán nhiều câu một lần.

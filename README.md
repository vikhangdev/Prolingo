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
data/it-field.json      dữ liệu mẫu CNTT (8 unit) chuyển từ bản cũ
tools/export-seed.mjs   script đã dùng để chuyển script.js cũ → JSON
```

## Cài đặt (làm 1 lần, ~10 phút)

### 1. Tạo project Supabase

1. Vào https://supabase.com → **New project** (gói Free là đủ).

2. **SQL Editor → New query** → dán toàn bộ `supabase/01_schema.sql` → **Run**.

### 2. Cấu hình Auth

**Authentication → URL Configuration**

- _Site URL_: địa chỉ GitHub Pages, ví dụ `https://tenban.github.io/ten-repo/`
- _Redirect URLs_: thêm đúng địa chỉ đó (và `http://localhost:5500/` nếu muốn thử ở máy).

(Tùy chọn) **Authentication → Providers → Email**: tắt _Confirm email_ nếu muốn đăng ký xong dùng được ngay.
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
4. Vào **Quản trị → Nhập / xuất dữ liệu → Nạp dữ liệu mẫu CNTT** để đưa 8 unit cũ lên Supabase.

Từ đó, admin cấp quyền cho người khác ở **Quản trị → Người dùng**.

## Phân quyền

|                                                        | Học viên | Admin |
| ------------------------------------------------------ | -------- | ----- |
| Đăng ký, đăng nhập, đăng xuất, đổi/quên mật khẩu       | ✔        | ✔     |
| Chọn ngành, học theo unit & phần, nghe phát âm, tra từ | ✔        | ✔     |
| Xem tiến độ của mình                                   | ✔        | ✔     |
| CRUD ngành, unit, từ vựng, bài tập, bài đọc            | ✘        | ✔     |
| Xem danh sách người dùng, đổi quyền                    | ✘        | ✔     |

Quyền được **Supabase RLS** kiểm soát ở phía máy chủ, nên dù ai sửa JavaScript trên trình duyệt cũng không thể ghi dữ liệu nếu không phải admin.

## Ghi chú

- Link "quên mật khẩu" dùng PKCE: người dùng cần mở link **trong cùng trình duyệt** đã yêu cầu.
- Dùng thử ở máy: `npx serve .` hoặc extension Live Server (ES Modules cần chạy qua http, không mở file trực tiếp).
- Nhờ AI soạn câu hỏi: ở **Bài tập & bài đọc → JSON** có mẫu để dán nhiều câu một lần.

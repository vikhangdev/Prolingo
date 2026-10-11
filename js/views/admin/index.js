import { esc } from "../../utils.js";
import * as api from "../../api.js";
import { shell } from "./ui.js";

export async function viewAdminHome() {
  const body = shell("", "Tổng quan quản trị");
  try {
    const c = await api.adminCounts();
    const cards = [["Ngành", c.fields, "fields"], ["Unit", c.units, "units"], ["Từ vựng", c.words, "words"], ["Câu hỏi", c.questions, "exercises"], ["Người dùng", c.users, "users"]]
      .map(([t, n, k]) => `<a class="kpi" href="#/admin/${k}" style="text-decoration:none;color:inherit"><b>${n}</b><span>${t}</span></a>`).join("");
    body.innerHTML = `<div class="cards3">${cards}</div>
      <section class="panel"><h3>Cách thêm một ngành mới</h3><ol style="margin:0;padding-left:20px;line-height:2">
        <li><a href="#/admin/fields">Ngành</a> → <b>Thêm ngành</b> (tên, biểu tượng, màu).</li>
        <li><a href="#/admin/units">Unit</a> → thêm các unit cho ngành đó.</li>
        <li><a href="#/admin/words">Từ vựng</a> → dán danh sách <code>English | nghĩa</code> cho từng unit.</li>
        <li><a href="#/admin/exercises">Bài tập & bài đọc</a> → thêm bài trắc nghiệm, điền từ, bài nối, bài đọc.</li>
        <li>Học viên thấy nội dung mới <b>ngay lập tức</b> — không cần sửa code hay deploy lại.</li></ol></section>`;
  } catch (e) { body.innerHTML = `<div class="alert err">${esc(e.message)}</div>`; }
}

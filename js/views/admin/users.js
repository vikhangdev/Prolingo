import { $, $$, esc, fmtDate, fmtDateTime, debounce, confirmBox } from "../../utils.js";
import * as api from "../../api.js";
import { Auth } from "../../auth.js";
import { shell, act } from "./ui.js";

export async function viewAdminUsers() {
  const body = shell("users", "Quản lý người dùng");
  let rows = [], q = "";
  const draw = () => {
    const list = rows.filter((u) => !q || (u.email || "").toLowerCase().includes(q) || (u.display_name || "").toLowerCase().includes(q));
    body.innerHTML = `<div class="filters"><div class="fld"><label for="uq">Tìm người dùng</label><input class="input" id="uq" value="${esc(q)}" placeholder="Tên hoặc email…"></div>
      <div class="small" style="padding-bottom:10px">${list.length}/${rows.length} tài khoản · ${rows.filter((u) => u.role === "admin").length} admin</div></div>
      <div class="tbl-scroll"><table class="dtable"><thead><tr><th>Tên</th><th>Email</th><th>Quyền</th><th>Đã làm</th><th>Đúng</th><th>Hoạt động gần nhất</th><th>Ngày tạo</th></tr></thead><tbody>${list.map((u) => {
        const me = u.id === Auth.user.id;
        return `<tr><td><b>${esc(u.display_name || "—")}</b>${me ? ' <span class="badge gold">Bạn</span>' : ""}</td><td>${esc(u.email)}</td>
        <td><select class="select" data-role="${u.id}" style="padding:4px 8px;min-width:130px" ${me ? "disabled title='Không thể tự đổi quyền của mình'" : ""}><option value="user" ${u.role === "user" ? "selected" : ""}>Học viên</option><option value="admin" ${u.role === "admin" ? "selected" : ""}>Quản trị viên</option></select></td>
        <td>${u.answered}</td><td>${u.answered ? Math.round((u.correct / u.answered) * 100) + "%" : "—"}</td><td>${fmtDateTime(u.last_active)}</td><td>${fmtDate(u.created_at)}</td></tr>`;
      }).join("") || '<tr><td colspan="7" class="muted">Không có kết quả.</td></tr>'}</tbody></table></div>`;
    $("#uq").oninput = debounce((e) => { q = e.target.value.trim().toLowerCase(); const p = e.target.selectionStart; draw(); const el = $("#uq"); el.focus(); el.setSelectionRange(p, p); }, 200);
    $$("[data-role]", body).forEach((s) => (s.onchange = async () => {
      const u = rows.find((r) => r.id === s.dataset.role), role = s.value;
      const ok = await confirmBox(`Đổi quyền của ${u.email} thành "${role === "admin" ? "Quản trị viên" : "Học viên"}"?`, { okText: "Đổi quyền", danger: false });
      if (ok && (await act(() => api.setUserRole(u.id, role), "Đã cập nhật quyền"))) u.role = role;
      draw();
    }));
  };
  try { rows = await api.adminUsers(); draw(); }
  catch (e) { body.innerHTML = `<div class="alert err">${esc(e.message)}. Hãy chắc chắn đã chạy file <code>supabase/01_schema.sql</code>.</div>`; }
}

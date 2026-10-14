import { $, esc, debounce, avatarHtml } from "../../utils.js";
import * as api from "../../api.js";
import { Auth } from "../../auth.js";
import { shell } from "./ui.js";

export async function viewAdminUsers() {
  const body = shell("users", "Quản lý người dùng");
  body.innerHTML = '<div class="loading"><div class="spin"></div>Đang tải danh sách tài khoản…</div>';

  let rows = [], fields = [], search = "", role = "all", fieldId = "all", status = "all";
  const draw = () => {
    const list = rows.filter((user) => {
      const matchesSearch = !search ||
        (user.email || "").toLowerCase().includes(search) ||
        (user.display_name || "").toLowerCase().includes(search);
      return matchesSearch &&
        (role === "all" || user.role === role) &&
        (fieldId === "all" || (fieldId === "none" ? !user.primary_field_id : user.primary_field_id === fieldId)) &&
        (status === "all" || (status === "active" ? user.is_active !== false : user.is_active === false));
    });
    const activeCount = rows.filter((user) => user.is_active !== false).length;
    const lockedCount = rows.length - activeCount;

    body.innerHTML = `<div class="kpis">
        <div class="kpi"><b>${rows.length}</b><span>Tổng tài khoản</span></div>
        <div class="kpi"><b>${activeCount}</b><span>Đang hoạt động</span></div>
        <div class="kpi"><b>${lockedCount}</b><span>Đã khóa</span></div>
      </div>
      <div class="filters">
        <div class="fld" style="flex:2 1 240px"><label for="user-search">Tìm tên hoặc email</label><input class="input" id="user-search" value="${esc(search)}" placeholder="Nhập tên hoặc email…"></div>
        <div class="fld"><label for="user-role-filter">Quyền</label><select class="select" id="user-role-filter"><option value="all">Tất cả quyền</option><option value="user" ${role === "user" ? "selected" : ""}>Học viên</option><option value="admin" ${role === "admin" ? "selected" : ""}>Quản trị viên</option></select></div>
        <div class="fld"><label for="user-field-filter">Ngành chính</label><select class="select" id="user-field-filter"><option value="all">Tất cả ngành</option>${fields.map((field) => `<option value="${field.id}" ${fieldId === field.id ? "selected" : ""}>${esc(field.name_vi || field.name)}</option>`).join("")}<option value="none" ${fieldId === "none" ? "selected" : ""}>Chưa chọn ngành chính</option></select></div>
        <div class="fld"><label for="user-status-filter">Trạng thái</label><select class="select" id="user-status-filter"><option value="all">Tất cả trạng thái</option><option value="active" ${status === "active" ? "selected" : ""}>Đang hoạt động</option><option value="locked" ${status === "locked" ? "selected" : ""}>Đã khóa</option></select></div>
      </div>
      <div class="small" style="margin:0 0 10px">${list.length} / ${rows.length} tài khoản</div>
      <div class="tbl-scroll"><table class="dtable"><thead><tr><th>Người dùng</th><th>Quyền</th><th>Trạng thái</th><th>Ngành chính</th><th>Quản lý</th></tr></thead><tbody>${list.map((user) => {
        const isSelf = user.id === Auth.user.id;
        return `<tr>
          <td><div class="row" style="margin:0;flex-wrap:nowrap">${avatarHtml(user)}<div><b>${esc(user.display_name || "Chưa đặt tên")}${isSelf ? ' <span class="badge gold">Bạn</span>' : ""}</b><br><span class="small">${esc(user.email || "")}</span></div></div></td>
          <td>${user.role === "admin" ? "Quản trị viên" : "Học viên"}</td>
          <td><span class="badge ${user.is_active === false ? "red" : "green"}">${user.is_active === false ? "Đã khóa" : "Đang hoạt động"}</span></td>
          <td>${esc(user.primary_field_name || "Chưa chọn")}</td>
          <td class="acts"><a class="btn ghost sm" href="#/admin/users/${user.id}">Quá trình học</a> <a class="btn sm" href="#/admin/users/${user.id}/manage">Quản lý tài khoản</a></td>
        </tr>`;
      }).join("") || '<tr><td colspan="5" class="muted">Không có tài khoản phù hợp.</td></tr>'}</tbody></table></div>`;

    $("#user-search").oninput = debounce((event) => {
      search = event.target.value.trim().toLowerCase();
      const position = event.target.selectionStart;
      draw();
      const input = $("#user-search");
      input.focus();
      input.setSelectionRange(position, position);
    }, 200);
    $("#user-role-filter").onchange = (event) => { role = event.target.value; draw(); };
    $("#user-field-filter").onchange = (event) => { fieldId = event.target.value; draw(); };
    $("#user-status-filter").onchange = (event) => { status = event.target.value; draw(); };
  };

  try {
    [rows, fields] = await Promise.all([api.adminUsers(), api.listFields()]);
    rows = rows || [];
    fields = fields || [];
    draw();
  } catch (error) {
    body.innerHTML = `<div class="alert err">${esc(error.message || error)}. Hãy chắc chắn đã chạy các migration Supabase cần thiết.</div>`;
  }
}

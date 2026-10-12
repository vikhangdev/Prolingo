import { $, $$, esc, fmtDate, fmtDateTime, debounce, confirmBox } from "../../utils.js";
import * as api from "../../api.js";
import { Auth } from "../../auth.js";
import { shell, act } from "./ui.js";

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const idleDays = (d) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : null);

export async function viewAdminUsers() {
  const body = shell("users", "Quản lý người dùng");
  let rows = [], q = "", total = 0, only = "all";
  const draw = () => {
    const list = rows.filter((u) => {
      const t = !q || (u.email || "").toLowerCase().includes(q) || (u.display_name || "").toLowerCase().includes(q);
      const d = idleDays(u.last_active);
      return t && (only === "all" || (only === "idle" && u.role !== "admin" && (d == null || d >= 7)));
    });
    const idleN = rows.filter((u) => u.role !== "admin" && (idleDays(u.last_active) ?? 99) >= 7).length;
    body.innerHTML = `<div class="filters"><div class="fld" style="flex:3;min-width:300px"><label for="uq">Tìm người dùng</label><input class="input" id="uq" value="${esc(q)}" placeholder="Tên hoặc email…"></div>
      <div class="fld" style="flex:2;min-width:250px"><label for="uf">Lọc</label><select class="select" id="uf"><option value="all" ${only === "all" ? "selected" : ""}>Tất cả</option><option value="idle" ${only === "idle" ? "selected" : ""}>Lâu chưa học (≥ 7 ngày): ${idleN}</option></select></div>
      <div class="small" style="padding-bottom:10px">${list.length}/${rows.length} tài khoản · ${rows.filter((u) => u.role === "admin").length} admin</div></div>
      <div class="tbl-scroll"><table class="dtable"><thead><tr><th>Người dùng</th><th>Quyền</th><th>Lượt làm</th><th>Đã làm</th><th>Đúng</th><th>Hoạt động gần nhất</th><th></th></tr></thead><tbody>${list.map((u) => {
        const me = u.id === Auth.user.id, d = idleDays(u.last_active);
        const tag = u.role === "admin" ? "" : d == null ? ' <span class="badge red">Chưa học</span>' : d >= 7 ? ` <span class="badge gold">${d} ngày chưa học</span>` : "";
        return `<tr><td><b>${esc(u.display_name || "—")}</b>${me ? ' <span class="badge gold">Bạn</span>' : ""}<br><span class="small">${esc(u.email)} · tham gia ${fmtDate(u.created_at)}</span></td>
        <td><select class="select" data-role="${u.id}" style="padding:4px 8px;min-width:128px" ${me ? "disabled title='Không thể tự đổi quyền của mình'" : ""}><option value="user" ${u.role === "user" ? "selected" : ""}>Học viên</option><option value="admin" ${u.role === "admin" ? "selected" : ""}>Quản trị viên</option></select></td>
        <td>${u.runs ?? 0}</td><td>${u.answered}<span class="small"> / ${total} (${pct(u.answered, total)}%)</span></td><td>${u.answered ? pct(u.correct, u.answered) + "%" : "—"}</td>
        <td>${fmtDateTime(u.last_active)}${tag}</td><td class="acts"><a class="btn sm" href="#/admin/users/${u.id}">Chi tiết</a></td></tr>`;
      }).join("") || '<tr><td colspan="7" class="muted">Không có kết quả.</td></tr>'}</tbody></table></div>`;
    $("#uq").oninput = debounce((e) => { q = e.target.value.trim().toLowerCase(); const p = e.target.selectionStart; draw(); const el = $("#uq"); el.focus(); el.setSelectionRange(p, p); }, 200);
    $("#uf").onchange = (e) => { only = e.target.value; draw(); };
    $$("[data-role]", body).forEach((s) => (s.onchange = async () => {
      const u = rows.find((r) => r.id === s.dataset.role), role = s.value;
      const ok = await confirmBox(`Đổi quyền của ${u.email} thành "${role === "admin" ? "Quản trị viên" : "Học viên"}"?`, { okText: "Đổi quyền", danger: false });
      if (ok && (await act(() => api.setUserRole(u.id, role), "Đã cập nhật quyền"))) u.role = role;
      draw();
    }));
  };
  try {
    const [users, stats] = await Promise.all([api.adminUsers(), api.unitStats()]);
    rows = users;
    total = stats.reduce((a, s) => a + s.n_words + s.n_vocab + s.n_lang + s.n_read, 0);
    draw();
  } catch (e) { body.innerHTML = `<div class="alert err">${esc(e.message)}. Hãy chắc chắn đã chạy các file trong thư mục <code>supabase/</code> (01 và 03).</div>`; }
}

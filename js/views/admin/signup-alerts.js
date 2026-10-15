import { $, $$, esc, fmtDateTime } from "../../utils.js";
import * as api from "../../api.js";
import { shell } from "./ui.js";

export async function viewAdminSignupAlerts() {
  const body = shell(
    "signup-alerts",
    "Cảnh báo email không được hỗ trợ",
    '<a class="btn ghost" href="#/admin/users">← Quản lý người dùng</a>'
  );
  body.innerHTML = '<div class="loading"><div class="spin"></div>Đang tải cảnh báo…</div>';

  try {
    const alerts = await api.adminSignupEmailAlerts();
    const pending = alerts.filter((alert) => !alert.reviewed_at);
    body.innerHTML = `<div class="kpis">
        <div class="kpi"><b>${pending.length}</b><span>Chưa xử lý</span></div>
        <div class="kpi"><b>${alerts.length}</b><span>Tổng email bị chặn</span></div>
      </div>
      <p class="sub">Các lần thử đăng ký bằng email ngoài danh sách cho phép. Thông tin chỉ admin xem được.</p>
      <div class="tbl-scroll"><table class="dtable"><thead><tr><th>Email</th><th>Lần thử</th><th>Gần nhất</th><th>Trạng thái</th><th></th></tr></thead>
      <tbody>${alerts.map((alert) => `<tr>
        <td><b>${esc(alert.email)}</b><br><span class="small">@${esc(alert.domain)}</span></td>
        <td>${alert.attempts}</td>
        <td>${fmtDateTime(alert.last_seen_at)}</td>
        <td><span class="badge ${alert.reviewed_at ? "green" : "red"}">${alert.reviewed_at ? `Đã xử lý · ${fmtDateTime(alert.reviewed_at)}` : "Cần xem"}</span></td>
        <td class="acts">${alert.reviewed_at ? "" : `<button type="button" class="btn sm" data-review="${alert.id}">Đánh dấu đã xử lý</button>`}</td>
      </tr>`).join("") || '<tr><td colspan="5" class="muted">Chưa có cảnh báo nào.</td></tr>'}</tbody></table></div>`;

    $$("[data-review]").forEach((button) => {
      button.onclick = async () => {
        button.disabled = true;
        try {
          await api.reviewSignupEmailAlert(Number(button.dataset.review));
          await viewAdminSignupAlerts();
        } catch (error) {
          button.disabled = false;
          const message = document.createElement("div");
          message.className = "alert err";
          message.textContent = error.message || String(error);
          body.prepend(message);
        }
      };
    });
  } catch (error) {
    body.innerHTML = `<div class="alert err">${esc(error.message || error)}. Hãy áp dụng phần “Hạn chế email đăng ký & cảnh báo admin” trong supabase/database.sql.</div>`;
  }
}

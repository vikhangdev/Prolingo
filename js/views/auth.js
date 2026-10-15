import { $, esc, toast, fieldColor, avatarHtml } from "../utils.js";
import { Auth, authError, isAllowedRegistrationEmail } from "../auth.js";
import * as api from "../api.js";
import { go } from "../router.js";
import { APP_NAME } from "../config.js";
import { app, theme, setCrumbs } from "./shared.js";

let nextHash = null;
export const rememberNext = (h) => { nextHash = h; };
export const afterLogin = () => { const n = nextHash; nextHash = null; go(n && !/^\/(login|register|forgot|reset)/.test(n) ? n : "/"); };

const alertBox = (id) => `<div id="${id}" role="alert"></div>`;
const showMsg = (id, type, text) => { $("#" + id).innerHTML = text ? `<div class="alert ${type}">${esc(text)}</div>` : ""; };
const busy = (btn, on, label) => { btn.disabled = on; if (label) btn.textContent = on ? "Đang xử lý…" : label; };

/* ---------- Trang chào (chưa đăng nhập): login / register / forgot ---------- */
export async function viewWelcome(mode = "login") {
  theme(); setCrumbs("");
  let fields = [];
  try { fields = await api.listFields(); } catch (e) { /* chưa có dữ liệu cũng không sao */ }
  const chips = fields.map((f) => `<span class="chip" style="--ch:${fieldColor(f)}">${esc(f.icon)} ${esc(f.name_vi || f.name)}</span>`).join("");

  const card = {
    login: `<h2>Đăng nhập</h2><p class="sub">Tiếp tục ôn bài, tiến độ của bạn được lưu lại.</p>
      <form id="f" novalidate>${alertBox("msg")}
        <div class="fld"><label for="em">Email</label><input class="input" id="em" type="email" autocomplete="email" required></div>
        <div class="fld"><label for="pw">Mật khẩu</label><input class="input" id="pw" type="password" autocomplete="current-password" required></div>
        <button class="btn block" id="go">Đăng nhập</button></form>
      <div class="authlinks"><a href="#/forgot">Quên mật khẩu?</a><a href="#/register">Chưa có tài khoản? Đăng ký</a></div>`,
    register: `<h2>Tạo tài khoản</h2><p class="sub">Miễn phí. Chọn ngành, học theo unit và theo dõi tiến độ.</p>
      <form id="f" novalidate>${alertBox("msg")}
        <div class="fld"><label for="nm">Tên hiển thị</label><input class="input" id="nm" autocomplete="name" maxlength="40" required></div>
        <div class="fld"><label for="em">Email</label><input class="input" id="em" type="email" autocomplete="email" required></div>
        <div class="fld"><label for="primary-field">Ngành chính <span class="muted">(không bắt buộc)</span></label><select class="select" id="primary-field"><option value="">Chưa chọn</option>${fields.map((field) => `<option value="${field.id}">${esc(field.name_vi || field.name)}</option>`).join("")}</select><span class="hint">Bạn có thể chọn hoặc cập nhật ngành chính sau.</span></div>
        <div class="grid2"><div class="fld"><label for="pw">Mật khẩu</label><input class="input" id="pw" type="password" autocomplete="new-password" minlength="6" required></div>
        <div class="fld"><label for="pw2">Nhập lại</label><input class="input" id="pw2" type="password" autocomplete="new-password" required></div></div>
        <button class="btn block" id="go">Đăng ký</button></form>
      <div class="authlinks"><span></span><a href="#/login">Đã có tài khoản? Đăng nhập</a></div>`,
    forgot: `<h2>Quên mật khẩu</h2><p class="sub">Nhập email đã đăng ký, chúng tôi sẽ gửi liên kết đặt lại mật khẩu.</p>
      <form id="f" novalidate>${alertBox("msg")}
        <div class="fld"><label for="em">Email</label><input class="input" id="em" type="email" autocomplete="email" required></div>
        <button class="btn block" id="go">Gửi liên kết</button></form>
      <div class="authlinks"><a href="#/login">← Quay lại đăng nhập</a><span></span></div>`,
  }[mode];

  app().innerHTML = `<div class="welcome"><div class="welcome-copy">
      <h1 class="h1">Tiếng Anh chuyên ngành, học từng ngành một.</h1>
      <p>${esc(APP_NAME)} giúp bạn ôn từ vựng, ngữ pháp và bài đọc theo đúng lĩnh vực mình làm việc — nghe phát âm, tra nghĩa ngay khi rê chuột và xem mình tiến bộ mỗi ngày.</p>
      <div class="chips">${chips || '<span class="muted">Các ngành sẽ xuất hiện ở đây.</span>'}</div></div>
    <section class="authcard" aria-label="Tài khoản">${card}</section></div>`;

  const f = $("#f"), btn = $("#go"), label = btn.textContent;
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    showMsg("msg", "", "");
    const email = $("#em").value.trim(), pw = $("#pw") && $("#pw").value;
    if (!email) return showMsg("msg", "err", "Vui lòng nhập email.");
    if (mode === "register") {
      const normalizedEmail = email.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return showMsg("msg", "err", "Vui lòng nhập địa chỉ email hợp lệ.");
      }
      if (!isAllowedRegistrationEmail(normalizedEmail)) {
        busy(btn, true, label);
        try {
          await Auth.reportBlockedSignupEmail(normalizedEmail);
          showMsg("msg", "err", "Email này chưa được hỗ trợ. Vui lòng dùng Gmail cá nhân (@gmail.com) hoặc email sinh viên được phép: @student.ctu.edu.vn, @student.ctuet.edu.vn, @student.ctump.edu.vn, @student.nctu.edu.vn, @st.tdu.edu.vn. Admin đã được thông báo.");
        } catch (err) {
          showMsg("msg", "err", `Email này chưa được hỗ trợ nên đăng ký đã bị chặn, nhưng chưa lưu được cảnh báo cho admin: ${authError(err)}`);
        } finally {
          busy(btn, false, label);
        }
        return;
      }
    }
    try {
      busy(btn, true, label);
      if (mode === "login") {
        if (!pw) throw new Error("Vui lòng nhập mật khẩu.");
        await Auth.signIn({ email, password: pw });
        afterLogin();
      } else if (mode === "register") {
        const name = $("#nm").value.trim();
        if (!name) throw new Error("Vui lòng nhập tên hiển thị.");
        if (pw.length < 6) throw new Error("Mật khẩu tối thiểu 6 ký tự.");
        if (pw !== $("#pw2").value) throw new Error("Hai mật khẩu chưa giống nhau.");
        const { needsConfirm } = await Auth.signUp({ email: email.toLowerCase(), password: pw, name, primaryFieldId: $("#primary-field").value || null });
        if (needsConfirm) { f.reset(); showMsg("msg", "ok", "Đăng ký thành công! Hãy mở email và bấm vào liên kết xác nhận, sau đó đăng nhập."); }
        else afterLogin();
      } else {
        await Auth.sendReset(email);
        showMsg("msg", "ok", "Đã gửi! Kiểm tra hộp thư (cả mục Spam) và mở liên kết trong cùng trình duyệt này.");
      }
    } catch (err) { showMsg("msg", "err", authError(err)); }
    finally { busy(btn, false, label); }
  });
  $("#em").focus();
}

/* ---------- Đặt mật khẩu mới sau khi bấm link quên mật khẩu ---------- */
export function viewReset() {
  theme(); setCrumbs("");
  if (!Auth.user) {
    app().innerHTML = `<div class="welcome"><div class="authcard"><h2>Liên kết không hợp lệ</h2><p class="sub">Liên kết đã hết hạn hoặc mở ở trình duyệt khác. Hãy yêu cầu gửi lại.</p><a class="btn" href="#/forgot">Gửi lại liên kết</a></div></div>`;
    return;
  }
  app().innerHTML = `<div class="welcome"><div class="welcome-copy"><h1 class="h1">Đặt mật khẩu mới.</h1><p>Chọn mật khẩu mà bạn sẽ nhớ — tối thiểu 6 ký tự.</p></div>
    <section class="authcard"><h2>Mật khẩu mới</h2><form id="f" novalidate>${alertBox("msg")}
      <div class="fld"><label for="pw">Mật khẩu mới</label><input class="input" id="pw" type="password" autocomplete="new-password" required></div>
      <div class="fld"><label for="pw2">Nhập lại mật khẩu</label><input class="input" id="pw2" type="password" autocomplete="new-password" required></div>
      <button class="btn block" id="go">Lưu mật khẩu</button></form></section></div>`;
  $("#f").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pw = $("#pw").value;
    if (pw.length < 6) return showMsg("msg", "err", "Mật khẩu tối thiểu 6 ký tự.");
    if (pw !== $("#pw2").value) return showMsg("msg", "err", "Hai mật khẩu chưa giống nhau.");
    try { busy($("#go"), true); await Auth.updatePassword(pw); toast("Đã đổi mật khẩu"); go("/"); }
    catch (err) { showMsg("msg", "err", authError(err)); busy($("#go"), false); }
  });
}

/* ---------- Tài khoản: tên hiển thị + đổi mật khẩu + đăng xuất ---------- */
export async function viewAccount() {
  theme(); setCrumbs("Tài khoản");
  const p = Auth.profile;
  let fields;
  try { fields = await api.listFields(); }
  catch (error) {
    app().innerHTML = `<div class="alert err">${esc(error.message || error)}</div>`;
    return;
  }
  app().innerHTML = `<button class="back" onclick="history.back()">← Quay lại</button>
    <h1 class="h2">Tài khoản của tôi</h1><p class="sub">${esc(p.email)} · <span class="role-badge">${p.role === "admin" ? "Quản trị viên" : "Học viên"}</span></p>
    <div class="grid2" style="align-items:start;gap:22px">
      <section class="panel"><h3>Ảnh đại diện</h3><div class="row" style="margin:0 0 14px;align-items:center">
        <span id="avatar-preview">${avatarHtml(p, "avatar-lg")}</span>
        <label class="btn ghost" for="avatar-file">Chọn ảnh</label><input id="avatar-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden>
      </div><p class="hint">JPG, PNG, WebP hoặc GIF; tối đa 5 MB. Có thể chọn ảnh từ điện thoại hoặc máy tính. Nhấn Lưu thông tin để lưu ảnh đã chọn.</p></section>
      <section class="panel"><h3>Thông tin</h3><form id="fp">${alertBox("m1")}
        <div class="fld"><label for="nm">Tên hiển thị</label><input class="input" id="nm" maxlength="40" value="${esc(p.display_name || "")}" required></div>
        <div class="fld"><label for="primary-field">Ngành chính <span class="muted">(không bắt buộc)</span></label><select class="select" id="primary-field"><option value="">Chưa chọn</option>${fields.map((field) => `<option value="${field.id}" ${p.primary_field_id === field.id ? "selected" : ""}>${esc(field.name_vi || field.name)}</option>`).join("")}</select></div>
        <button class="btn" id="save-profile">Lưu thông tin</button></form></section>
      <section class="panel"><h3>Đổi mật khẩu</h3><form id="fw">${alertBox("m2")}
        <div class="fld"><label for="old">Mật khẩu hiện tại</label><input class="input" id="old" type="password" autocomplete="current-password" required></div>
        <div class="fld"><label for="n1">Mật khẩu mới</label><input class="input" id="n1" type="password" autocomplete="new-password" required></div>
        <div class="fld"><label for="n2">Nhập lại mật khẩu mới</label><input class="input" id="n2" type="password" autocomplete="new-password" required></div>
        <button class="btn">Đổi mật khẩu</button></form></section></div>
    <div class="row"><button class="btn ghost" id="out">Đăng xuất</button></div>`;
  let avatarFile = null, previewUrl = null;
  $("#avatar-file").onchange = () => {
    avatarFile = $("#avatar-file").files[0] || null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    if (avatarFile) {
      previewUrl = URL.createObjectURL(avatarFile);
      $("#avatar-preview").innerHTML = `<span class="avatar-lg"><img class="avatar-photo" src="${previewUrl}" alt="Ảnh đại diện đang chọn"></span>`;
    } else {
      $("#avatar-preview").innerHTML = avatarHtml(Auth.profile, "avatar-lg");
    }
  };
  $("#fp").addEventListener("submit", async (e) => {
    e.preventDefault();
    const displayName = $("#nm").value.trim();
    if (!displayName) return showMsg("m1", "err", "Tên hiển thị không được để trống.");
    const submit = $("#save-profile");
    submit.disabled = true;
    try {
      await Auth.updateProfile({
        display_name: displayName,
        primary_field_id: $("#primary-field").value || null,
        avatarFile,
      });
      avatarFile = null;
      $("#avatar-file").value = "";
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = null;
      $("#avatar-preview").innerHTML = avatarHtml(Auth.profile, "avatar-lg");
      showMsg("m1", "ok", "Đã lưu thông tin.");
    }
    catch (err) { showMsg("m1", "err", authError(err)); }
    finally { submit.disabled = false; }
  });
  $("#fw").addEventListener("submit", async (e) => {
    e.preventDefault();
    const n1 = $("#n1").value;
    if (n1.length < 6) return showMsg("m2", "err", "Mật khẩu mới tối thiểu 6 ký tự.");
    if (n1 !== $("#n2").value) return showMsg("m2", "err", "Hai mật khẩu mới chưa giống nhau.");
    try { await Auth.changePassword($("#old").value, n1); e.target.reset(); showMsg("m2", "ok", "Đã đổi mật khẩu."); }
    catch (err) { showMsg("m2", "err", authError(err)); }
  });
  $("#out").onclick = () => Auth.signOut();
}

import { $, esc, confirmBox, avatarHtml } from "../../utils.js";
import * as api from "../../api.js";
import { Auth } from "../../auth.js";
import { go } from "../../router.js";
import { shell, act } from "./ui.js";

export async function viewAdminUserAccount({ id }) {
  const body = shell("users", "Quản lý tài khoản", '<a class="btn ghost" href="#/admin/users">← Danh sách</a>');
  body.innerHTML = '<div class="loading"><div class="spin"></div>Đang tải tài khoản…</div>';

  let user, fields;
  try {
    [user, fields] = await Promise.all([api.adminUser(id), api.listFields()]);
  } catch (error) {
    body.innerHTML = `<div class="alert err">${esc(error.message || error)}</div>`;
    return;
  }
  if (!user) {
    body.innerHTML = '<div class="empty-state"><h3>Không tìm thấy tài khoản</h3></div>';
    return;
  }

  const isAdmin = user.role === "admin";
  const isSelf = user.id === Auth.user.id;
  body.innerHTML = `<section class="panel" style="max-width:500px">
    <h3>Thông tin tài khoản</h3>
    <div class="fld"><span class="lbl">Ảnh đại diện</span><div class="row" style="margin:0 0 10px;align-items:center"><span id="admin-avatar-preview">${avatarHtml(user, "avatar-lg")}</span><label class="btn ghost sm" for="admin-avatar-file">Chọn ảnh</label><input id="admin-avatar-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden></div><span class="hint">JPG, PNG, WebP hoặc GIF; tối đa 5 MB. Nhấn Lưu thông tin để lưu ảnh đã chọn.</span></div>
    <div class="fld"><label for="user-name">Tên hiển thị</label><input class="input" id="user-name" value="${esc(user.display_name || "")}" maxlength="40"></div>
    <div class="fld"><label>Email</label><input class="input" value="${esc(user.email || "")}" disabled><span class="hint">Email chỉ xem được tại đây; đổi email cần quy trình xác minh riêng.</span></div>
    <div class="fld"><label for="user-role">Quyền</label><select class="select" id="user-role" ${isSelf ? "disabled title='Không thể tự đổi quyền của mình'" : ""}><option value="user" ${user.role === "user" ? "selected" : ""}>Học viên</option><option value="admin" ${isAdmin ? "selected" : ""}>Quản trị viên</option></select>${isSelf ? '<span class="hint">Không thể tự thay đổi quyền của tài khoản đang đăng nhập.</span>' : ""}</div>
    <div class="fld"><label for="user-primary-field">Ngành chính</label><select class="select" id="user-primary-field"><option value="">Chưa chọn ngành chính</option>${fields.map((field) => `<option value="${field.id}" ${user.primary_field_id === field.id ? "selected" : ""}>${esc(field.name_vi || field.name)}</option>`).join("")}</select></div>
    
    <!--Tài khoản quản trị viên chỉ được xem và sửa thông tin; không thể ẩn hoặc xóa.-->

    ${isAdmin ? '<div class="alert" style="margin-top:5px"></div>' : `<div class="fld"><span class="lbl">Trạng thái</span><button class="publish-toggle ${user.is_active ? "on" : "off"}" id="toggle-active" type="button" aria-pressed="${!!user.is_active}" aria-label="${user.is_active ? "Ẩn" : "Hiện"} tài khoản"><span class="publish-toggle__track"><span></span></span></button></div>`}
    
    <div class="row" style="margin-top:5px">
      <button class="btn" id="save-name">Lưu thông tin</button>
      ${!isAdmin ? '<button class="btn danger" id="delete-account">Xóa tài khoản</button>' : ""}
    </div>
  </section>`;

  let avatarFile = null, previewUrl = null;
  $("#admin-avatar-file", body).onchange = () => {
    avatarFile = $("#admin-avatar-file", body).files[0] || null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    if (avatarFile) {
      previewUrl = URL.createObjectURL(avatarFile);
      $("#admin-avatar-preview", body).innerHTML = `<span class="avatar-lg"><img class="avatar-photo" src="${previewUrl}" alt="Ảnh đại diện đang chọn"></span>`;
    } else {
      $("#admin-avatar-preview", body).innerHTML = avatarHtml(user, "avatar-lg");
    }
  };
  $("#save-name", body).onclick = async () => {
    const displayName = $("#user-name", body).value.trim();
    if (!displayName) {
      $("#user-name", body).setCustomValidity("Tên hiển thị không được để trống.");
      $("#user-name", body).reportValidity();
      return;
    }
    $("#user-name", body).setCustomValidity("");
    const nameChanged = displayName !== (user.display_name || "");
    if (!nameChanged && !avatarFile) return;
    if (nameChanged && !(await confirmBox(`Lưu thông tin${avatarFile ? " và ảnh đại diện" : ""} cho ${user.email}?`, { okText: "Lưu", danger: false }))) return;
    const button = $("#save-name", body);
    button.disabled = true;
    const updated = await act(async () => {
      const updates = {};
      if (nameChanged) updates.display_name = displayName;
      if (avatarFile) {
        let avatarUrl;
        try {
          avatarUrl = await api.uploadAvatar(user.id, avatarFile);
        } catch (error) {
          throw new Error(`Không tải được ảnh lên Supabase Storage: ${error.message}`);
        }
        updates.avatar_url = avatarUrl;
      }
      try {
        return await api.updateUserProfile(user.id, updates);
      } catch (error) {
        throw new Error(avatarFile
          ? `Ảnh đã tải lên nhưng không cập nhật được hồ sơ: ${error.message}`
          : error.message);
      }
    }, "Đã cập nhật thông tin");
    button.disabled = false;
    if (updated) {
      user.display_name = updated.display_name;
      user.avatar_url = updated.avatar_url;
      avatarFile = null;
      $("#admin-avatar-file", body).value = "";
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = null;
      $("#admin-avatar-preview", body).innerHTML = avatarHtml(user, "avatar-lg");
    }
  };

  $("#user-role", body).onchange = async (event) => {
    const role = event.target.value;
    if (role === user.role) return;
    const roleName = role === "admin" ? "Quản trị viên" : "Học viên";
    if (!(await confirmBox(`Đổi quyền của ${user.email} thành "${roleName}"?`, { okText: "Đổi quyền", danger: false }))) {
      event.target.value = user.role;
      return;
    }
    if (await act(() => api.setUserRole(user.id, role), "Đã cập nhật quyền")) {
      await viewAdminUserAccount({ id });
    } else {
      event.target.value = user.role;
    }
  };

  $("#user-primary-field", body).onchange = async (event) => {
    const primaryFieldId = event.target.value || null;
    if (primaryFieldId === user.primary_field_id) return;
    const fieldName = fields.find((field) => field.id === primaryFieldId);
    const label = fieldName ? fieldName.name_vi || fieldName.name : "chưa chọn ngành chính";
    if (!(await confirmBox(`Đặt "${label}" làm ngành chính của ${user.email}?`, { okText: "Lưu ngành chính", danger: false }))) {
      event.target.value = user.primary_field_id || "";
      return;
    }
    if (await act(() => api.setUserPrimaryField(user.id, primaryFieldId), "Đã cập nhật ngành chính")) {
      user.primary_field_id = primaryFieldId;
    } else {
      event.target.value = user.primary_field_id || "";
    }
  };

  if (isAdmin) return;

  $("#toggle-active", body).onclick = async () => {
    const nextActive = !user.is_active;
    const message = nextActive
      ? `Mở lại tài khoản ${user.email}? Người dùng sẽ có thể đăng nhập và học trở lại.`
      : `Ẩn tài khoản ${user.email}? Người dùng sẽ bị đăng xuất và không thể truy cập dữ liệu học tập cho đến khi được mở lại.`;
    if (!(await confirmBox(message, { okText: nextActive ? "Hiện tài khoản" : "Ẩn tài khoản" }))) return;
    if (await act(() => api.setUserActive(user.id, nextActive), nextActive ? "Đã mở tài khoản" : "Đã ẩn tài khoản")) {
      user.is_active = nextActive;
      await viewAdminUserAccount({ id });
    }
  };

  $("#delete-account", body).onclick = async () => {
    if (!(await confirmBox(
      `Xóa vĩnh viễn tài khoản ${user.email}? Hồ sơ, tiến độ học và điểm của người dùng sẽ bị xóa. Thao tác này không thể hoàn tác.`,
      { okText: "Xóa tài khoản" }
    ))) return;
    if (await act(() => api.deleteUser(user.id), "Đã xóa tài khoản")) go("/admin/users");
  };
}

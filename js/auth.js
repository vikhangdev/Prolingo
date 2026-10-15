/* ============================================================
   AUTH — đăng ký, đăng nhập, đăng xuất, đổi / quên mật khẩu, hồ sơ
   ============================================================ */
import { sb } from "./supabase.js";
import { toast } from "./utils.js";
import { uploadAvatar } from "./api.js";

const REGISTRATION_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "student.ctu.edu.vn",
  "student.ctuet.edu.vn",
  "student.ctump.edu.vn",
  "student.nctu.edu.vn",
  "st.tdu.edu.vn",
]);

export function isAllowedRegistrationEmail(email) {
  const parts = email.trim().toLowerCase().split("@");
  return parts.length === 2 && REGISTRATION_EMAIL_DOMAINS.has(parts[1]);
}

export const Auth = {
  user: null, // auth user
  profile: null, // { id, email, display_name, role }
  recovery: false, // đang ở phiên đặt lại mật khẩu
  listeners: new Set(),

  get isAdmin() { return this.profile?.role === "admin"; },
  get name() { return this.profile?.display_name || this.user?.email?.split("@")[0] || "Bạn"; },
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  emit() { this.listeners.forEach((fn) => fn(this)); },

  /** Gọi 1 lần khi khởi động */
  async init() {
    sb.auth.onAuthStateChange((event, session) => {
      // KHÔNG gọi supabase bên trong callback này (tránh deadlock) → hoãn sang tick sau
      setTimeout(async () => {
        if (event === "PASSWORD_RECOVERY") this.recovery = true;
        await this.apply(session);
        this.emit();
      }, 0);
    });
    const { data } = await sb.auth.getSession();
    await this.apply(data.session);

    // Link "quên mật khẩu" quay về với ?reset=1
    const qs = new URLSearchParams(location.search);
    if (qs.get("reset") === "1" && this.user) this.recovery = true;
    if (qs.has("code") || qs.has("reset")) {
      history.replaceState(null, "", location.pathname + (location.hash || ""));
    }
  },

  async apply(session) {
    const prev = this.user?.id;
    this.user = session?.user || null;
    if (!this.user) { this.profile = null; this.recovery = false; return; }
    if (prev !== this.user.id || !this.profile) await this.loadProfile();
    if (this.profile?.is_active === false) {
      await sb.auth.signOut();
      this.user = null;
      this.profile = null;
      this.recovery = false;
      toast("Tài khoản đã bị ẩn. Hãy liên hệ quản trị viên để được hỗ trợ.", "err");
    }
  },

  async loadProfile() {
    const { data, error } = await sb.from("profiles").select("*").eq("id", this.user.id).maybeSingle();
    if (error) console.warn("Không đọc được profile:", error.message);
    this.profile = data || { id: this.user.id, email: this.user.email, display_name: null, role: "user", is_active: true };
  },

  base() { return location.origin + location.pathname; },

  async signUp({ email, password, name, primaryFieldId = null }) {
    const { data, error } = await sb.auth.signUp({
      email, password,
      options: { data: { display_name: name, primary_field_id: primaryFieldId }, emailRedirectTo: this.base() },
    });
    if (error) throw error;
    // Nếu Supabase bật "Confirm email" → chưa có session, cần xác nhận qua email
    return { needsConfirm: !data.session };
  },

  async reportBlockedSignupEmail(email) {
    const { error } = await sb.rpc("report_blocked_signup_email", { attempted_email: email.trim().toLowerCase() });
    if (error) throw error;
  },

  async signIn({ email, password }) {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },

  async signOut() {
    await sb.auth.signOut();
    this.recovery = false;
  },

  async sendReset(email) {
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: this.base() + "?reset=1" });
    if (error) throw error;
  },

  /** Đặt mật khẩu mới (dùng cả cho đổi mật khẩu & đặt lại sau khi quên) */
  async updatePassword(password) {
    const { error } = await sb.auth.updateUser({ password });
    if (error) throw error;
    this.recovery = false;
  },

  /** Đổi mật khẩu có kiểm tra mật khẩu cũ */
  async changePassword(oldPassword, newPassword) {
    const { error } = await sb.auth.signInWithPassword({ email: this.user.email, password: oldPassword });
    if (error) throw new Error("Mật khẩu hiện tại không đúng.");
    await this.updatePassword(newPassword);
  },

  async updateName(display_name) {
    const { data, error } = await sb.from("profiles").update({ display_name }).eq("id", this.user.id).select().single();
    if (error) throw error;
    this.profile = data;
    this.emit();
  },

  async updateProfile({ display_name, primary_field_id, avatarFile }) {
    let avatar_url;
    if (avatarFile) {
      try {
        avatar_url = await uploadAvatar(this.user.id, avatarFile);
      } catch (error) {
        throw new Error(`Không tải được ảnh lên Supabase Storage: ${error.message}`);
      }
    }
    const updates = { display_name, primary_field_id };
    if (avatarFile) updates.avatar_url = avatar_url;
    const { data, error } = await sb.from("profiles")
      .update(updates)
      .eq("id", this.user.id)
      .select()
      .single();
    if (error) {
      throw new Error(avatarFile
        ? `Ảnh đã tải lên nhưng không cập nhật được hồ sơ: ${error.message}`
        : error.message);
    }
    this.profile = data;
    this.emit();
  },
};

/** Dịch lỗi Supabase Auth sang tiếng Việt dễ hiểu */
export function authError(e) {
  const m = (e && e.message) || String(e);
  if (/Invalid login credentials/i.test(m)) return "Email hoặc mật khẩu không đúng.";
  if (/Email not confirmed/i.test(m)) return "Email chưa được xác nhận. Hãy mở email và bấm vào liên kết xác nhận.";
  if (/already registered|already been registered/i.test(m)) return "Email này đã được đăng ký. Hãy đăng nhập hoặc dùng \"Quên mật khẩu\".";
  if (/Password should be at least/i.test(m)) return "Mật khẩu quá ngắn (tối thiểu 6 ký tự).";
  if (/rate limit|too many/i.test(m)) return "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.";
  if (/same password|different from the old/i.test(m)) return "Mật khẩu mới phải khác mật khẩu cũ.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.";
  return m;
}

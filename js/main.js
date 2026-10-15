/* ============================================================
   MAIN — khởi động ứng dụng, header, route, phân quyền
   ============================================================ */
import { configured } from "./supabase.js";
import * as api from "./api.js";
import { APP_NAME } from "./config.js";
import { $, esc, avatarHtml } from "./utils.js";
import { Auth } from "./auth.js";
import { Progress } from "./progress.js";
import { route, onNotFound, beforeEach, startRouter, resolve, path, go } from "./router.js";
import { initTooltip, loadGlossary } from "./dictionary.js";
import { startMascot, stopMascot, renderHud } from "./mascot.js";
import { viewWelcome, viewReset, viewAccount, rememberNext } from "./views/auth.js";
import { viewHome, viewField, viewUnit, viewStudy } from "./views/learn.js";
import { viewProgress } from "./views/progress.js";
import { viewAdminHome } from "./views/admin/index.js";
import { viewAdminFields } from "./views/admin/fields.js";
import { viewAdminUnits } from "./views/admin/units.js";
import { viewAdminWords } from "./views/admin/words.js";
import { viewAdminExercises } from "./views/admin/exercises.js";
import { viewAdminUsers } from "./views/admin/users.js";
import { viewAdminSignupAlerts } from "./views/admin/signup-alerts.js";
import { viewAdminStudent } from "./views/admin/student.js";
import { viewAdminUserAccount } from "./views/admin/user-account.js";
import { viewAdminData } from "./views/admin/data.js";
import { app, setCrumbs, theme } from "./views/shared.js";

$("#brandName").textContent = APP_NAME;

/* ---------- Chưa cấu hình Supabase ---------- */
if (!configured) {
  app().innerHTML = `<div class="empty-state" style="max-width:640px;margin:40px auto;text-align:left">
    <div class="big">🔧</div><h2>Chưa kết nối Supabase</h2>
    <p>Mở file <code>js/config.js</code> và điền <b>SUPABASE_URL</b> + <b>SUPABASE_ANON_KEY</b> (Supabase → Project Settings → API). Hướng dẫn đầy đủ nằm trong <code>README.md</code>.</p></div>`;
  throw new Error("Supabase chưa được cấu hình (js/config.js)");
}

/* ---------- Thanh trên cùng ---------- */
function renderChrome() {
  const authed = !!Auth.user;
  document.body.dataset.auth = authed ? "in" : "out";
  $("#lk").hidden = !authed;
  const p = path();
  const link = (href, text, match) => `<a href="#${href}" ${match(p) ? 'aria-current="page"' : ""}>${text}</a>`;
  $("#nav").innerHTML = authed
    ? link("/", "Học tập", (x) => x === "/" || /^\/(f|u)\//.test(x)) + link("/progress", "Tiến độ", (x) => x === "/progress") + (Auth.isAdmin ? link("/admin", "Quản trị", (x) => x.startsWith("/admin")) : "")
    : "";
  const ub = $("#userbox");
  if (!authed) {
    ub.innerHTML = `<a class="btn ghost sm" href="#/login" style="background:transparent;color:#fff;border-color:rgba(255,255,255,.4)">Đăng nhập</a><a class="btn hi sm" href="#/register">Đăng ký</a>`;
    return;
  }
  ub.innerHTML = `<button class="menu-btn" id="mb" aria-haspopup="true" aria-expanded="false"><span class="who">${esc(Auth.name)}</span>${avatarHtml(Auth.profile)}</button>
    <div class="menu" id="menu" hidden><div class="who-card"><b>${esc(Auth.name)}</b><span>${esc(Auth.user.email)}</span><br><span class="role-badge">${Auth.isAdmin ? "Quản trị viên" : "Học viên"}</span></div>
    <a href="#/account">👤 Tài khoản & mật khẩu</a><a href="#/progress">📈 Tiến độ học tập</a>${Auth.isAdmin ? '<a href="#/admin">🛠️ Quản trị</a>' : ""}<button id="so">🚪 Đăng xuất</button></div>`;
  const menu = $("#menu"), mb = $("#mb");
  mb.onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; mb.setAttribute("aria-expanded", String(!menu.hidden)); };
  menu.onclick = (e) => { if (e.target.closest("a")) menu.hidden = true; };
  $("#so").onclick = () => Auth.signOut();
}
document.addEventListener("click", (e) => { const m = $("#menu"); if (m && !m.hidden && !e.target.closest(".userbox")) m.hidden = true; });
addEventListener("hashchange", renderChrome);

/* ---------- Route ---------- */
const PUBLIC = /^\/(login|register|forgot|reset)$/;
beforeEach((p, r) => {
  if (Auth.recovery && p !== "/reset") { go("/reset"); return false; }
  if (p === "/reset") return true;
  if (!Auth.user) {
    if (PUBLIC.test(p)) return true;
    if (p !== "/") rememberNext(p);
    if (p !== "/login") { viewWelcome("login"); }
    return false;
  }
  if (PUBLIC.test(p)) { go("/"); return false; }
  if (p.startsWith("/admin") && !Auth.isAdmin) { go("/"); return false; }
  return true;
});

route("/", () => (Auth.user ? viewHome() : viewWelcome("login")));
route("/login", () => viewWelcome("login"));
route("/register", () => viewWelcome("register"));
route("/forgot", () => viewWelcome("forgot"));
route("/reset", viewReset);
route("/account", viewAccount);
route("/progress", viewProgress);
route("/f/:slug", viewField);
route("/u/:id", viewUnit);
route("/u/:id/:sec", viewStudy);
route("/admin", viewAdminHome);
route("/admin/fields", viewAdminFields);
route("/admin/units", viewAdminUnits);
route("/admin/words", viewAdminWords);
route("/admin/exercises", viewAdminExercises);
route("/admin/users", viewAdminUsers);
route("/admin/signup-alerts", viewAdminSignupAlerts);
route("/admin/users/:id", viewAdminStudent);
route("/admin/users/:id/manage", viewAdminUserAccount);
route("/admin/data", viewAdminData);
onNotFound(() => {
  theme(); setCrumbs("");
  app().innerHTML = `<div class="empty-state"><div class="big">🧭</div><h3>Không tìm thấy trang</h3><a class="btn" href="#/">Về trang chủ</a></div>`;
});

/* ---------- Khởi động ---------- */
let lastUser = undefined;
let presenceUserId = null;
let presenceTimer = null;

async function updatePresence() {
  try {
    await api.touchOnlinePresence();
  } catch (error) {
    console.warn("Không cập nhật được trạng thái truy cập:", error.message || error);
  }
}

function trackPresence(userId) {
  if (presenceUserId === userId) return;
  if (presenceTimer) clearInterval(presenceTimer);
  if (presenceUserId) {
    api.clearOnlinePresence(presenceUserId).catch((error) => {
      console.warn("Không xóa được trạng thái truy cập:", error.message || error);
    });
  }

  presenceUserId = userId;
  presenceTimer = null;
  if (!userId) return;

  updatePresence();
  presenceTimer = setInterval(updatePresence, 60_000);
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && presenceUserId) updatePresence();
});
window.addEventListener("focus", () => {
  if (presenceUserId) updatePresence();
});

async function onAuth() {
  const uid = Auth.user?.id || null;
  const changed = uid !== lastUser;
  lastUser = uid;
  if (changed) {
    trackPresence(uid);
    if (uid) {
      await Promise.all([Progress.load().catch((e) => console.warn(e.message)), loadGlossary()]);
      startMascot();
    } else { Progress.reset(); stopMascot(); }
    renderHud();
  }
  renderChrome();
  if (changed || Auth.recovery) {
    if (!uid) location.hash = "#/";
    resolve();
  }
}

initTooltip();
Auth.onChange(onAuth);
await Auth.init();
lastUser = Auth.user?.id || null;
trackPresence(lastUser);
if (Auth.user) {
  await Promise.all([Progress.load().catch((e) => console.warn(e.message)), loadGlossary()]);
  startMascot();
}
renderHud();
renderChrome();
await startRouter();

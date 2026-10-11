/* ============================================================
   MASCOT · HUD · CONFETTI — bạn trâu cổ vũ khi học
   ============================================================ */
import { $ } from "./utils.js";
import { Progress } from "./progress.js";

let STREAK = 0;

const MSG = {
  hello: ["Chào bạn! Hôm nay mình cùng ôn bài nhé! 🐃", "Nghé ọ! Sẵn sàng chưa nào? 💪", "Mỗi ngày một chút, kiến thức sẽ đầy giỏ! 🧺"],
  correct: ["Giỏi quá! 🎉", "Chuẩn luôn! ⭐", "Đúng rồi, cứ đà này nhé!", "Quá đỉnh! 👏", "Trâu cũng phải gật đầu khen! 🐃"],
  wrong: ["Sai không sao, đọc lời giải thích là nhớ lâu hơn nè!", "Cố lên! Mỗi lỗi sai là một bài học 💪", "Đừng nản nhé, trâu chậm mà chắc!", "Bình tĩnh, lần sau sẽ đúng thôi! 🌱"],
  streak: ["{n} câu đúng liên tiếp! 🔥", "Bốc lửa rồi! {n} câu liền! 🔥🔥"],
  idle: ["Kiên trì là chìa khóa! 🔑", "Nhớ ngồi thẳng lưng nha 🪑", "Học chậm mà chắc, đừng bỏ cuộc!", "Một chút nỗ lực mỗi ngày, bạn làm được! 💪", "Ôn xong thưởng cho mình món ngon nhé 😋", "Trâu tin bạn sẽ vượt qua kỳ thi! 🌟", "Từng từ một, bạn đang tiến bộ đó! 📈"],
  water: ["Uống nước đi bạn ơi! 💧", "Đến giờ uống nước rồi, não cần nước để nhớ bài! 💧", "Một ly nước lọc nào! 🥤"],
  rest: ["Nghỉ mắt 20 giây, nhìn ra xa một chút nhé 👀", "Đứng dậy vươn vai chút nào! 🙆", "Hít thở sâu 3 nhịp rồi học tiếp nhé 🌿"],
  done_good: ["Xuất sắc! Bài này bạn nắm chắc rồi! 🏆", "Điểm cao quá, trâu tự hào về bạn! 🎊"],
  done_mid: ["Khá lắm! Làm lại câu sai là nhớ liền 💪"],
  done_low: ["Không sao, ôn thêm một lượt nữa sẽ tốt hơn! 🌱"],
  click: ["Nghé ọ! 🐃", "Gọi trâu hả? Cố lên nhé!", "Mình đang cổ vũ bạn đây! 📣"],
};

const KEY = "nghe_mascot_hidden";
let t = null, last = 0, lastWater = Date.now(), lastRest = Date.now(), hidden = false, running = false, timer = null, enabled = false;
try { hidden = localStorage.getItem(KEY) === "1"; } catch (e) { /* ignore */ }

function apply() {
  const m = $("#mascot"), s = $("#mShow");
  if (!m) return;
  m.style.display = enabled && !hidden ? "block" : "none";
  s.style.display = enabled && hidden ? "grid" : "none";
}

export function say(cat, v, force) {
  if (!enabled || hidden || !$("#mascot")) return;
  const now = Date.now();
  if (!force && now - last < 2500) return;
  last = now;
  const a = MSG[cat] || MSG.idle;
  let m = a[(Math.random() * a.length) | 0];
  Object.keys(v || {}).forEach((k) => (m = m.replace("{" + k + "}", v[k])));
  const b = $("#mBubble");
  b.textContent = m;
  b.classList.add("show");
  const body = $("#mBody");
  body.classList.add("cheer");
  setTimeout(() => body.classList.remove("cheer"), 1300);
  clearTimeout(t);
  t = setTimeout(() => b.classList.remove("show"), cat === "water" || cat === "rest" ? 7000 : 5200);
}

function tick() {
  const now = Date.now();
  if (hidden || !enabled) return;
  if (now - lastWater > 11 * 60000) { lastWater = now; say("water", {}, true); return; }
  if (now - lastRest > 27 * 60000) { lastRest = now; say("rest", {}, true); return; }
  if (now - last > 55000) say("idle");
}

/** Bật bạn trâu (sau khi đăng nhập) */
export function startMascot() {
  enabled = true;
  apply();
  if (running) return;
  running = true;
  $("#mHide").onclick = (e) => {
    e.stopPropagation();
    hidden = true;
    try { localStorage.setItem(KEY, "1"); } catch (x) { /* ignore */ }
    apply();
  };
  $("#mShow").onclick = () => {
    hidden = false;
    try { localStorage.setItem(KEY, "0"); } catch (x) { /* ignore */ }
    apply();
    say("hello", {}, true);
  };
  $("#mBody").onclick = () => say("click", {}, true);
  setTimeout(() => say("hello", {}, true), 1400);
  timer = setInterval(tick, 15000);
}

/** Tắt bạn trâu (khi đăng xuất) */
export function stopMascot() {
  enabled = false;
  apply();
}

/* ---------- HUD trên thanh trên cùng ---------- */
export function renderHud() {
  const h = $("#hud");
  if (!h) return;
  const { ok } = Progress.totals();
  h.innerHTML = enabled
    ? `<span class="hp" title="Tổng số câu đã làm đúng">⭐ ${ok}</span>${STREAK >= 2 ? `<span class="hp fire" title="Chuỗi đúng liên tiếp">🔥 ${STREAK}</span>` : ""}`
    : "";
}

/** Gọi sau mỗi câu trả lời */
export function react(ok, n = 1) {
  const before = STREAK;
  STREAK = ok ? STREAK + n : 0;
  renderHud();
  if (ok) {
    if (Math.floor(STREAK / 5) > Math.floor(before / 5)) { say("streak", { n: STREAK }, true); confetti(70); }
    else if (Math.random() < 0.45) say("correct");
  } else say("wrong");
}
export const resetStreak = () => { STREAK = 0; renderHud(); };

export function confetti(n) {
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c = $("#cf");
  if (!c || !c.getContext) return;
  const x = c.getContext("2d");
  if (!x) return;
  c.width = innerWidth;
  c.height = innerHeight;
  const cols = ["#d6403f", "#2342c4", "#ffe14d", "#1c7a45", "#ec4899", "#0ea5e9", "#f59e0b"];
  const ps = Array.from({ length: n || 140 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 240, y: innerHeight * 0.55,
    vx: (Math.random() - 0.5) * 15, vy: -Math.random() * 15 - 6,
    s: Math.random() * 8 + 5, c: cols[(Math.random() * cols.length) | 0],
    r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
  }));
  let f = 0;
  (function step() {
    x.clearRect(0, 0, c.width, c.height);
    ps.forEach((p) => {
      p.vy += 0.36; p.vx *= 0.992; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c;
      x.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.6);
      x.restore();
    });
    if (++f < 140) requestAnimationFrame(step);
    else x.clearRect(0, 0, c.width, c.height);
  })();
}

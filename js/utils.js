/* Tiện ích dùng chung */
export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];

export const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** **đậm** + xuống dòng, đã escape */
export const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");

/** Bọc từng từ tiếng Anh trong <span class="w"> để rê chuột tra nghĩa / bấm nghe */
export const words = (t) =>
  String(t)
    .split(/([A-Za-z][A-Za-z’'\-]*)/)
    .map((p, i) => (i % 2 ? `<span class="w">${esc(p)}</span>` : esc(p)))
    .join("");

export function toast(msg, type = "") {
  const box = $("#toasts");
  const d = document.createElement("div");
  d.className = "toast " + type;
  d.textContent = msg;
  box.appendChild(d);
  setTimeout(() => d.remove(), type === "err" ? 4200 : 2400);
}

export const shuffle = (a) => {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
};
export const shuffledIdx = (n) => shuffle([...Array(n).keys()]);

export const debounce = (fn, ms = 300) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("vi-VN") : "—");
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "—");
export const dayKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
export const initial = (name) => (String(name || "?").trim()[0] || "?").toUpperCase();
export const hueOf = (str) => [...String(str || "")].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
export const slugify = (s) =>
  String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export const SECTIONS = {
  bank: { n: "Word Bank", vi: "Từ vựng & thẻ ghi nhớ", ic: "🗂️" },
  vocab: { n: "Vocabulary", vi: "Từ vựng", ic: "📚" },
  lang: { n: "Language Spot", vi: "Ngữ pháp", ic: "🧩" },
  read: { n: "Reading", vi: "Đọc hiểu", ic: "📖" },
};
export const SECTION_KEYS = ["bank", "vocab", "lang", "read"];

/** Màu chủ đạo của một ngành/unit → đặt lên <body> để cả trang đổi tông */
export function setTheme(hue) {
  document.body.style.setProperty("--h", hue == null ? 222 : hue);
}

/* ---------- Dialog (modal) dùng chung ---------- */
export function openDialog({ title, body, foot = "", wide = false, onMount }) {
  const dlg = $("#dlg");
  dlg.className = wide ? "wide" : "";
  dlg.innerHTML = `<div class="dlg-head"><h3>${esc(title)}</h3><button class="dlg-x" type="button" aria-label="Đóng">✕</button></div>
    <div class="dlg-body">${body}</div>${foot ? `<div class="dlg-foot">${foot}</div>` : ""}`;
  $(".dlg-x", dlg).onclick = () => dlg.close();
  if (!dlg.open) dlg.showModal();
  onMount && onMount(dlg);
  return dlg;
}
export const closeDialog = () => {
  const d = $("#dlg");
  if (d.open) d.close();
};

/** Hộp xác nhận → Promise<boolean> */
export function confirmBox(message, { okText = "Xóa", danger = true } = {}) {
  return new Promise((resolve) => {
    const dlg = openDialog({
      title: "Xác nhận",
      body: `<p style="margin:0">${esc(message)}</p>`,
      foot: `<button class="btn ghost" id="cNo" type="button">Hủy</button><button class="btn ${danger ? "danger" : ""}" id="cYes" type="button">${esc(okText)}</button>`,
    });
    let done = false;
    const fin = (v) => { if (!done) { done = true; resolve(v); } closeDialog(); };
    $("#cNo", dlg).onclick = () => fin(false);
    $("#cYes", dlg).onclick = () => fin(true);
    dlg.addEventListener("close", () => { if (!done) { done = true; resolve(false); } }, { once: true });
  });
}

/** Thông báo chặn (không cho làm) → Promise khi người dùng đóng */
export function notice(message, title = "Không thể xóa") {
  return new Promise((resolve) => {
    const dlg = openDialog({
      title,
      body: `<div class="alert err" style="margin:0">${esc(message)}</div>`,
      foot: `<button class="btn" id="nOk" type="button">Đã hiểu</button>`,
    });
    $("#nOk", dlg).onclick = closeDialog;
    dlg.addEventListener("close", resolve, { once: true });
  });
}

export const errMsg = (e) => {
  const m = (e && (e.message || e.error_description || e.details)) || String(e || "Có lỗi xảy ra");
  if (/violates foreign key constraint/i.test(m)) return "Không thể xóa vì còn dữ liệu con phụ thuộc. Hãy xóa các mục con trước (Câu hỏi → Bài tập / Từ vựng → Unit → Ngành).";
  return m;
};

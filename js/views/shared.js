import { $, esc, setTheme } from "../utils.js";

export const app = () => $("#app");
export const loading = (msg = "Đang tải…") => { app().innerHTML = `<div class="loading"><div class="spin"></div>${esc(msg)}</div>`; };
export const showError = (e) => {
  app().innerHTML = `<div class="empty-state"><div class="big">⚠️</div><h3>Không tải được dữ liệu</h3><p>${esc(e.message || e)}</p><button class="btn" onclick="location.reload()">Tải lại</button></div>`;
  console.error(e);
};
export const setCrumbs = (t) => { $("#crumbs").textContent = t || ""; };
export const theme = (h) => setTheme(h);
export const unitHue = (u, field, idx) => (u.hue != null ? u.hue : ((field?.hue ?? 222) + idx * 37) % 360);
export const pctOf = (a, b) => (b ? Math.round((a / b) * 100) : 0);
export const unitTotal = (s) => s.n_words + s.n_vocab + s.n_lang + s.n_read;

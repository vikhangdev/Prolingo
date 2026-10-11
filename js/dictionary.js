/* ============================================================
   DICTIONARY — tra nghĩa khi rê chuột, phát âm, dịch câu
   Thứ tự tra: từ điển trong bộ nhớ (glossary + từ vựng đã mở)
              → bảng words/glossary trên Supabase
              → MyMemory API (cần Internet)
   ============================================================ */
import * as api from "./api.js";
import { $, esc, toast } from "./utils.js";

const MAP = new Map(); // en_key -> vi
let glossaryLoaded = false;

export async function loadGlossary() {
  if (glossaryLoaded) return;
  try {
    (await api.loadGlossary()).forEach((g) => MAP.set(g.en_key, g.vi));
    glossaryLoaded = true;
  } catch (e) { console.warn("Không tải được từ điển:", e.message); }
}

/** Thêm từ vựng của unit đang học vào từ điển bộ nhớ */
export function addWords(list) {
  list.forEach((w) => {
    const k = w.en.toLowerCase().trim();
    MAP.set(k, MAP.get(k) || w.vi);
    const bare = k.replace(/^-|-$/g, "");
    if (bare && !MAP.has(bare)) MAP.set(bare, w.vi);
  });
}

/** Các dạng gốc có thể có của một từ (số nhiều, quá khứ, -ing...) */
export function cands(w) {
  w = w.toLowerCase().replace(/[’]/g, "'");
  const c = [w, w.replace(/'s$/, "")];
  [
    [/ies$/, "y"], [/es$/, ""], [/s$/, ""], [/ed$/, ""], [/ed$/, "e"], [/d$/, ""], [/ing$/, ""], [/ing$/, "e"],
    [/ly$/, ""], [/ily$/, "y"], [/er$/, ""], [/er$/, "e"], [/est$/, ""], [/ier$/, "y"], [/iest$/, "y"],
    [/ally$/, "al"], [/ically$/, "ic"],
  ].forEach(([r, s]) => { if (r.test(w)) c.push(w.replace(r, s)); });
  if (/(.)\1ing$/.test(w)) c.push(w.replace(/(.)\1ing$/, "$1"));
  return [...new Set(c)];
}

export function glossLookup(w) {
  for (const c of cands(w)) if (MAP.has(c)) return MAP.get(c);
  return null;
}

const cache = new Map();
export async function apiTr(text) {
  const k = text.toLowerCase();
  if (cache.has(k)) return cache.get(k);
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 7000);
  try {
    const r = await fetch("https://api.mymemory.translated.net/get?q=" + encodeURIComponent(text) + "&langpair=en|vi", { signal: ctrl.signal });
    const j = await r.json();
    const t = (j.responseData && j.responseData.translatedText) || "";
    if (!t || /MYMEMORY WARNING|QUERY LENGTH/i.test(t)) throw 0;
    cache.set(k, t);
    return t;
  } catch (e) { return null; }
  finally { clearTimeout(to); }
}

/** Tra 1 từ/cụm: bộ nhớ → Supabase → API */
export async function translate(text) {
  const t = text.trim();
  const local = MAP.get(t.toLowerCase()) || (!/\s/.test(t) && glossLookup(t));
  if (local) return local;
  try {
    const rows = await api.lookupWords(cands(t));
    if (rows.length) { rows.forEach((r) => MAP.set(r.en_key, r.vi)); return rows[0].vi; }
  } catch (e) { /* bỏ qua, dùng API ngoài */ }
  return apiTr(t);
}

/** Dịch đoạn dài, cắt theo câu */
export async function trLong(t) {
  const chunks = [];
  let cur = "";
  t.split(/(?<=[.!?])\s+/).forEach((s) => {
    if ((cur + " " + s).length > 430) { chunks.push(cur); cur = s; }
    else cur = (cur ? cur + " " : "") + s;
  });
  if (cur) chunks.push(cur);
  const out = [];
  for (const c of chunks) {
    const x = await apiTr(c);
    if (!x) return null;
    out.push(x);
  }
  return out.join(" ");
}

/* ---------- Phát âm ---------- */
let voice = null;
function pickVoice() {
  const v = speechSynthesis.getVoices();
  voice =
    v.find((x) => /en[-_]US/i.test(x.lang) && /Google|Samantha|Microsoft|Natural/i.test(x.name)) ||
    v.find((x) => /^en/i.test(x.lang)) || null;
}
if ("speechSynthesis" in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }

export function speak(t) {
  if (!("speechSynthesis" in window)) return toast("Trình duyệt chưa hỗ trợ phát âm", "err");
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(t);
  u.lang = "en-US";
  u.rate = 0.88;
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}

/* ---------- Tooltip khi rê chuột / bấm vào từ ---------- */
const tip = () => $("#tip");
let tipT = null, curWord = "";

function placeTip(el) {
  const t = tip(), r = el.getBoundingClientRect();
  t.style.display = "block";
  const tw = t.offsetWidth, th = t.offsetHeight;
  const x = Math.min(Math.max(8, r.left), innerWidth - tw - 8);
  let y = r.bottom + 8;
  if (y + th > innerHeight - 70) y = r.top - th - 8;
  t.style.right = "auto";
  t.style.left = x + "px";
  t.style.top = Math.max(8, y) + "px";
}

async function showTip(el) {
  clearTimeout(tipT);
  const w = el.textContent;
  curWord = w;
  const g = glossLookup(w);
  tip().innerHTML = `<div class="tw">${esc(w)} <button data-sp="1" aria-label="Nghe phát âm">🔊</button></div><div class="tv">${g ? esc(g) : "Đang tra…"}</div>`;
  placeTip(el);
  if (!g) {
    const t = await translate(w);
    if (curWord !== w) return;
    tip().querySelector(".tv").textContent = t || "Chưa có trong từ điển (cần Internet để tra thêm).";
    placeTip(el);
  }
}
const hideTip = () => { tip().style.display = "none"; };

export function initTooltip() {
  document.addEventListener("mouseover", (e) => {
    const w = e.target.closest && e.target.closest(".w");
    if (w) showTip(w);
  });
  document.addEventListener("mouseout", (e) => {
    if (e.target.closest && e.target.closest(".w")) { clearTimeout(tipT); tipT = setTimeout(hideTip, 350); }
  });
  tip().addEventListener("mouseenter", () => clearTimeout(tipT));
  tip().addEventListener("mouseleave", () => { tipT = setTimeout(hideTip, 250); });
  tip().addEventListener("click", (e) => { if (e.target.dataset.sp) speak(curWord); });
  document.addEventListener("click", (e) => {
    const w = e.target.closest && e.target.closest(".w");
    if (w) { if (!w.closest(".opt")) speak(w.textContent); showTip(w); }
    else if (!e.target.closest("#tip")) hideTip();
  });

  // ô "Tra từ / cụm từ" trên thanh trên cùng
  $("#lk").addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = $("#lkin").value.trim();
    if (!v) return;
    speak(v);
    const t = tip();
    t.innerHTML = `<div class="tw">${esc(v)} <button data-sp="1" aria-label="Nghe phát âm">🔊</button></div><div class="tv">Đang tra…</div>`;
    curWord = v;
    t.style.display = "block";
    t.style.left = "auto"; t.style.right = "16px"; t.style.top = "62px";
    const r = await translate(v);
    t.querySelector(".tv").textContent = r || "Chưa có trong từ điển (cần Internet).";
    clearTimeout(tipT);
    tipT = setTimeout(hideTip, 6000);
  });
}

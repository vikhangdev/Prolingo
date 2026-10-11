/* ============================================================
   PROGRESS — tiến độ học tập của người dùng (đồng bộ lên Supabase)
   Mỗi câu hỏi / mỗi từ vựng chỉ có 1 dòng: kết quả MỚI NHẤT (đúng / sai).
   ============================================================ */
import * as api from "./api.js";
import { Auth } from "./auth.js";
import { dayKey } from "./utils.js";

const keyOf = (r) => (r.question_id ? "q:" + r.question_id : "w:" + r.word_id);

export const Progress = {
  items: new Map(), // key -> { ok, unit_id, section, at }
  scores: new Map(), // ex_key -> { best, last, attempts }
  agg: {}, // unit_id -> { section -> { done, ok } }
  queue: new Map(),
  timer: null,
  loaded: false,

  reset() {
    this.items.clear(); this.scores.clear(); this.agg = {}; this.queue.clear(); this.loaded = false;
  },

  async load() {
    this.reset();
    if (!Auth.user) return;
    const [rows, scores] = await Promise.all([api.loadProgress(Auth.user.id), api.loadScores(Auth.user.id)]);
    rows.forEach((r) => this.put(keyOf(r), r.unit_id, r.section, r.ok, r.updated_at));
    scores.forEach((s) => this.scores.set(s.ex_key, s));
    this.loaded = true;
  },

  put(key, unit_id, section, ok, at) {
    const old = this.items.get(key);
    const a = ((this.agg[unit_id] ||= {})[section] ||= { done: 0, ok: 0 });
    if (old) { if (old.ok) a.ok--; } else a.done++;
    if (ok) a.ok++;
    this.items.set(key, { ok, unit_id, section, at });
  },

  /** Ghi nhận 1 câu trả lời. target = { qid } hoặc { wid } */
  mark({ unitId, section, qid, wid, ok }) {
    if (!Auth.user || (!qid && !wid)) return;
    const at = new Date().toISOString();
    const key = qid ? "q:" + qid : "w:" + wid;
    this.put(key, unitId, section, ok, at);
    this.queue.set(key, {
      user_id: Auth.user.id, unit_id: unitId, section,
      question_id: qid || null, word_id: wid || null, ok, updated_at: at,
    });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 900);
  },

  async flush() {
    if (!this.queue.size) return;
    const rows = [...this.queue.values()];
    this.queue.clear();
    try { await api.saveProgress(rows); }
    catch (e) { console.warn("Lưu tiến độ thất bại, sẽ thử lại:", e.message); rows.forEach((r) => this.queue.set(keyOf(r), r)); this.timer = setTimeout(() => this.flush(), 8000); }
  },

  stat(unitId, section) { return this.agg[unitId]?.[section] || { done: 0, ok: 0 }; },
  unitStat(unitId) {
    const a = this.agg[unitId] || {};
    return Object.values(a).reduce((t, x) => ({ done: t.done + x.done, ok: t.ok + x.ok }), { done: 0, ok: 0 });
  },
  totals() {
    let done = 0, ok = 0;
    this.items.forEach((v) => { done++; if (v.ok) ok++; });
    return { done, ok };
  },

  getScore(exKey) { return this.scores.get(exKey) || null; },
  async saveScore(unitId, exKey, pctVal) {
    if (!Auth.user) return;
    const old = this.scores.get(exKey);
    const row = {
      user_id: Auth.user.id, unit_id: unitId, ex_key: exKey,
      best: Math.max(old?.best ?? 0, pctVal), last: pctVal, attempts: (old?.attempts || 0) + 1,
      updated_at: new Date().toISOString(),
    };
    this.scores.set(exKey, row);
    try { await api.saveScore(row); } catch (e) { console.warn("Lưu điểm thất bại:", e.message); }
  },

  /** Số câu đã làm theo ngày (n ngày gần nhất) */
  byDay(n = 14) {
    const counts = {};
    this.items.forEach((v) => { const k = dayKey(v.at); counts[k] = (counts[k] || 0) + 1; });
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = dayKey(d);
      out.push({ key: k, date: d, n: counts[k] || 0 });
    }
    return out;
  },
  streakDays() {
    const days = new Set();
    this.items.forEach((v) => days.add(dayKey(v.at)));
    let s = 0;
    const d = new Date();
    if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1); // hôm nay chưa học vẫn giữ chuỗi
    while (days.has(dayKey(d))) { s++; d.setDate(d.getDate() - 1); }
    return s;
  },
};

addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") Progress.flush(); });
addEventListener("pagehide", () => Progress.flush());

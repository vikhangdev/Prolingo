import { $, $$, esc, SECTIONS, SECTION_KEYS } from "../utils.js";
import * as api from "../api.js";
import { Auth } from "../auth.js";
import { Progress } from "../progress.js";
import { go } from "../router.js";
import { buildSections } from "../quiz-data.js";
import { startQuiz } from "../quiz.js";
import { addWords } from "../dictionary.js";
import { app, loading, showError, setCrumbs, theme, unitHue, pctOf, unitTotal } from "./shared.js";

const statsMap = (rows) => Object.fromEntries(rows.map((r) => [r.unit_id, r]));
const hiddenTag = (pub) => (pub ? "" : ' <span class="badge red">Đang ẩn</span>');

/* ---------- Trang chủ: chọn ngành (bìa vở) ---------- */
export async function viewHome() {
  theme(); setCrumbs("");
  loading();
  try {
    const [fields, stats] = await Promise.all([api.listFields(), api.unitStats()]);
    const t = Progress.totals(), streak = Progress.streakDays();
    const byField = {};
    stats.forEach((s) => { (byField[s.field_id] ||= []).push(s); });
    const covers = fields.map((f) => {
      const us = byField[f.id] || [];
      const total = us.reduce((a, s) => a + unitTotal(s), 0);
      const done = us.reduce((a, s) => a + Progress.unitStat(s.unit_id).done, 0);
      return `<a class="cover" href="#/f/${esc(f.slug)}" style="--fh:${f.hue}">
        <span class="ic" aria-hidden="true">${esc(f.icon)}</span>
        <span class="tag">${us.length} unit · ${total} câu${hiddenTag(f.is_published)}</span>
        <span class="label"><span class="k">Môn: Tiếng Anh chuyên ngành</span><span class="en" style="display:block">${esc(f.name)}</span><span class="vi" style="display:block">${esc(f.name_vi)}</span></span>
        <span class="desc">${esc(f.description)}</span>
        <span class="foot"><span class="bar"><i style="width:${pctOf(done, total)}%"></i></span><span class="small">Đã làm ${done}/${total} câu</span></span></a>`;
    }).join("");
    app().innerHTML = `<div class="hello"><div><h1 class="h1" style="font-size:clamp(28px,4vw,40px)">Chào ${esc(Auth.name)} 👋</h1>
      <p class="sub">Chọn một ngành để bắt đầu ôn. Rê chuột lên từ tiếng Anh để xem nghĩa, bấm vào để nghe phát âm.</p></div>
      <div class="streakbar"><div class="stat"><b>${t.ok}</b><span>câu đúng</span></div><div class="stat"><b>${t.done ? Math.round((t.ok / t.done) * 100) : 0}%</b><span>tỉ lệ đúng</span></div><div class="stat"><b>${streak}🔥</b><span>ngày liên tiếp</span></div></div></div>
      ${fields.length ? `<div class="shelf">${covers}</div>` : `<div class="empty-state"><div class="big">📚</div><h3>Chưa có ngành nào</h3><p>${Auth.isAdmin ? 'Vào <a href="#/admin/data">Quản trị → Quản lý dữ liệu</a> để nạp bộ dữ liệu mẫu CNTT, hoặc tạo ngành mới.' : "Quản trị viên chưa thêm ngành học. Hãy quay lại sau nhé."}</p></div>`}`;
  } catch (e) { showError(e); }
}

/* ---------- Một ngành: danh sách unit ---------- */
export async function viewField({ slug }) {
  loading();
  try {
    const field = await api.getFieldBySlug(slug);
    if (!field) return (app().innerHTML = `<div class="empty-state"><div class="big">🔍</div><h3>Không tìm thấy ngành này</h3><a class="btn" href="#/">Về trang chủ</a></div>`);
    theme(field.hue); setCrumbs(field.name_vi || field.name);
    const [units, stats] = await Promise.all([api.listUnits(field.id), api.unitStats()]);
    const sm = statsMap(stats);
    const cards = units.map((u, i) => {
      const s = sm[u.id] || { n_words: 0, n_vocab: 0, n_lang: 0, n_read: 0 };
      const tot = unitTotal(s), p = Progress.unitStat(u.id);
      return `<a class="ucard" href="#/u/${u.id}" data-n="UNIT ${i + 1}" style="--uh:${unitHue(u, field, i)};text-decoration:none;color:inherit">
        <span class="ic">${esc(u.icon)}</span><span class="en">${esc(u.name)}${hiddenTag(u.is_published)}</span><span class="vi">${esc(u.name_vi)}</span>
        <div class="bar"><i style="width:${pctOf(p.done, tot)}%"></i></div><span class="small">${tot} câu · đã làm ${p.done} · đúng ${p.ok}</span></a>`;
    }).join("");
    app().innerHTML = `<a class="back" href="#/" style="text-decoration:none">← Tất cả ngành</a>
      <h1 class="h2">${esc(field.icon)} ${esc(field.name)}</h1><p class="sub">${esc(field.name_vi)}${field.description ? " — " + esc(field.description) : ""}</p>
      ${units.length ? `<div class="ugrid" style="margin-top:22px">${cards}</div>` : `<div class="empty-state"><div class="big">🧱</div><h3>Ngành này chưa có unit</h3></div>`}`;
  } catch (e) { showError(e); }
}

/* ---------- Một unit: 4 phần ---------- */
export async function viewUnit({ id }) {
  loading();
  try {
    const [unit, stats] = await Promise.all([api.getUnit(id), api.unitStats()]);
    if (!unit) return (app().innerHTML = `<div class="empty-state"><div class="big">🔍</div><h3>Không tìm thấy unit</h3><a class="btn" href="#/">Về trang chủ</a></div>`);
    const siblings = await api.listUnits(unit.field_id);
    const idx = Math.max(0, siblings.findIndex((u) => u.id === id));
    theme(unitHue(unit, unit.field, idx));
    setCrumbs(`${unit.field.name_vi || unit.field.name} › Unit ${idx + 1}: ${unit.name}`);
    const s = stats.find((x) => x.unit_id === id) || { n_words: 0, n_vocab: 0, n_lang: 0, n_read: 0 };
    const counts = { bank: s.n_words, vocab: s.n_vocab, lang: s.n_lang, read: s.n_read };
    const cards = SECTION_KEYS.map((k) => {
      const tot = counts[k], p = Progress.stat(id, k), unitLabel = k === "bank" ? "từ" : "câu";
      return `<button class="scard" data-s="${k}" ${tot ? "" : "disabled"}><span class="ic">${SECTIONS[k].ic}</span><h3>${SECTIONS[k].n}</h3><div class="small">${SECTIONS[k].vi}</div>
        <span class="pill">${tot ? `${tot} ${unitLabel}` : "Chưa có nội dung"}</span><div class="bar"><i style="width:${pctOf(p.done, tot)}%"></i></div><div class="small">Đúng ${p.ok}/${tot}</div></button>`;
    }).join("");
    app().innerHTML = `<a class="back" href="#/f/${esc(unit.field.slug)}" style="text-decoration:none">← ${esc(unit.field.name_vi || unit.field.name)}</a>
      <h1 class="h2">Unit ${idx + 1} · ${esc(unit.icon)} ${esc(unit.name)}</h1><p class="sub">${esc(unit.name_vi)} — chọn phần muốn ôn tập.</p><div class="secgrid">${cards}</div>`;
    $$("[data-s]").forEach((b) => (b.onclick = () => go(`/u/${id}/${b.dataset.s}`)));
  } catch (e) { showError(e); }
}

/* ---------- Làm bài ---------- */
export async function viewStudy({ id, sec }, alive) {
  if (!SECTIONS[sec]) return go(`/u/${id}`);
  loading("Đang tải bài tập…");
  try {
    const unit = await api.getUnit(id);
    if (!unit) return go("/");
    const siblings = await api.listUnits(unit.field_id);
    const idx = Math.max(0, siblings.findIndex((u) => u.id === id));
    const content = await api.getUnitContent(id);
    if (alive && !alive()) return;
    theme(unitHue(unit, unit.field, idx));
    setCrumbs(`${unit.field.name_vi || unit.field.name} › Unit ${idx + 1}: ${unit.name} › ${SECTIONS[sec].vi}`);
    addWords(content.words);
    const secs = buildSections(id, content);
    if (!secs[sec].length) {
      app().innerHTML = `<a class="back" href="#/u/${id}" style="text-decoration:none">← Quay lại</a><div class="empty-state"><div class="big">🧱</div><h3>Phần này chưa có bài tập</h3></div>`;
      return;
    }
    startQuiz({ unit, secs, section: sec, onExit: () => go(`/u/${id}`) });
  } catch (e) { showError(e); }
}

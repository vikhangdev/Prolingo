/* ============================================================
   QUIZ ENGINE — làm bài, chấm điểm, giải thích, thẻ ghi nhớ, bài nối
   Ported từ script.js cũ; khác biệt: dữ liệu đến từ Supabase và
   mỗi câu trả lời được ghi vào bảng `progress`.
   ============================================================ */
import { $, $$, esc, md, words, toast, shuffledIdx } from "./utils.js";
import { speak, trLong } from "./dictionary.js";
import { Progress } from "./progress.js";
import { react, confetti, say, renderHud } from "./mascot.js";

const LET = "ABCDEFGHIJKLMNOP";
const S = {
  unit: null, sec: null, secs: null, exit: null,
  view: "study", ex: 0, order: [], pos: 0,
  res: {}, draft: null, bd: {}, flip: false, scored: new Set(), runs: {},
};

/* ---------- Truy cập nhanh ---------- */
const exs = () => S.secs[S.sec];
const curEx = () => exs()[S.ex];
const key = (i, ei = S.ex) => `${S.sec}|${ei}|${i}`;
const exKeyOf = (ex) => (String(ex.id).startsWith("bank:") ? `${S.unit.id}:${ex.id}` : ex.id);

function exStats(ei = S.ex) {
  const ex = exs()[ei];
  let ok = 0, done = 0;
  ex.items.forEach((q, i) => {
    const r = S.res[key(i, ei)];
    if (r) { done++; if (r.ok) ok++; }
  });
  return { ok, done, total: ex.items.length };
}

/* ---------- Khởi chạy ---------- */
export function startQuiz({ unit, secs, section, onExit }) {
  Object.assign(S, { unit, secs, sec: section, exit: onExit, res: {}, bd: {}, draft: null, flip: false, scored: new Set(), runs: {} });
  startEx(0);
}

function startEx(i, subset) {
  S.ex = i;
  S.view = "study";
  S.order = subset || [...Array(curEx().items.length).keys()];
  S.pos = 0;
  S.draft = null;
  S.flip = false;
  render();
  window.scrollTo(0, 0);
}
function go(v) { S.view = v; if (v === "study") S.flip = false; render(); window.scrollTo(0, 0); }

function render() {
  const ex = curEx();
  if (S.view === "summary") return vSummary();
  if (ex.isMatch) return vMatch();
  if (ex.isList) return vList();
  if (ex.isCards) return vCards();
  return vStudy();
}
function rerenderKeepScroll() { const y = window.scrollY; render(); window.scrollTo(0, y); }

/* ---------- Ghi nhận kết quả ---------- */
function persist(q, ok) {
  Progress.mark({
    unitId: S.unit.id, section: S.sec,
    qid: q._t === "q" ? q._id : null, wid: q._t === "w" ? q._id : null, ok,
  });
}
function maybeSaveScore(force) {
  const ex = curEx(), s = exStats();
  const k = exKeyOf(ex);
  if (S.scored.has(k) || ex.noscore || !s.total) return;
  if (!force && s.done < s.total) return;
  S.scored.add(k);
  Progress.saveScore(S.unit.id, k, Math.round((s.ok / s.total) * 100));
}
const backToSecs = () => S.exit();

/* ---------- Nhật ký từng lần làm (để admin xem lại) ---------- */
function givenText(q, given) {
  if (q.k === "card") return given === "know" ? "Đã thuộc" : "Chưa thuộc";
  if (q.k === "mc") return q.opts[given] ?? "";
  if (q.k === "ms") return given.map((x) => q.opts[x]).join(" + ");
  return Array.isArray(given) ? given.join(" | ") : String(given);
}
/** Gọi SAU khi S.res đã được cập nhật. Mỗi lần làm một bài = một "lượt" (run). */
function track(q, given, ok) {
  const ex = curEx(), k = exKeyOf(ex), now = new Date().toISOString();
  // total của lượt = số câu chưa có kết quả lúc bắt đầu lượt (làm lại câu sai → chỉ tính các câu sai)
  let run = S.runs[k];
  if (!run) {
    run = S.runs[k] = { id: crypto.randomUUID(), started_at: now, answered: 0, correct: 0, total: ex.items.filter((_, i) => !S.res[key(i)]).length + 1, duration_seconds: 0, last_activity_ms: Date.now() };
  } else {
    run.duration_seconds += Math.min(300, Math.max(0, Math.floor((Date.now() - run.last_activity_ms) / 1000)));
    run.last_activity_ms = Date.now();
  }
  run.answered++;
  if (ok) run.correct++;
  Progress.logRun({
    id: run.id, unit_id: S.unit.id, section: S.sec, ex_key: k, ex_title: ex.t,
    total: run.total, answered: run.answered, correct: run.correct, started_at: run.started_at, updated_at: now, duration_seconds: run.duration_seconds,
  });
  Progress.logAnswer({
    run_id: run.id, unit_id: S.unit.id, question_id: q._t === "q" ? q._id : null, word_id: q._t === "w" ? q._id : null,
    q_text: String(q.k === "card" ? q.en : q.q).slice(0, 500), given_text: givenText(q, given).slice(0, 500),
    correct_text: ansText(q).slice(0, 500), ok,
  });
}
const newRun = (ex) => { delete S.runs[exKeyOf(ex)]; }; // làm lại → lượt mới

/* ---------- Chấm ---------- */
const norm = (s) =>
  String(s).toLowerCase().replace(/[’'`]/g, "").replace(/[–—\-]/g, " ").replace(/[.,;!?]+$/, "").replace(/\s+/g, " ").trim();
const nospace = (s) => norm(s).replace(/\s/g, "");
const accepts = (a) => (Array.isArray(a) ? a : [a]);
function permOf(q) {
  if (!q._p) q._p = q.fixed ? [...q.opts.keys()] : shuffledIdx(q.opts.length);
  return q._p;
}
function ansText(q) {
  if (q.k === "card") return q.vi;
  if (q.k === "mc") return q.ans.map((i) => q.opts[i]).join("  /  ");
  if (q.k === "ms") return q.ans.map((i) => q.opts[i]).join(" + ");
  return q.ans.map((a) => accepts(a)[0]).join("  |  ");
}

/* ---------- Khung chung ---------- */
function tabsHtml() {
  return `<div class="tabs" role="tablist">${exs()
    .map((x, ei) => {
      const s = exStats(ei);
      const label = x.isList ? "📋 Danh sách" : x.isCards ? "🃏 Thẻ nhớ" : x.id && String(x.id).startsWith("bank:") ? x.t.replace(/^Trắc nghiệm: /, "") : `Bài ${ei + 1}`;
      return `<button class="tab ${ei === S.ex ? "on" : ""}" role="tab" data-e="${ei}" title="${esc(x.t)}">${esc(label)}${s.done ? `<span class="sc">${s.ok}/${s.total}</span>` : ""}</button>`;
    })
    .join("")}</div>`;
}
function navHtml(mid, nextLabel) {
  return `<div class="navbar"><div class="navin"><button class="btn ghost" id="bBack">← Back</button><div class="mid">${mid}</div><button class="btn" id="bNext">${nextLabel}</button></div></div>`;
}
function wireTabs() {
  $("#bk").onclick = backToSecs;
  $$("[data-e]").forEach((b) => (b.onclick = () => startEx(+b.dataset.e)));
}
function backPrev() {
  if (S.ex > 0) {
    S.ex--;
    S.order = [...Array(curEx().items.length).keys()];
    S.pos = S.order.length - 1;
    S.draft = null; S.flip = false;
    go("study");
  } else toast("Đây là bài đầu tiên");
}
const paragraphs = (ex) =>
  ex.ctx
    ? `<div class="ctx">${ex.ctx.split("\n").filter((p) => p.trim()).map((p, pi) => `<p>${words(p)}<button class="tr" data-tr="${pi}" title="Dịch đoạn này sang tiếng Việt">🌐 dịch</button></p><div class="trout" data-o="${pi}" hidden></div>`).join("")}</div>`
    : "";
function wireTranslate(ex) {
  const paras = (ex.ctx || "").split("\n").filter((p) => p.trim());
  $$("[data-tr]").forEach((b) => (b.onclick = async () => {
    const pi = +b.dataset.tr, o = $(`[data-o="${pi}"]`);
    o.hidden = false; o.textContent = "Đang dịch…";
    const t = await trLong(paras[pi]);
    o.textContent = t || "Không dịch được (cần Internet).";
  }));
}

/* ============================================================
   TRẮC NGHIỆM / ĐIỀN TỪ / CHỌN NHIỀU
   ============================================================ */
function vStudy() {
  const ex = curEx(), i = S.order[S.pos], q = ex.items[i], r = S.res[key(i)];
  let h = `<button class="back" id="bk">← Chọn phần khác</button>${tabsHtml()}<div class="cols"><section class="pane" id="L"><h4>${esc(ex.t)}</h4>`;
  if (ex.ins) h += `<div class="ins">${words(ex.ins)}${ex.insvi ? `<div class="small" style="margin-top:3px">${esc(ex.insvi)}</div>` : ""}</div>`;
  h += paragraphs(ex);
  const typeLabel = q.k === "mc" && q.tf ? "True / False" : q.k === "mc" ? "Chọn đáp án" : q.k === "ms" ? "Chọn tất cả đáp án đúng" : "Điền vào chỗ trống";
  h += `<div class="qno"><span class="tag">Câu ${i + 1}/${ex.items.length}</span><span class="small">${typeLabel}</span></div>`;
  h += qHtml(q, r) + `<div class="tools"><button id="trq">🌐 Dịch câu</button><button id="spq">🔊 Đọc câu</button></div><div class="trout" id="trqo" hidden style="margin-top:10px"></div></section><aside class="pane" id="R" aria-live="polite"></aside></div>`;
  h += `<div class="navbar"><div class="navin"><button class="btn ghost" id="bBack">← Back</button><div class="mid">Câu ${S.pos + 1}/${S.order.length} · Bài ${S.ex + 1}/${exs().length}<div class="dots">${S.order
    .map((ii, p) => { const rr = S.res[key(ii)]; return `<i class="${rr ? (rr.ok ? "ok" : "bad") : ""} ${p === S.pos ? "cur" : ""}"></i>`; })
    .join("")}</div></div><button class="btn" id="bNext">${S.pos === S.order.length - 1 ? "Xem kết quả →" : "Next →"}</button></div></div>`;
  $("#app").innerHTML = h;
  renderExplain(q, r);
  wireStudy(ex, i, q);
}

function qHtml(q, r) {
  if (q.k === "mc") {
    const p = permOf(q);
    let h = `<div class="qtext">${words(q.q)}</div><div class="opts">`;
    p.forEach((oi, pos) => {
      let c = "opt";
      if (r) { if (q.ans.includes(oi)) c += " ok"; else if (r.given === oi) c += " bad"; }
      h += `<button class="${c}" data-o="${oi}" ${r ? "disabled" : ""}><span class="l">${LET[pos]}</span><span>${words(q.opts[oi])}</span></button>`;
    });
    return h + "</div>";
  }
  if (q.k === "ms") {
    const d = S.draft && S.draft.k === q ? S.draft.sel : [];
    let h = `<div class="qtext">${words(q.q)}</div><div class="opts">`;
    q.opts.forEach((o, oi) => {
      let c = "opt";
      if (r) { if (q.ans.includes(oi)) c += " ok"; else if (r.given.includes(oi)) c += " bad"; }
      else if (d.includes(oi)) c += " sel";
      const mark = r ? (q.ans.includes(oi) ? "✓" : r.given.includes(oi) ? "✗" : "") : d.includes(oi) ? "✓" : "";
      h += `<button class="${c}" data-m="${oi}" ${r ? "disabled" : ""}><span class="l">${mark}</span><span>${words(o)}</span></button>`;
    });
    return h + `</div>${r ? "" : '<div class="row"><button class="btn" id="chk">Kiểm tra</button></div>'}`;
  }
  // điền chỗ trống
  const parts = q.q.split("___");
  let h = '<div class="qtext">';
  parts.forEach((pt, bi) => {
    h += words(pt);
    if (bi < parts.length - 1) {
      const a = accepts(q.ans[bi] || [""])[0];
      const v = r ? r.given[bi] : "";
      const good = r ? r.flags[bi] : null;
      h += `<input class="fin ${r ? (good ? "ok" : "bad") : ""}" data-b="${bi}" size="${Math.max(6, Math.min(26, a.length + 2))}" value="${esc(v)}" ${r ? "disabled" : ""} autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Chỗ trống ${bi + 1}">`;
    }
  });
  return h + `</div>${r ? "" : '<div class="row"><button class="btn" id="chk">Kiểm tra</button><span class="small">Nhấn Enter để kiểm tra</span></div>'}`;
}

function record(q, i, given, ok, flags) {
  S.res[key(i)] = { given, ok, flags };
  persist(q, ok);
  track(q, given, ok);
  react(ok, 1);
  maybeSaveScore();
  rerenderKeepScroll();
}

function wireStudy(ex, i, q) {
  $("#bk").onclick = backToSecs;
  $$("[data-e]").forEach((b) => (b.onclick = () => startEx(+b.dataset.e)));
  $("#bNext").onclick = () => {
    if (S.pos < S.order.length - 1) { S.pos++; S.draft = null; render(); window.scrollTo(0, 0); }
    else go("summary");
  };
  $("#bBack").onclick = () => {
    if (S.pos > 0) { S.pos--; S.draft = null; render(); window.scrollTo(0, 0); }
    else if (S.ex > 0) backPrev();
    else toast("Đây là câu đầu tiên");
  };
  wireTranslate(ex);
  $("#spq").onclick = () => speak(q.q.replace(/___/g, "blank"));
  $("#trq").onclick = async () => {
    const o = $("#trqo");
    o.hidden = false; o.textContent = "Đang dịch…";
    const t = await trLong(q.q.replace(/___/g, "…"));
    o.textContent = t || "Không dịch được (cần Internet).";
  };
  if (S.res[key(i)]) return;

  if (q.k === "mc")
    $$(".opt").forEach((b) => (b.onclick = () => { const oi = +b.dataset.o; record(q, i, oi, q.ans.includes(oi)); }));

  if (q.k === "ms") {
    $$("[data-m]").forEach((b) => (b.onclick = () => {
      const oi = +b.dataset.m;
      S.draft = S.draft && S.draft.k === q ? S.draft : { k: q, sel: [] };
      const s = S.draft.sel, x = s.indexOf(oi);
      x >= 0 ? s.splice(x, 1) : s.push(oi);
      rerenderKeepScroll();
    }));
    $("#chk").onclick = () => {
      const sel = (S.draft && S.draft.k === q ? S.draft.sel : []).slice().sort((a, b) => a - b);
      if (!sel.length) return toast("Hãy chọn ít nhất một đáp án");
      const a = q.ans.slice().sort((x, y) => x - y);
      record(q, i, sel, JSON.stringify(sel) === JSON.stringify(a));
    };
  }

  if (q.k === "fl") {
    const ins = $$(".fin");
    ins[0] && ins[0].focus();
    const chk = () => {
      const vals = ins.map((x) => x.value.trim());
      if (vals.some((v) => !v)) return toast("Hãy điền hết các ô trống");
      const flags = vals.map((v, bi) => accepts(q.ans[bi]).some((a) => norm(a) === norm(v) || nospace(a) === nospace(v)));
      record(q, i, vals, flags.every(Boolean), flags);
    };
    $("#chk").onclick = chk;
    ins.forEach((x) => x.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); chk(); } }));
  }
}

/* ---------- Giải thích ---------- */
function renderExplain(q, r) {
  const st = exStats();
  let h = `<div class="live"><span>Điểm bài tập này</span><span><b>${st.ok}</b>/${st.total} đúng · ${st.done} đã làm</span></div>`;
  if (!r) {
    $("#R").innerHTML = h + `<div class="empty"><div class="big">💡</div>Trả lời câu hỏi bên trái để xem<br><b>đúng/sai, lý do, mẹo nhớ</b> tại đây.</div>`;
    return;
  }
  h += `<div class="verdict ${r.ok ? "ok" : "bad"}">${r.ok ? "✅ TRUE — Chính xác!" : "❌ FALSE — Chưa đúng"}</div>`;
  if (!r.ok) {
    let g = "";
    if (q.k === "mc") g = q.opts[r.given];
    else if (q.k === "ms") g = r.given.map((x) => q.opts[x]).join(" + ");
    else g = r.given.map((v, b) => `${v}${r.flags[b] ? " ✓" : " ✗"}`).join(" | ");
    h += `<div class="small" style="margin-bottom:6px">Bạn trả lời: <b>${esc(g)}</b></div>`;
  }
  h += `<div class="blk right"><b class="t">${r.ok ? "Đáp án" : "Câu đúng là"}</b>${esc(ansText(q))}</div>`;
  if (q.why) h += `<div class="blk why"><b class="t">Vì sao đúng</b>${md(q.why)}</div>`;
  if (q.no) {
    const body = Array.isArray(q.no)
      ? "<ul>" + q.opts.map((o, oi) => (q.ans.includes(oi) || !q.no[oi] ? "" : `<li><b>${esc(o)}</b>: ${md(q.no[oi])}</li>`)).join("") + "</ul>"
      : md(q.no);
    h += `<div class="blk wrong"><b class="t">Các đáp án còn lại sai vì</b>${body}</div>`;
  }
  if (q.tip) h += `<div class="blk tip"><b class="t">💡 Mẹo ghi nhớ</b>${md(q.tip)}</div>`;
  $("#R").innerHTML = h;
}

/* ============================================================
   DANH SÁCH TỪ + THẺ GHI NHỚ
   ============================================================ */
function vList() {
  const ex = curEx(), W = ex.words;
  const h = `<button class="back" id="bk">← Chọn phần khác</button>${tabsHtml()}<section class="pane"><h4>${esc(ex.t)} · ${W.length} từ</h4><div class="ins">${esc(ex.ins)}</div>
  <div class="row" style="margin:0 0 12px"><input id="wq" class="wsearch" placeholder="🔎 Lọc từ…" autocomplete="off" aria-label="Lọc từ"><label class="chk"><input type="checkbox" id="hide"> Che nghĩa tiếng Việt</label><span class="small" id="wc"></span></div>
  <div class="wgrid" id="wgrid">${W.map((w) => `<div class="wrow" data-en="${esc(w.en.toLowerCase())}" data-vi="${esc(w.vi.toLowerCase())}" data-sp="${esc(w.en.replace(/\(.*?\)/g, "").replace(/^-|-$/g, ""))}"><span class="wsp">🔊</span><span class="wen">${esc(w.en)}</span><span class="wvi">${esc(w.vi)}</span></div>`).join("")}</div></section>` +
    navHtml(`${W.length} từ`, S.ex === exs().length - 1 ? "Xem kết quả →" : "Học thẻ nhớ →");
  $("#app").innerHTML = h;
  wireTabs();
  const g = $("#wgrid");
  const filt = () => {
    const q = $("#wq").value.trim().toLowerCase();
    let c = 0;
    $$(".wrow", g).forEach((r) => {
      const ok = !q || r.dataset.en.includes(q) || r.dataset.vi.includes(q);
      r.style.display = ok ? "" : "none";
      if (ok) c++;
    });
    $("#wc").textContent = c + "/" + W.length;
  };
  $("#wq").oninput = filt;
  filt();
  $("#hide").onchange = (e) => g.classList.toggle("hidevi", e.target.checked);
  g.onclick = (e) => {
    const r = e.target.closest(".wrow");
    if (!r) return;
    speak(r.dataset.sp);
    r.classList.toggle("show");
  };
  $("#bNext").onclick = () => (S.ex < exs().length - 1 ? startEx(S.ex + 1) : go("summary"));
  $("#bBack").onclick = () => (S.ex > 0 ? startEx(S.ex - 1) : backToSecs());
}

function vCards() {
  const ex = curEx(), i = S.order[S.pos], q = ex.items[i], r = S.res[key(i)];
  const st = exStats(), flip = S.flip || !!r;
  const h = `<button class="back" id="bk">← Chọn phần khác</button>${tabsHtml()}<div class="cols"><section class="pane" id="L"><h4>${esc(ex.t)}</h4><div class="ins">${esc(ex.ins)}</div>
  <div class="qno"><span class="tag">Thẻ ${S.pos + 1}/${S.order.length}</span><span class="small">Đã thuộc ${st.ok} · chưa thuộc ${st.done - st.ok}</span></div>
  <div class="fcwrap"><div class="fc ${flip ? "flip" : ""}" id="fc" tabindex="0" role="button" aria-label="Lật thẻ"><div class="face front"><div class="fw">${esc(q.en)}</div><div class="fh">Bấm vào thẻ để lật 👆</div></div><div class="face back"><div class="fw vi">${esc(q.vi)}</div><div class="fh">${esc(q.en)}</div></div></div></div>
  <div class="row" style="justify-content:center"><button class="btn ghost" id="fsp">🔊 Nghe</button><button class="btn ghost" id="kno" ${r ? "disabled" : ""}>😵 Chưa thuộc</button><button class="btn" id="kyes" ${r ? "disabled" : ""}>😎 Đã thuộc</button></div></section><aside class="pane" id="R"></aside></div>` +
    navHtml(`Thẻ ${S.pos + 1}/${S.order.length}`, S.pos === S.order.length - 1 ? "Xem kết quả →" : "Next →");
  $("#app").innerHTML = h;
  wireTabs();
  let e2 = `<div class="live"><span>Thẻ ghi nhớ</span><span><b>${st.ok}</b>/${st.total} đã thuộc</span></div>`;
  if (!flip) e2 += `<div class="empty"><div class="big">🃏</div>Đoán nghĩa của từ <b>${esc(q.en)}</b>,<br>rồi lật thẻ để kiểm tra.</div>`;
  else {
    e2 += `<div class="verdict ${r ? (r.ok ? "ok" : "bad") : "ok"}" ${r ? "" : 'style="background:var(--accSoft);color:var(--acc)"'}>${r ? (r.ok ? "😎 Đã thuộc!" : "😵 Cần ôn lại") : "📖 Nghĩa của từ"}</div>
    <div class="blk right"><b class="t">${esc(q.en)}</b>${esc(q.vi)}</div>${q.tip ? `<div class="blk tip"><b class="t">💡 Mẹo ghi nhớ</b>${esc(q.tip)}</div>` : ""}`;
  }
  $("#R").innerHTML = e2;
  const fc = $("#fc");
  const toggle = () => {
    if (r) return;
    S.flip = !S.flip;
    fc.classList.toggle("flip", S.flip);
    if (S.flip) speak(q.en);
    setTimeout(vCards, 380);
  };
  fc.onclick = toggle;
  fc.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } };
  $("#fsp").onclick = () => speak(q.en.replace(/\(.*?\)/g, "").replace(/^-|-$/g, ""));
  const mark = (ok) => {
    if (S.res[key(i)]) return;
    S.res[key(i)] = { given: ok ? "know" : "no", ok, flags: null };
    persist(q, ok);
    track(q, ok ? "know" : "no", ok);
    react(ok, 1);
    maybeSaveScore();
    S.flip = true;
    vCards();
    setTimeout(() => {
      if (S.view !== "study" || curEx() !== ex) return;
      if (S.pos < S.order.length - 1) { S.pos++; S.flip = false; vCards(); window.scrollTo(0, 0); }
      else go("summary");
    }, 650);
  };
  if (!r) { $("#kyes").onclick = () => mark(true); $("#kno").onclick = () => mark(false); }
  $("#bNext").onclick = () => {
    if (S.pos < S.order.length - 1) { S.pos++; S.flip = false; vCards(); window.scrollTo(0, 0); }
    else go("summary");
  };
  $("#bBack").onclick = () => {
    if (S.pos > 0) { S.pos--; S.flip = false; vCards(); window.scrollTo(0, 0); }
    else backPrev();
  };
}

/* ============================================================
   BÀI NỐI (2 cột)
   ============================================================ */
const pc = (i) => `hsl(${(i * 47 + 170) % 360} 62% 42%)`;
let resizeBound = false, drawFn = null;

function vMatch() {
  const ex = curEx(), n = ex.items.length, ek = `${S.sec}|${S.ex}`;
  const bd = S.bd[ek] || (S.bd[ek] = { map: {}, sel: null });
  ex.items.forEach((q, i) => { const r = S.res[key(i)]; if (r) bd.map[i] = r.given; });
  const B = ex.items[0].opts;
  const P = ex._p || (ex._p = ex.items[0].fixed ? [...B.keys()] : shuffledIdx(B.length));
  const R = (i) => S.res[key(i)];
  const locked = (i) => R(i) && R(i).ok, done = (i) => !!R(i);
  const owner = {};
  Object.keys(bd.map).forEach((i) => (owner[bd.map[i]] = +i));
  const posOf = {};
  P.forEach((oi, p) => (posOf[oi] = p));
  const st = exStats(), checked = st.done === n, paired = Object.keys(bd.map).length;

  let h = `<button class="back" id="bk">← Chọn phần khác</button>${tabsHtml()}<div class="cols"><section class="pane" id="L"><h4>${esc(ex.t)}</h4>`;
  if (ex.ins) h += `<div class="ins">${words(ex.ins)}</div>`;
  h += paragraphs(ex);
  h += `<div class="small" style="margin-bottom:8px">👉 Bấm 1 ô ở <b>cột A</b>, rồi bấm 1 ô ở <b>cột B</b> để nối. Bấm lại ô đã nối để nối lại. Đã nối <b>${paired}/${n}</b>.</div>`;
  h += `<div class="board" id="board"><svg id="ln" aria-hidden="true"></svg><div class="bcol"><div class="bhead">Cột A</div>`;
  ex.items.forEach((q, i) => {
    const r = R(i);
    let c = "bi", style = "", pt = "";
    if (r) c += r.ok ? " ok" : " bad";
    else if (bd.sel === i) c += " sel";
    else if (bd.map[i] != null) { c += " pair"; style = `style="--c:${pc(i)}"`; pt = `<span class="pt">${LET[posOf[bd.map[i]]]}</span>`; }
    if (bd.map[i] != null && r) pt = `<span class="pt" style="background:${r.ok ? "var(--ok)" : "var(--bad)"}">${LET[posOf[bd.map[i]]]}</span>`;
    h += `<button class="${c}" ${style} data-l="${i}" ${locked(i) || done(i) ? "disabled" : ""}><span class="l">${i + 1}</span><span>${words(q.q)}</span>${pt}</button>`;
  });
  h += `</div><div class="bcol"><div class="bhead">Cột B</div>`;
  P.forEach((oi, p) => {
    const ow = owner[oi];
    let c = "bi", style = "", pt = "";
    if (ow != null) {
      const r = R(ow);
      if (r) c += r.ok ? " ok" : " bad";
      else { c += " pair"; style = `style="--c:${pc(ow)}"`; }
      pt = `<span class="pt" style="${r ? `background:${r.ok ? "var(--ok)" : "var(--bad)"}` : ""}">${ow + 1}</span>`;
    }
    h += `<button class="${c}" ${style} data-r="${oi}" ${ow != null && done(ow) ? "disabled" : ""}><span class="l">${LET[p]}</span><span>${words(B[oi])}</span>${pt}</button>`;
  });
  h += `</div></div><div class="row"><button class="btn" id="chk" ${checked ? "disabled" : ""}>Kiểm tra</button><button class="btn ghost" id="rst" ${checked ? "disabled" : ""}>Xóa các nối chưa chấm</button>${st.done && st.ok < n ? '<button class="btn ghost" id="rdo">🔁 Nối lại các câu sai</button>' : ""}</div></section><aside class="pane" id="R" aria-live="polite"></aside></div>`;
  h += `<div class="navbar"><div class="navin"><button class="btn ghost" id="bBack">← Back</button><div class="mid">Bài ${S.ex + 1}/${exs().length} · đã nối ${paired}/${n}</div><button class="btn" id="bNext">${S.ex === exs().length - 1 ? "Xem kết quả →" : "Next →"}</button></div></div>`;
  $("#app").innerHTML = h;
  explainMatch(ex, P, posOf);

  drawFn = () => {
    const bo = $("#board");
    if (!bo) return;
    const br = bo.getBoundingClientRect();
    let s = "";
    Object.keys(bd.map).forEach((i) => {
      const a = bo.querySelector(`[data-l="${i}"]`), b = bo.querySelector(`[data-r="${bd.map[i]}"]`);
      if (!a || !b) return;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const x1 = ra.right - br.left, y1 = ra.top + ra.height / 2 - br.top, x2 = rb.left - br.left, y2 = rb.top + rb.height / 2 - br.top, mx = (x1 + x2) / 2;
      const r = R(+i), col = r ? (r.ok ? "var(--ok)" : "var(--bad)") : pc(+i);
      s += `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round"/><circle cx="${x1}" cy="${y1}" r="4" fill="${col}"/><circle cx="${x2}" cy="${y2}" r="4" fill="${col}"/>`;
    });
    $("#ln").innerHTML = s;
  };
  requestAnimationFrame(drawFn);
  setTimeout(drawFn, 60);
  if (!resizeBound) { resizeBound = true; addEventListener("resize", () => drawFn && drawFn()); }

  const again = () => { const y = window.scrollY; vMatch(); window.scrollTo(0, y); };
  $$("[data-l]").forEach((b) => (b.onclick = () => {
    const i = +b.dataset.l;
    if (done(i)) return;
    if (bd.map[i] != null) delete bd.map[i];
    bd.sel = i;
    again();
  }));
  $$("[data-r]").forEach((b) => (b.onclick = () => {
    const oi = +b.dataset.r, ow = owner[oi];
    if (ow != null && done(ow)) return;
    if (bd.sel == null) {
      if (ow != null) { delete bd.map[ow]; bd.sel = ow; again(); }
      else toast("Hãy chọn một ô ở cột A trước");
      return;
    }
    if (ow != null) delete bd.map[ow];
    bd.map[bd.sel] = oi;
    const next = ex.items.findIndex((q, i) => !done(i) && bd.map[i] == null);
    bd.sel = next >= 0 ? next : null;
    again();
  }));
  wireTabs();
  wireTranslate(ex);
  $("#rst").onclick = () => {
    Object.keys(bd.map).forEach((i) => { if (!done(+i)) delete bd.map[i]; });
    bd.sel = null;
    again();
  };
  if ($("#rdo")) $("#rdo").onclick = () => {
    ex.items.forEach((q, i) => { if (!locked(i)) delete S.res[key(i)]; });
    delete S.bd[ek];
    S.scored.delete(exKeyOf(ex));
    newRun(ex);
    ex._p = null;
    vMatch();
  };
  $("#chk").onclick = () => {
    const todo = ex.items.map((q, i) => i).filter((i) => !done(i));
    if (todo.some((i) => bd.map[i] == null)) return toast("Hãy nối hết các ô ở cột A trước khi kiểm tra");
    todo.forEach((i) => {
      const q = ex.items[i], g = bd.map[i], ok = q.ans.includes(g);
      S.res[key(i)] = { given: g, ok, flags: null };
      persist(q, ok);
      track(q, g, ok);
    });
    react(todo.every((i) => S.res[key(i)].ok), todo.length);
    maybeSaveScore(true);
    window.scrollTo(0, 0);
    vMatch();
  };
  $("#bNext").onclick = () => go("summary");
  $("#bBack").onclick = () => (S.ex > 0 ? backPrev() : toast("Đây là bài đầu tiên"));
}

function explainMatch(ex, P, posOf) {
  const n = ex.items.length, st = exStats();
  let h = `<div class="live"><span>Điểm bài tập này</span><span><b>${st.ok}</b>/${n} đúng · ${st.done} đã chấm</span></div>`;
  if (!st.done) {
    $("#R").innerHTML = h + `<div class="empty"><div class="big">🔗</div>Nối xong các cặp rồi bấm <b>Kiểm tra</b>.<br>Mỗi cặp sẽ hiện <b>đúng/sai, lý do và mẹo nhớ</b> tại đây.</div>`;
    return;
  }
  h += `<div class="verdict ${st.ok === n ? "ok" : "bad"}">${st.ok === n ? "✅ TRUE — Nối đúng hết!" : `❌ FALSE — Đúng ${st.ok}/${n} cặp`}</div>`;
  const order = [...ex.items.keys()].sort((a, b) => (S.res[key(a)]?.ok ? 1 : 0) - (S.res[key(b)]?.ok ? 1 : 0));
  order.forEach((i) => {
    const q = ex.items[i], r = S.res[key(i)];
    if (!r) return;
    h += `<div class="mitem ${r.ok ? "ok" : "bad"}"><div class="hd">${r.ok ? "✅" : "❌"} ${i + 1}. ${esc(q.q)}</div>`;
    if (!r.ok) h += `<div class="small">Bạn nối: <b>${LET[posOf[r.given]]}. ${esc(q.opts[r.given])}</b></div>`;
    h += `<div class="blk right"><b class="t">${r.ok ? "Đáp án" : "Câu đúng là"}</b>${esc(q.ans.map((a) => LET[posOf[a]] + ". " + q.opts[a]).join("  /  "))}</div>`;
    if (q.why) h += `<div class="blk why"><b class="t">Vì sao đúng</b>${md(q.why)}</div>`;
    if (!r.ok && Array.isArray(q.no) && q.no[r.given]) h += `<div class="blk wrong"><b class="t">Vì sao đáp án bạn nối sai</b>${md(q.no[r.given])}</div>`;
    if (q.tip) h += `<div class="blk tip"><b class="t">💡 Mẹo ghi nhớ</b>${md(q.tip)}</div>`;
    h += `</div>`;
  });
  $("#R").innerHTML = h;
}

/* ============================================================
   KẾT QUẢ
   ============================================================ */
function vSummary() {
  const ex = curEx(), st = exStats(), pctV = st.total ? Math.round((st.ok / st.total) * 100) : 0;
  const wrong = [];
  ex.items.forEach((q, i) => { const r = S.res[key(i)]; if (!r || !r.ok) wrong.push(i); });
  const last = S.ex === exs().length - 1;
  const msg = pctV >= 90 ? "Xuất sắc! 🎉" : pctV >= 70 ? "Khá tốt, cố thêm chút nữa! 👍" : pctV >= 50 ? "Tạm ổn – hãy làm lại các câu sai 💪" : "Cần ôn thêm – đọc kỹ phần giải thích nhé 📖";
  const best = Progress.getScore(exKeyOf(ex));
  if (st.total && st.done === st.total) maybeSaveScore();
  const h = `<button class="back" id="bk">← Chọn phần khác</button>${tabsHtml()}
  <section class="pane sum" style="max-width:720px;margin:0 auto"><h4>Kết quả · ${esc(ex.t)}</h4><div class="ring" style="--p:${pctV}%"><div>${pctV}%</div></div>
  <h3 style="margin:4px 0">Đúng ${st.ok}/${st.total} câu</h3><div class="small">${msg}${best ? ` · Điểm cao nhất: ${best.best}%` : ""}</div>
  <div class="rlist">${ex.items.map((q, i) => {
    const r = S.res[key(i)];
    const text = (q.q || "").replace(/___/g, "…").slice(0, 110);
    return `<div class="ritem ${r ? (r.ok ? "ok" : "bad") : "na"}" data-j="${i}" tabindex="0"><span class="m">${r ? (r.ok ? "✓" : "✗") : "–"}</span><span>${i + 1}. ${esc(text)}${r && !r.ok ? `<br><span class="small">Đáp án: ${esc(ansText(q))}</span>` : ""}</span></div>`;
  }).join("")}</div>
  <div class="row" style="justify-content:center">
    <button class="btn" id="redo" ${wrong.length ? "" : "disabled"}>🔁 Làm lại ${wrong.length} câu sai</button>
    <button class="btn ghost" id="all">Làm lại cả bài</button>
    ${last ? `<button class="btn ghost" id="fin">Hoàn thành phần này ✔</button>` : `<button class="btn ghost" id="nx">Bài tiếp theo →</button>`}
  </div></section>`;
  $("#app").innerHTML = h;
  wireTabs();
  $$("[data-j]").forEach((b) => (b.onclick = () => {
    S.order = [...Array(ex.items.length).keys()];
    S.pos = +b.dataset.j;
    go("study");
  }));
  $("#redo").onclick = () => {
    delete S.bd[`${S.sec}|${S.ex}`];
    wrong.forEach((i) => { delete S.res[key(i)]; ex.items[i]._p = null; });
    ex._p = null;
    S.scored.delete(exKeyOf(ex));
    newRun(ex);
    startEx(S.ex, wrong);
  };
  $("#all").onclick = () => {
    delete S.bd[`${S.sec}|${S.ex}`];
    ex._p = null;
    ex.items.forEach((q, i) => { delete S.res[key(i)]; q._p = null; });
    S.scored.delete(exKeyOf(ex));
    newRun(ex);
    if (ex.gen) ex.items = ex.gen();
    startEx(S.ex);
  };
  if (last) $("#fin").onclick = backToSecs;
  else $("#nx").onclick = () => startEx(S.ex + 1);
  if (st.total) {
    if (pctV >= 80) { confetti(pctV === 100 ? 220 : 140); say("done_good", {}, true); }
    else if (pctV >= 50) say("done_mid", {}, true);
    else say("done_low", {}, true);
  }
  renderHud();
}

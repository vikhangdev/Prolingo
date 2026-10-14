/* ============================================================
   CHI TIẾT HỌC VIÊN (admin)
   - Các lần làm: mỗi lượt làm một bài, điểm, chi tiết từng câu
   - Câu sai: những câu học viên đang sai kèm đáp án + lời giải để hướng dẫn lại
   - Chưa hoàn thành: phần/bài chưa làm hoặc làm dở
   - Lời nhắc: soạn & gửi nhắc nhở, xem lịch sử đã gửi
   ============================================================ */
import { $, $$, esc, md, toast, errMsg, fmtDate, fmtDateTime, avatarHtml, SECTIONS, SECTION_KEYS } from "../../utils.js";
import * as api from "../../api.js";
import { Auth } from "../../auth.js";
import { shell, dialogForm } from "./ui.js";
import { unitHue } from "../shared.js";

const TABS = [["runs", "Các lần làm"], ["wrong", "Câu sai cần hướng dẫn"], ["missing", "Chưa hoàn thành"], ["rem", "Lời nhắc đã gửi"]];
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const formatDuration = (seconds) => {
  const hours = Math.floor(seconds / 3600), minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours} giờ ${minutes} phút` : `${minutes} phút`;
};

/** Đáp án đúng đọc từ nội dung câu hỏi (dùng khi không có bản chụp trong nhật ký) */
function correctOf(kind, c) {
  if (kind === "tf") return (c.ans || [0])[0] === 0 ? "True" : "False";
  if (kind === "fl") return (c.ans || []).map((a) => (Array.isArray(a) ? a[0] : a)).join(" | ");
  if (kind === "pair") return c.b || "";
  return (c.ans || []).map((i) => (c.opts || [])[i]).join(" + ");
}

export async function viewAdminStudent({ id }) {
  const body = shell("users", "Quá trình học", '<a class="btn ghost" href="#/admin/users">← Danh sách</a>');
  body.innerHTML = '<div class="loading"><div class="spin"></div>Đang tải dữ liệu học viên…</div>';
  let R;
  try { R = await api.studentReport(id); } catch (e) { body.innerHTML = `<div class="alert err">${esc(errMsg(e))}</div>`; return; }
  if (!R.profile) { body.innerHTML = '<div class="empty-state"><h3>Không tìm thấy học viên</h3></div>'; return; }
  const P = R.profile;

  /* ---------- Tính toán ---------- */
  const unitById = Object.fromEntries(R.units.map((u) => [u.id, u]));
  const fieldById = Object.fromEntries(R.fields.map((f) => [f.id, f]));
  const statOf = Object.fromEntries(R.stats.map((s) => [s.unit_id, s]));
  const unitLabel = (uid) => {
    const u = unitById[uid];
    if (!u) return "(unit đã xóa)";
    const f = fieldById[u.field_id];
    const idx = R.units.filter((x) => x.field_id === u.field_id).findIndex((x) => x.id === uid) + 1;
    return `${f ? f.name_vi || f.name : "?"} › Unit ${idx}: ${u.name}`;
  };
  const qCount = {};
  const questionsByExercise = {};
  R.qlinks.forEach((q) => {
    qCount[q.exercise_id] = (qCount[q.exercise_id] || 0) + 1;
    (questionsByExercise[q.exercise_id] ||= []).push(q);
  });
  const exOfQ = Object.fromEntries(R.qlinks.map((q) => [q.id, q.exercise_id]));
  const exStat = {}; // exercise id -> {answered, correct}
  R.progress.forEach((r) => {
    if (!r.question_id) return;
    const e = exOfQ[r.question_id];
    if (!e) return;
    const s = (exStat[e] ||= { answered: 0, correct: 0 });
    s.answered++;
    if (r.ok) s.correct++;
  });
  const bankStat = {};
  R.progress.forEach((r) => { if (r.word_id) { const s = (bankStat[r.unit_id] ||= { answered: 0, correct: 0 }); s.answered++; if (r.ok) s.correct++; } });

  let selectedField = "all", selectedUnit = "all", selectedStatus = "all", selectedPeriod = "all";
  const withinPeriod = (date) => {
    if (selectedPeriod === "all") return true;
    const days = Number(selectedPeriod);
    return date && new Date(date).getTime() >= Date.now() - days * 86400000;
  };
  const scopedUnitIds = () => {
    if (selectedUnit !== "all") return new Set([selectedUnit]);
    return new Set(R.units
      .filter((u) => selectedField === "all" || u.field_id === selectedField)
      .map((u) => u.id));
  };
  const scopedMissing = () => {
    const unitIds = scopedUnitIds();
    return missing.filter((m) => unitIds.has(m.unit));
  };
  const scopedProgress = () => {
    const unitIds = scopedUnitIds();
    return R.progress.filter((r) => {
      if (!unitIds.has(r.unit_id) || !withinPeriod(r.updated_at)) return false;
      if (selectedStatus === "all") return true;
      const item = r.question_id
        ? missingByExercise.get(exOfQ[r.question_id])
        : missingBankByUnit.get(r.unit_id);
      return item && statusMatches(item);
    });
  };
  const scopedRuns = () => {
    const unitIds = scopedUnitIds();
    return R.runs.filter((r) => unitIds.has(r.unit_id) && withinPeriod(r.updated_at || r.started_at));
  };
  const scopedTotal = () => R.stats
    .filter((s) => scopedUnitIds().has(s.unit_id))
    .reduce((a, s) => a + s.n_words + s.n_vocab + s.n_lang + s.n_read, 0);
  const lastTime = [...R.progress.map((r) => r.updated_at), ...R.runs.map((r) => r.updated_at || r.started_at)]
    .filter(Boolean).sort().pop();

  /** Danh sách phần chưa hoàn thành */
  const missing = [];
  R.units.forEach((u) => {
    const s = statOf[u.id] || { n_words: 0 };
    if (s.n_words) {
      const b = bankStat[u.id] || { answered: 0, correct: 0 };
      missing.push({ unit: u.id, label: "Word Bank (từ vựng)", total: s.n_words, answered: b.answered, correct: b.correct, section: "bank" });
    }
  });
  R.exercises.forEach((e) => {
    const total = qCount[e.id] || 0;
    if (!total) return;
    const s = exStat[e.id] || { answered: 0, correct: 0 };
    missing.push({ unit: e.unit_id, exerciseId: e.id, label: `${SECTIONS[e.section].n} › ${e.title}`, total, answered: s.answered, correct: s.correct, section: e.section });
  });
  const missingByExercise = new Map(missing.filter((item) => item.exerciseId).map((item) => [item.exerciseId, item]));
  const missingBankByUnit = new Map(missing.filter((item) => item.section === "bank").map((item) => [item.unit, item]));
  missing.forEach((m) => { m.status = m.answered === 0 ? "none" : m.answered < m.total ? "part" : "done"; });
  const incomplete = missing.filter((m) => m.status !== "done");
  const missingText = () => scopedMissing().filter((m) => statusMatches(m) && m.status !== "done").map((m) => `${unitLabel(m.unit)} › ${m.label}${m.status === "part" ? ` (đã làm ${m.answered}/${m.total})` : " (chưa làm)"}`);
  const statusMatches = (item) => selectedStatus === "all" ||
    (selectedStatus === "completed" && item.status === "done") ||
    (selectedStatus === "in_progress" && item.status === "part") ||
    (selectedStatus === "not_started" && item.status === "none");
  const completionStats = () => {
    let completed = 0, total = 0;
    R.exercises.forEach((exercise) => {
      const questions = questionsByExercise[exercise.id] || [];
      if (!questions.length || !scopedUnitIds().has(exercise.unit_id)) return;
      total++;
      const answeredRows = questions.map((q) => progressByQuestion.get(q.id)).filter(Boolean);
      if (answeredRows.length >= questions.length && (selectedStatus === "all" || selectedStatus === "completed")) {
        const doneAt = answeredRows.map((r) => r.updated_at).sort().pop();
        if (withinPeriod(doneAt)) completed++;
      }
    });
    return { completed, total };
  };
  const learnedFieldIds = new Set([
    ...R.progress.map((r) => unitById[r.unit_id]?.field_id),
    ...R.runs.map((r) => unitById[r.unit_id]?.field_id),
  ].filter(Boolean));
  const learnedFields = R.fields.filter((field) => learnedFieldIds.has(field.id));

  /* ---------- Khung trang ---------- */
  let tab = "runs", runLimit = 30;
  const wrongBox = { loaded: false, items: [] };
  const answersCache = {};
  const progressByQuestion = new Map(R.progress.filter((r) => r.question_id).map((r) => [r.question_id, r]));

  body.innerHTML = `<section class="stu-head">${avatarHtml(P, "avatar-lg")}
      <div class="sp"><h2 class="t" style="font-size:24px">${esc(P.display_name || "(chưa đặt tên)")}</h2><div class="muted">${esc(P.email)} · ${P.role === "admin" ? "Quản trị viên" : "Học viên"} · ${P.is_active === false ? "Đã khóa" : "Đang hoạt động"} · tham gia ${fmtDate(P.created_at)}</div>
        <div class="small" style="margin-top:5px">Ngành chính: <b>${esc(fieldById[P.primary_field_id]?.name_vi || fieldById[P.primary_field_id]?.name || "Chưa chọn")}</b> · Hoạt động gần nhất: <b>${fmtDateTime(lastTime)}</b></div>
        <div class="small" style="margin-top:4px">Ngành đã có hoạt động học: ${learnedFields.length ? learnedFields.map((field) => `<span class="badge">${esc(field.name_vi || field.name)}</span>`).join(" ") : "Chưa có"}</div></div>
      <div class="row" style="margin:0"><button class="btn" id="remind">Gửi lời nhắc</button></div></section>
    <div class="filters" style="margin-top:16px">
      <div class="fld"><label for="progress-field">Ngành</label><select class="select" id="progress-field"><option value="all">Tất cả ngành</option>${R.fields.map((f) => `<option value="${f.id}">${esc(f.name_vi || f.name)}</option>`).join("")}</select></div>
      <div class="fld"><label for="progress-unit">Unit</label><select class="select" id="progress-unit"></select></div>
      <div class="fld"><label for="progress-status">Trạng thái học</label><select class="select" id="progress-status"><option value="all">Tất cả trạng thái</option><option value="completed">Hoàn thành</option><option value="in_progress">Đang học</option><option value="not_started">Chưa bắt đầu</option></select></div>
      <div class="fld"><label for="progress-period">Thời gian</label><select class="select" id="progress-period"><option value="all">Toàn bộ thời gian</option><option value="7">7 ngày gần đây</option><option value="30">30 ngày gần đây</option><option value="90">90 ngày gần đây</option></select></div>
    </div>
    <div class="kpis" id="student-scope-kpis"></div><p class="hint">Thời gian học là ước tính từ khoảng cách giữa các câu trả lời, giới hạn tối đa 5 phút mỗi khoảng. Lượt cũ trước khi bật ghi thời gian có thể chưa có số liệu.</p>
    <div class="tabs-mini" role="tablist">${TABS.map(([k, t]) => `<button class="tab ${k === tab ? "on" : ""}" role="tab" data-t="${k}">${t}${k === "missing" ? ` <span class="sc">${incomplete.length}</span>` : ""}</button>`).join("")}</div><div id="stab"></div>`;

  const box = $("#stab", body);
  const draw = () => {
    $$("[data-t]", body).forEach((b) => b.classList.toggle("on", b.dataset.t === tab));
    ({ runs: drawRuns, wrong: drawWrong, missing: drawMissing, rem: drawRem })[tab]();
  };
  $$("[data-t]", body).forEach((b) => (b.onclick = () => { tab = b.dataset.t; draw(); }));
  const drawScope = () => {
    const unitSelect = $("#progress-unit", body);
    const availableUnits = R.units.filter((u) => selectedField === "all" || u.field_id === selectedField);
    unitSelect.innerHTML = `<option value="all">Tất cả unit</option>${availableUnits.map((u) => `<option value="${u.id}">${esc(fieldById[u.field_id]?.name_vi || fieldById[u.field_id]?.name || "")} · ${esc(u.name)}</option>`).join("")}`;
    unitSelect.value = selectedUnit;
    const scopeProgressRows = scopedProgress(), scopeTotalCount = scopedTotal(), scopeRuns = scopedRuns();
    const scopeCorrect = scopeProgressRows.filter((r) => r.ok).length;
    const completed = completionStats();
    const studySeconds = scopeRuns.reduce((sum, run) => sum + (Number(run.duration_seconds) || 0), 0);
    $("#student-scope-kpis", body).innerHTML = `<div class="kpi"><b>${scopeRuns.length}</b><span>lượt làm bài</span></div>
      <div class="kpi"><b>${completed.completed}<small>/${completed.total}</small></b><span>bài hoàn thành</span></div>
      <div class="kpi"><b>${scopeProgressRows.length}<small>/${scopeTotalCount}</small></b><span>đã làm trong phạm vi chọn (${pct(scopeProgressRows.length, scopeTotalCount)}%)</span></div>
      <div class="kpi"><b>${pct(scopeCorrect, scopeProgressRows.length)}%</b><span>tỉ lệ đúng trong phạm vi chọn</span></div>
      <div class="kpi"><b>${formatDuration(studySeconds)}</b><span>thời gian học ước tính</span></div>`;
    const count = scopedMissing().filter(statusMatches).length;
    const missingTab = $('[data-t="missing"]', body);
    if (missingTab) missingTab.innerHTML = `${selectedStatus === "all" ? "Chưa hoàn thành" : "Nội dung phù hợp"} <span class="sc">${count}</span>`;
    draw();
  };
  $("#progress-field", body).onchange = (e) => {
    selectedField = e.target.value;
    selectedUnit = "all";
    drawScope();
  };
  $("#progress-unit", body).onchange = (e) => {
    selectedUnit = e.target.value;
    drawScope();
  };
  $("#progress-status", body).onchange = (e) => {
    selectedStatus = e.target.value;
    drawScope();
  };
  $("#progress-period", body).onchange = (e) => {
    selectedPeriod = e.target.value;
    drawScope();
  };
  drawScope();

  /* ---------- Tab: các lần làm ---------- */
  function drawRuns() {
    const runs = scopedRuns().filter((run) =>
      selectedStatus === "all" ||
      (selectedStatus === "completed" && run.answered >= run.total) ||
      (selectedStatus === "in_progress" && run.answered < run.total)
    );
    const scopeProgressRows = scopedProgress();
    if (!runs.length) {
      box.innerHTML = `<div class="empty-state"><div class="big">🕘</div><h3>Không có lượt làm bài trong phạm vi đang chọn</h3><p>Lịch sử làm bài chỉ có từ khi bảng nhật ký được cài đặt và bắt đầu ghi nhận. ${scopeProgressRows.length ? `Học viên đã có ${scopeProgressRows.length} nội dung được lưu tiến độ trong phạm vi này — xem ở tab "Câu sai" và "Chưa hoàn thành".` : ""}</p></div>`;
      return;
    }
    const shown = runs.slice(0, runLimit);
    box.innerHTML = `<div class="tbl-scroll"><table class="dtable"><thead><tr><th>Thời gian</th><th>Nội dung</th><th>Điểm</th><th>Trạng thái</th><th></th></tr></thead><tbody>${shown.map((r) => {
      const p = pct(r.correct, r.answered), done = r.answered >= r.total;
      return `<tr data-run="${r.id}"><td>${fmtDateTime(r.started_at)}</td><td><b>${esc(r.ex_title)}</b><br><span class="small">${esc(unitLabel(r.unit_id))} · ${esc(SECTIONS[r.section]?.n || r.section)}</span></td>
        <td><b>${r.correct}/${r.answered}</b> <span class="badge ${p >= 80 ? "green" : p >= 50 ? "gold" : "red"}">${p}%</span></td>
        <td>${done ? '<span class="badge green">Hoàn thành</span>' : `<span class="badge gold">Dở dang ${r.answered}/${r.total}</span>`}</td>
        <td class="acts"><button class="btn ghost sm" data-open="${r.id}">Xem chi tiết</button></td></tr><tr class="detail" data-d="${r.id}" hidden><td colspan="5"></td></tr>`;
    }).join("")}</tbody></table></div>${runs.length > runLimit ? `<div class="row"><button class="btn ghost" id="moreRuns">Hiện thêm (${runs.length - runLimit} lượt nữa)</button></div>` : ""}`;
    $$("[data-open]", box).forEach((b) => (b.onclick = async () => {
      const rid = b.dataset.open, row = $(`[data-d="${rid}"]`, box), cell = row.firstElementChild;
      if (!row.hidden) { row.hidden = true; b.textContent = "Xem chi tiết"; return; }
      row.hidden = false; b.textContent = "Ẩn";
      if (!answersCache[rid]) {
        cell.innerHTML = '<div class="muted">Đang tải…</div>';
        try { answersCache[rid] = await api.runAnswers(rid); } catch (e) { cell.innerHTML = `<div class="alert err">${esc(errMsg(e))}</div>`; return; }
      }
      const list = answersCache[rid];
      cell.innerHTML = list.length ? `<div class="alist">${list.map((a, i) => `<div class="ans ${a.ok ? "ok" : "bad"}"><span class="m">${a.ok ? "✓" : "✗"}</span><div><div>${i + 1}. ${esc(a.q_text)}</div>
        <div class="small">Học viên: <b>${esc(a.given_text || "—")}</b>${a.ok ? "" : ` · Đáp án: <b>${esc(a.correct_text)}</b>`}</div></div></div>`).join("")}</div>` : '<div class="muted">Không có chi tiết câu trả lời.</div>';
    }));
    const more = $("#moreRuns", box);
    if (more) more.onclick = () => { runLimit += 30; drawRuns(); };
  }

  /* ---------- Tab: câu sai ---------- */
  async function loadWrong() {
    if (wrongBox.loaded) return;
    const wrongRows = R.progress.filter((r) => !r.ok);
    const qIds = wrongRows.filter((r) => r.question_id).map((r) => r.question_id);
    const wIds = wrongRows.filter((r) => r.word_id).map((r) => r.word_id);
    const D = await api.studentWrongDetail(id, qIds, wIds);
    const lastLog = {}, times = {};
    D.logs.forEach((l) => { const k = l.question_id ? "q:" + l.question_id : "w:" + l.word_id; times[k] = (times[k] || 0) + 1; if (!lastLog[k]) lastLog[k] = l; });
    const qMap = Object.fromEntries(D.questions.map((q) => [q.id, q])), wMap = Object.fromEntries(D.words.map((w) => [w.id, w]));
    wrongBox.items = wrongRows.map((r) => {
      const k = r.question_id ? "q:" + r.question_id : "w:" + r.word_id, log = lastLog[k], q = qMap[r.question_id], w = wMap[r.word_id];
      const c = q ? q.content || {} : {};
      return {
        unit: r.unit_id, section: r.section, when: r.updated_at, times: times[k] || 1,
        status: (r.question_id
          ? missingByExercise.get(exOfQ[r.question_id])
          : missingBankByUnit.get(r.unit_id))?.status || "none",
        q: log?.q_text || (q ? (q.kind === "pair" ? c.a : c.q) : w ? w.en : "(câu hỏi đã bị xóa)"),
        given: log?.given_text || "",
        correct: log?.correct_text || (q ? correctOf(q.kind, c) : w ? w.vi : ""),
        why: q ? c.why || "" : w ? `${w.en} = ${w.vi}` : "", tip: q ? c.tip || "" : "",
      };
    }).sort((a, b) => b.times - a.times);
    wrongBox.loaded = true;
  }
  async function drawWrong() {
    const scopeProgressRows = scopedProgress();
    const hasWrong = scopeProgressRows.some((r) => !r.ok);
    if (!hasWrong) { box.innerHTML = `<div class="empty-state"><div class="big">🎉</div><h3>Học viên không có câu nào đang sai trong phạm vi chọn</h3><p>${scopeProgressRows.length ? "Tất cả câu đã làm trong phạm vi này đều đúng ở lần gần nhất." : "Học viên chưa làm nội dung nào trong phạm vi này."}</p></div>`; return; }
    box.innerHTML = '<div class="loading"><div class="spin"></div>Đang tải các câu sai…</div>';
    try { await loadWrong(); } catch (e) { box.innerHTML = `<div class="alert err">${esc(errMsg(e))}</div>`; return; }
    if (tab !== "wrong") return;
    const byUnit = {};
    const unitIds = scopedUnitIds();
    const filteredWrong = wrongBox.items.filter((it) => unitIds.has(it.unit) && withinPeriod(it.when) && statusMatches({ status: it.status }));
    if (!filteredWrong.length) {
      box.innerHTML = '<div class="empty-state"><h3>Không có câu sai khớp với trạng thái và thời gian đã chọn</h3></div>';
      return;
    }
    filteredWrong.forEach((it) => (byUnit[it.unit] ||= []).push(it));
    const units = Object.keys(byUnit).sort((a, b) => byUnit[b].length - byUnit[a].length);
    box.innerHTML = `<div class="help">Học viên đang sai <b>${filteredWrong.length}</b> câu (kết quả gần nhất của mỗi câu). Mở từng unit để xem câu hỏi, đáp án của học viên, đáp án đúng và lời giải. Bấm <b>Gửi lời nhắc</b> để kèm danh sách này.</div>
      ${units.map((u, i) => `<details class="fgroup" ${i === 0 ? "open" : ""}><summary>${esc(unitLabel(u))} <span class="badge red">${byUnit[u].length} câu sai</span></summary>${byUnit[u].map((it) => `<article class="wq"><div class="wq-q">${esc(it.q)}</div>
        <div class="small">${it.given ? `Học viên chọn: <b class="bad-t">${esc(it.given)}</b> · ` : ""}Đáp án đúng: <b class="ok-t">${esc(it.correct)}</b> · <span class="badge">${esc(SECTIONS[it.section]?.n || it.section)}</span>${it.times > 1 ? ` <span class="badge red">sai ${it.times} lần</span>` : ""}</div>
        ${it.why ? `<div class="blk why"><b class="t">Lời giải</b>${md(it.why)}</div>` : ""}${it.tip ? `<div class="blk tip"><b class="t">Mẹo ghi nhớ</b>${md(it.tip)}</div>` : ""}</article>`).join("")}</details>`).join("")}`;
  }

  /* ---------- Tab: chưa hoàn thành ---------- */
  let showDone = false;
  function drawMissing() {
    const scopeMissing = scopedMissing().filter(statusMatches);
    const scopeIncomplete = scopeMissing.filter((m) => m.status !== "done");
    const list = showDone || selectedStatus === "completed" ? scopeMissing : scopeIncomplete;
    const byUnit = {};
    list.forEach((m) => (byUnit[m.unit] ||= []).push(m));
    const order = R.units.filter((u) => byUnit[u.id]);
    const none = scopeIncomplete.filter((m) => m.status === "none").length, part = scopeIncomplete.filter((m) => m.status === "part").length;
    box.innerHTML = `<div class="filters" style="margin-bottom:14px"><div class="sp"><b>${scopeIncomplete.length}</b> phần chưa hoàn thành: <span class="badge red">${none} chưa làm</span> <span class="badge gold">${part} làm dở</span></div>
      <label class="chk"><input type="checkbox" id="sd" ${showDone ? "checked" : ""}> Hiện cả phần đã xong</label></div>
      ${order.length ? order.map((u) => `<section class="panel" style="padding:12px 16px"><h3 style="font-size:17px;margin-bottom:6px">${esc(unitLabel(u.id))}</h3><div class="tbl-scroll"><table class="ptable"><tbody>${byUnit[u.id].map((m) => `<tr><td>${esc(m.label)}</td>
        <td style="width:26%"><div class="bar" style="--u:hsl(${unitHue(u, fieldById[u.field_id], 0)} 55% 40%)"><i style="width:${pct(m.answered, m.total)}%"></i></div></td><td>${m.answered}/${m.total}</td>
        <td>${m.status === "none" ? '<span class="badge red">Chưa làm</span>' : m.status === "part" ? '<span class="badge gold">Làm dở</span>' : m.answered && pct(m.correct, m.answered) < 70 ? '<span class="badge red">Xong · cần ôn ' + pct(m.correct, m.answered) + "%</span>" : '<span class="badge green">Xong</span>'}</td></tr>`).join("")}</tbody></table></div></section>`).join("")
      : '<div class="empty-state"><div class="big">✅</div><h3>Học viên đã hoàn thành mọi phần</h3></div>'}`;
    $("#sd", box).onchange = (e) => { showDone = e.target.checked; drawMissing(); };
  }

  /* ---------- Tab: lời nhắc ---------- */
  let remList = null;
  async function drawRem() {
    box.innerHTML = '<div class="loading"><div class="spin"></div>Đang tải…</div>';
    try { remList = await api.studentReminders(id); } catch (e) { box.innerHTML = `<div class="alert err">${esc(errMsg(e))} — hãy chắc chắn đã chạy schema/migration mới nhất trong thư mục <code>supabase/</code>.</div>`; return; }
    if (tab !== "rem") return;
    const filteredReminders = remList.filter((reminder) => withinPeriod(reminder.created_at));
    box.innerHTML = filteredReminders.length ? filteredReminders.map((r) => `<article class="panel" style="padding:14px 18px"><div class="row between" style="margin:0 0 6px"><span class="small">${fmtDateTime(r.created_at)}</span>${r.read_at ? `<span class="badge green">Đã đọc ${fmtDateTime(r.read_at)}</span>` : '<span class="badge gold">Chưa đọc</span>'}</div><div style="white-space:pre-wrap">${esc(r.message)}</div></article>`).join("")
      : '<div class="empty-state"><div class="big">📭</div><h3>Chưa gửi lời nhắc nào cho học viên này</h3></div>';
  }

  /* ---------- Soạn & gửi lời nhắc ---------- */
  $("#remind", body).onclick = async () => {
    const btn = $("#remind", body);
    btn.disabled = true;
    try { await loadWrong(); } catch (e) { /* không có chi tiết sai vẫn nhắc được */ }
    btn.disabled = false;
    const missingItems = missingText();
    const unitIds = scopedUnitIds();
    const wrongItems = wrongBox.items.filter((item) =>
      unitIds.has(item.unit) && withinPeriod(item.when) && statusMatches({ status: item.status })
    );
    const wrong = wrongItems.slice(0, 8);
    const build = (inc1, inc2) => {
      let t = `Chào ${P.display_name || "bạn"},\nGiáo viên nhắc bạn tiếp tục luyện tập nhé.\n`;
      if (inc1 && missingItems.length) t += "\nCác phần bạn chưa hoàn thành:\n" + missingItems.slice(0, 10).map((x) => "• " + x).join("\n") + (missingItems.length > 10 ? `\n… và ${missingItems.length - 10} phần khác` : "") + "\n";
      if (inc2 && wrong.length) t += "\nCác câu bạn đang làm sai, hãy xem lại:\n" + wrong.map((w) => `• ${w.q}  →  đáp án: ${w.correct}`).join("\n") + "\n";
      return t + "\nVào mục Học tập để làm tiếp. Cố lên!";
    };
    dialogForm({
      title: `Gửi lời nhắc · ${P.display_name || P.email}`, wide: true, submitText: "Gửi trong web",
      body: `<div class="row" style="margin-top:0"><label class="chk"><input type="checkbox" id="i1" ${missingItems.length ? "checked" : "disabled"}> Kèm các phần chưa hoàn thành (${missingItems.length})</label>
        <label class="chk"><input type="checkbox" id="i2" ${wrong.length ? "checked" : "disabled"}> Kèm các câu đang sai (${wrongItems.length})</label></div>
        <div class="fld"><label for="msg">Nội dung (có thể sửa trước khi gửi)</label><textarea class="textarea" id="msg" rows="14"></textarea><span class="hint">Học viên sẽ thấy lời nhắc ở Trang chủ khi đăng nhập. Đổi lựa chọn bên trên sẽ tạo lại nội dung gợi ý.</span></div>
        <button type="button" class="btn ghost" id="mail" ${P.email ? "" : "disabled"}>Mở email để gửi</button>`,
      onMount: (d) => {
        const msg = $("#msg", d), regen = () => (msg.value = build($("#i1", d).checked, $("#i2", d).checked));
        regen();
        $("#i1", d).onchange = regen; $("#i2", d).onchange = regen;
        $("#mail", d).onclick = () => { location.href = `mailto:${encodeURIComponent(P.email)}?subject=${encodeURIComponent("Nhắc nhở luyện tập tiếng Anh")}&body=${encodeURIComponent(msg.value)}`; };
      },
      onSubmit: async (d) => {
        const text = $("#msg", d).value.trim();
        if (!text) throw new Error("Nội dung lời nhắc đang trống.");
        await api.sendReminder(id, Auth.user.id, text);
        toast("Đã gửi lời nhắc");
        if (tab === "rem") drawRem();
      },
    });
  };

  draw();
}

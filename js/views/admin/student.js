/* ============================================================
   CHI TIẾT HỌC VIÊN (admin)
   - Các lần làm: mỗi lượt làm một bài, điểm, chi tiết từng câu
   - Câu sai: những câu học viên đang sai kèm đáp án + lời giải để hướng dẫn lại
   - Chưa hoàn thành: phần/bài chưa làm hoặc làm dở
   - Lời nhắc: soạn & gửi nhắc nhở, xem lịch sử đã gửi
   ============================================================ */
import { $, $$, esc, md, toast, errMsg, fmtDate, fmtDateTime, SECTIONS, SECTION_KEYS } from "../../utils.js";
import * as api from "../../api.js";
import { Auth } from "../../auth.js";
import { shell, dialogForm } from "./ui.js";
import { unitHue } from "../shared.js";

const TABS = [["runs", "Các lần làm"], ["wrong", "Câu sai cần hướng dẫn"], ["missing", "Chưa hoàn thành"], ["rem", "Lời nhắc đã gửi"]];
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const daysAgo = (d) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : null);

/** Đáp án đúng đọc từ nội dung câu hỏi (dùng khi không có bản chụp trong nhật ký) */
function correctOf(kind, c) {
  if (kind === "tf") return (c.ans || [0])[0] === 0 ? "True" : "False";
  if (kind === "fl") return (c.ans || []).map((a) => (Array.isArray(a) ? a[0] : a)).join(" | ");
  if (kind === "pair") return c.b || "";
  return (c.ans || []).map((i) => (c.opts || [])[i]).join(" + ");
}

export async function viewAdminStudent({ id }) {
  const body = shell("users", "Chi tiết học viên", '<a class="btn ghost" href="#/admin/users">← Danh sách</a>');
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
  const prog = new Map(); // "q:id" | "w:id" -> ok
  R.progress.forEach((r) => prog.set(r.question_id ? "q:" + r.question_id : "w:" + r.word_id, r));
  const qCount = {};
  R.qlinks.forEach((q) => (qCount[q.exercise_id] = (qCount[q.exercise_id] || 0) + 1));
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

  const answered = R.progress.length, correct = R.progress.filter((r) => r.ok).length;
  const totalContent = R.stats.reduce((a, s) => a + s.n_words + s.n_vocab + s.n_lang + s.n_read, 0);
  const lastTime = [R.progress.map((r) => r.updated_at).sort().pop(), R.runs[0]?.updated_at].filter(Boolean).sort().pop();
  const idle = daysAgo(lastTime);

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
    missing.push({ unit: e.unit_id, label: `${SECTIONS[e.section].n} › ${e.title}`, total, answered: s.answered, correct: s.correct, section: e.section });
  });
  missing.forEach((m) => { m.status = m.answered === 0 ? "none" : m.answered < m.total ? "part" : "done"; });
  const incomplete = missing.filter((m) => m.status !== "done");
  const missingText = incomplete.map((m) => `${unitLabel(m.unit)} › ${m.label}${m.status === "part" ? ` (đã làm ${m.answered}/${m.total})` : " (chưa làm)"}`);

  /* ---------- Khung trang ---------- */
  let tab = "runs", runLimit = 30;
  const wrongBox = { loaded: false, items: [] };
  const answersCache = {};

  body.innerHTML = `<section class="stu-head"><div class="avatar-lg" style="--uh:${[...(P.email || "")].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7)}">${esc((P.display_name || P.email || "?")[0].toUpperCase())}</div>
      <div class="sp"><h2 class="t" style="font-size:24px">${esc(P.display_name || "(chưa đặt tên)")}</h2><div class="muted">${esc(P.email)} · ${P.role === "admin" ? "Quản trị viên" : "Học viên"} · tham gia ${fmtDate(P.created_at)}</div></div>
      <div class="row" style="margin:0"><button class="btn" id="remind">Gửi lời nhắc</button></div></section>
    <div class="kpis"><div class="kpi"><b>${R.runs.length}</b><span>lượt làm bài</span></div>
      <div class="kpi"><b>${answered}<small>/${totalContent}</small></b><span>câu đã làm (${pct(answered, totalContent)}%)</span></div>
      <div class="kpi"><b>${pct(correct, answered)}%</b><span>tỉ lệ đúng</span></div>
      <div class="kpi ${idle == null || idle >= 7 ? "warn" : ""}"><b>${idle == null ? "—" : idle === 0 ? "Hôm nay" : idle + " ngày"}</b><span>${idle == null ? "chưa học lần nào" : "kể từ lần học gần nhất"}</span></div></div>
    <div class="tabs-mini" role="tablist">${TABS.map(([k, t]) => `<button class="tab ${k === tab ? "on" : ""}" role="tab" data-t="${k}">${t}${k === "missing" ? ` <span class="sc">${incomplete.length}</span>` : ""}</button>`).join("")}</div><div id="stab"></div>`;

  const box = $("#stab", body);
  const draw = () => {
    $$("[data-t]", body).forEach((b) => b.classList.toggle("on", b.dataset.t === tab));
    ({ runs: drawRuns, wrong: drawWrong, missing: drawMissing, rem: drawRem })[tab]();
  };
  $$("[data-t]", body).forEach((b) => (b.onclick = () => { tab = b.dataset.t; draw(); }));

  /* ---------- Tab: các lần làm ---------- */
  function drawRuns() {
    if (!R.runs.length) {
      box.innerHTML = `<div class="empty-state"><div class="big">🕘</div><h3>Chưa có lượt làm bài nào được ghi lại</h3><p>Lịch sử từng lần làm chỉ được ghi từ khi tính năng này hoạt động (đã chạy <code>03_student_tracking.sql</code> và cập nhật code). ${answered ? `Học viên đã có ${answered} câu làm trước đó — xem ở tab "Câu sai" và "Chưa hoàn thành".` : ""}</p></div>`;
      return;
    }
    const shown = R.runs.slice(0, runLimit);
    box.innerHTML = `<div class="tbl-scroll"><table class="dtable"><thead><tr><th>Thời gian</th><th>Nội dung</th><th>Điểm</th><th>Trạng thái</th><th></th></tr></thead><tbody>${shown.map((r) => {
      const p = pct(r.correct, r.answered), done = r.answered >= r.total;
      return `<tr data-run="${r.id}"><td>${fmtDateTime(r.started_at)}</td><td><b>${esc(r.ex_title)}</b><br><span class="small">${esc(unitLabel(r.unit_id))} · ${esc(SECTIONS[r.section]?.n || r.section)}</span></td>
        <td><b>${r.correct}/${r.answered}</b> <span class="badge ${p >= 80 ? "green" : p >= 50 ? "gold" : "red"}">${p}%</span></td>
        <td>${done ? '<span class="badge green">Hoàn thành</span>' : `<span class="badge gold">Dở dang ${r.answered}/${r.total}</span>`}</td>
        <td class="acts"><button class="btn ghost sm" data-open="${r.id}">Xem chi tiết</button></td></tr><tr class="detail" data-d="${r.id}" hidden><td colspan="5"></td></tr>`;
    }).join("")}</tbody></table></div>${R.runs.length > runLimit ? `<div class="row"><button class="btn ghost" id="moreRuns">Hiện thêm (${R.runs.length - runLimit} lượt nữa)</button></div>` : ""}`;
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
        q: log?.q_text || (q ? (q.kind === "pair" ? c.a : c.q) : w ? w.en : "(câu hỏi đã bị xóa)"),
        given: log?.given_text || "",
        correct: log?.correct_text || (q ? correctOf(q.kind, c) : w ? w.vi : ""),
        why: q ? c.why || "" : w ? `${w.en} = ${w.vi}` : "", tip: q ? c.tip || "" : "",
      };
    }).sort((a, b) => b.times - a.times);
    wrongBox.loaded = true;
  }
  async function drawWrong() {
    const n = R.progress.filter((r) => !r.ok).length;
    if (!n) { box.innerHTML = `<div class="empty-state"><div class="big">🎉</div><h3>Học viên không có câu nào đang sai</h3><p>${answered ? "Tất cả câu đã làm đều đúng ở lần gần nhất." : "Học viên chưa làm câu nào."}</p></div>`; return; }
    box.innerHTML = '<div class="loading"><div class="spin"></div>Đang tải các câu sai…</div>';
    try { await loadWrong(); } catch (e) { box.innerHTML = `<div class="alert err">${esc(errMsg(e))}</div>`; return; }
    if (tab !== "wrong") return;
    const byUnit = {};
    wrongBox.items.forEach((it) => (byUnit[it.unit] ||= []).push(it));
    const units = Object.keys(byUnit).sort((a, b) => byUnit[b].length - byUnit[a].length);
    box.innerHTML = `<div class="help">Học viên đang sai <b>${n}</b> câu (kết quả gần nhất của mỗi câu). Mở từng unit để xem câu hỏi, đáp án của học viên, đáp án đúng và lời giải. Bấm <b>Gửi lời nhắc</b> để kèm danh sách này.</div>
      ${units.map((u, i) => `<details class="fgroup" ${i === 0 ? "open" : ""}><summary>${esc(unitLabel(u))} <span class="badge red">${byUnit[u].length} câu sai</span></summary>${byUnit[u].map((it) => `<article class="wq"><div class="wq-q">${esc(it.q)}</div>
        <div class="small">${it.given ? `Học viên chọn: <b class="bad-t">${esc(it.given)}</b> · ` : ""}Đáp án đúng: <b class="ok-t">${esc(it.correct)}</b> · <span class="badge">${esc(SECTIONS[it.section]?.n || it.section)}</span>${it.times > 1 ? ` <span class="badge red">sai ${it.times} lần</span>` : ""}</div>
        ${it.why ? `<div class="blk why"><b class="t">Lời giải</b>${md(it.why)}</div>` : ""}${it.tip ? `<div class="blk tip"><b class="t">Mẹo ghi nhớ</b>${md(it.tip)}</div>` : ""}</article>`).join("")}</details>`).join("")}`;
  }

  /* ---------- Tab: chưa hoàn thành ---------- */
  let showDone = false;
  function drawMissing() {
    const list = showDone ? missing : incomplete;
    const byUnit = {};
    list.forEach((m) => (byUnit[m.unit] ||= []).push(m));
    const order = R.units.filter((u) => byUnit[u.id]);
    const none = incomplete.filter((m) => m.status === "none").length, part = incomplete.filter((m) => m.status === "part").length;
    box.innerHTML = `<div class="filters" style="margin-bottom:14px"><div class="sp"><b>${incomplete.length}</b> phần chưa hoàn thành: <span class="badge red">${none} chưa làm</span> <span class="badge gold">${part} làm dở</span></div>
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
    try { remList = await api.studentReminders(id); } catch (e) { box.innerHTML = `<div class="alert err">${esc(errMsg(e))} — hãy chắc chắn đã chạy <code>03_student_tracking.sql</code>.</div>`; return; }
    if (tab !== "rem") return;
    box.innerHTML = remList.length ? remList.map((r) => `<article class="panel" style="padding:14px 18px"><div class="row between" style="margin:0 0 6px"><span class="small">${fmtDateTime(r.created_at)}</span>${r.read_at ? `<span class="badge green">Đã đọc ${fmtDateTime(r.read_at)}</span>` : '<span class="badge gold">Chưa đọc</span>'}</div><div style="white-space:pre-wrap">${esc(r.message)}</div></article>`).join("")
      : '<div class="empty-state"><div class="big">📭</div><h3>Chưa gửi lời nhắc nào cho học viên này</h3></div>';
  }

  /* ---------- Soạn & gửi lời nhắc ---------- */
  $("#remind", body).onclick = async () => {
    const btn = $("#remind", body);
    btn.disabled = true;
    try { await loadWrong(); } catch (e) { /* không có chi tiết sai vẫn nhắc được */ }
    btn.disabled = false;
    const wrong = wrongBox.items.slice(0, 8);
    const build = (inc1, inc2) => {
      let t = `Chào ${P.display_name || "bạn"},\nGiáo viên nhắc bạn tiếp tục luyện tập nhé.\n`;
      if (inc1 && missingText.length) t += "\nCác phần bạn chưa hoàn thành:\n" + missingText.slice(0, 10).map((x) => "• " + x).join("\n") + (missingText.length > 10 ? `\n… và ${missingText.length - 10} phần khác` : "") + "\n";
      if (inc2 && wrong.length) t += "\nCác câu bạn đang làm sai, hãy xem lại:\n" + wrong.map((w) => `• ${w.q}  →  đáp án: ${w.correct}`).join("\n") + "\n";
      return t + "\nVào mục Học tập để làm tiếp. Cố lên!";
    };
    dialogForm({
      title: `Gửi lời nhắc · ${P.display_name || P.email}`, wide: true, submitText: "Gửi trong web",
      body: `<div class="row" style="margin-top:0"><label class="chk"><input type="checkbox" id="i1" ${missingText.length ? "checked" : "disabled"}> Kèm các phần chưa hoàn thành (${missingText.length})</label>
        <label class="chk"><input type="checkbox" id="i2" ${wrong.length ? "checked" : "disabled"}> Kèm các câu đang sai (${wrongBox.items.length})</label></div>
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

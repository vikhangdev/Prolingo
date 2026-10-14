import { $, $$, esc, confirmBox, SECTIONS } from "../../utils.js";
import * as api from "../../api.js";
import { shell, scopeFilters, act, dialogForm, moveItem } from "./ui.js";

const KIND_LABEL = { mc: "Trắc nghiệm", tf: "Đúng/Sai", ms: "Chọn nhiều", fl: "Điền từ", pair: "Cặp nối" };
const SEC3 = ["vocab", "lang", "read"];
const lines = (t) => String(t || "").split("\n").map((s) => s.trim()).filter(Boolean);

const summary = (q) => {
  const c = q.content || {};
  return q.kind === "pair" ? `${c.a || ""}  ↔  ${c.b || ""}` : c.q || "";
};

export async function viewAdminExercises() {
  const body = shell("exercises", "Bài tập & bài đọc", '<button class="btn" id="add">+ Thêm bài tập</button>');
  let scope = null, exercises = [];

  const load = async () => {
    if (!scope.unit) { body.innerHTML = `<div class="empty-state"><div class="big">📘</div><h3>Ngành này chưa có unit</h3><a class="btn" href="#/admin/units">Tạo unit</a></div>`; return; }
    exercises = (await api.getUnitContent(scope.unit.id)).exercises;
    draw();
  };

  const draw = () => {
    const part = SEC3.map((sec) => {
      const list = exercises.filter((e) => e.section === sec);
      const cards = list.map((e, i) => `<article class="excard"><header>
          <b>${esc(e.title)}</b><span class="badge blue">${e.kind === "match" ? "Bài nối" : "Trắc nghiệm / điền từ"}</span><span class="badge">${e.questions.length} câu</span>${e.passage ? '<span class="badge gold">Có bài đọc</span>' : ""}
          <span><button class="btn ghost sm" data-up="${e.id}" ${i === 0 ? "disabled" : ""}>↑</button> <button class="btn ghost sm" data-dn="${e.id}" ${i === list.length - 1 ? "disabled" : ""}>↓</button>
          <button class="btn ghost sm" data-eex="${e.id}">Sửa bài</button> <button class="btn sm" data-aq="${e.id}">+ Câu hỏi</button> <button class="btn ghost sm" data-jq="${e.id}" title="Dán JSON">JSON</button> <button class="btn danger sm" data-dex="${e.id}">Xóa bài</button></span></header>
          ${e.questions.length ? e.questions.map((q, qi) => `<div class="qrow"><span class="qn">${qi + 1}</span><span class="badge">${KIND_LABEL[q.kind] || q.kind}</span><span class="qt" title="${esc(summary(q))}">${esc(summary(q))}</span>
            <span class="acts"><button class="btn ghost sm" data-qu="${q.id}" ${qi === 0 ? "disabled" : ""}>↑</button> <button class="btn ghost sm" data-qd="${q.id}" ${qi === e.questions.length - 1 ? "disabled" : ""}>↓</button>
            <button class="btn ghost sm" data-eq="${q.id}">Sửa</button> <button class="btn danger sm" data-dq="${q.id}">Xóa</button></span></div>`).join("") : '<div class="qrow"><span></span><span></span><span class="muted">Chưa có câu hỏi. Học viên sẽ chưa thấy bài này.</span></div>'}</article>`).join("");
      return `<section style="margin-bottom:26px"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:10px"><h2 style="margin:0">${SECTIONS[sec].ic} ${SECTIONS[sec].n} <span class="small">· ${SECTIONS[sec].vi}</span></h2><button class="btn danger sm" data-delete-section="${sec}" ${list.length ? "" : "disabled"}>Xóa tất cả</button></div>${cards ? `<div class="exlist">${cards}</div>` : '<div class="empty-state" style="padding:20px">Chưa có bài tập nào trong phần này.</div>'}</section>`;
    }).join("");
    body.innerHTML = `<div class="help">Phần <b>Word Bank</b> (danh sách, thẻ ghi nhớ, trắc nghiệm từ vựng) được tạo tự động từ <a href="#/admin/words">Kho từ vựng</a>.</div>${part}`;

    const exOf = (id) => exercises.find((e) => e.id === id);
    const qOf = (id) => { for (const e of exercises) { const q = e.questions.find((x) => x.id === id); if (q) return [e, q]; } return []; };
    $$("[data-eex]", body).forEach((b) => (b.onclick = () => editExercise(exOf(b.dataset.eex))));
    $$("[data-dex]", body).forEach((b) => (b.onclick = async () => {
      const e = exOf(b.dataset.dex);
      if (!(await confirmBox(
        `Xóa bài "${e.title}" và toàn bộ ${e.questions.length} câu hỏi bên trong? Tiến độ học liên quan cũng sẽ bị xóa. Chọn Hủy nếu không muốn xóa.`,
        { okText: "Xóa bài và câu hỏi" }
      ))) return;
      if (await act(async () => {
        if (e.questions.length) await api.deleteWhere("questions", "exercise_id", e.id);
        await api.deleteRow("exercises", e.id);
      }, "Đã xóa bài và câu hỏi")) await load();
    }));
    $$("[data-delete-section]", body).forEach((b) => (b.onclick = () => deleteSection(b.dataset.deleteSection)));
    $$("[data-aq]", body).forEach((b) => (b.onclick = () => editQuestion(exOf(b.dataset.aq), null)));
    $$("[data-jq]", body).forEach((b) => (b.onclick = () => jsonQuestions(exOf(b.dataset.jq))));
    $$("[data-eq]", body).forEach((b) => (b.onclick = () => { const [e, q] = qOf(b.dataset.eq); editQuestion(e, q); }));
    $$("[data-dq]", body).forEach((b) => (b.onclick = async () => {
      if (!(await confirmBox("Xóa câu hỏi này? Tiến độ học liên quan cũng bị xóa."))) return;
      if (await act(() => api.deleteRow("questions", b.dataset.dq), "Đã xóa câu hỏi")) load();
    }));
    const reorderEx = (id, d) => async () => {
      const e = exOf(id), list = exercises.filter((x) => x.section === e.section), a = moveItem(list, id, d);
      if (a && (await act(() => api.saveOrder("exercises", a.map((r) => ({ id: r.id, sort_order: -1 }))))) !== false) load();
    };
    $$("[data-up]", body).forEach((b) => (b.onclick = reorderEx(b.dataset.up, -1)));
    $$("[data-dn]", body).forEach((b) => (b.onclick = reorderEx(b.dataset.dn, 1)));
    const reorderQ = (id, d) => async () => {
      const [e] = qOf(id), a = moveItem(e.questions, id, d);
      if (a && (await act(() => api.saveOrder("questions", a.map((r) => ({ id: r.id, sort_order: -1 }))))) !== false) load();
    };
    $$("[data-qu]", body).forEach((b) => (b.onclick = reorderQ(b.dataset.qu, -1)));
    $$("[data-qd]", body).forEach((b) => (b.onclick = reorderQ(b.dataset.qd, 1)));
  };

  const deleteSection = async (section) => {
    const list = exercises.filter((e) => e.section === section);
    if (!list.length) return;
    const questionCount = list.reduce((sum, e) => sum + e.questions.length, 0);
    const titles = list.map((e) => `“${e.title}”`).join(", ");
    const message = `Xóa tất cả ${list.length} bài trong ${SECTIONS[section].n}: ${titles}. Thao tác này sẽ xóa ${questionCount} câu hỏi cùng dữ liệu tiến độ và điểm của các bài này. Không thể hoàn tác. Chọn Hủy để thoát mà không xóa.`;
    if (!(await confirmBox(message, { okText: "Xóa tất cả" }))) return;
    const exerciseIds = list.map((e) => e.id);
    if (await act(async () => {
      await api.deleteIn("questions", "exercise_id", exerciseIds);
      await api.deleteIn("scores", "ex_key", exerciseIds);
      await api.deleteIn("exercises", "id", exerciseIds);
    }, `Đã xóa ${list.length} bài và ${questionCount} câu hỏi trong ${SECTIONS[section].n}`)) await load();
  };

  /* ---------- Thêm / sửa bài tập ---------- */
  const editExercise = (e) => {
    const isNew = !e;
    e = e || { section: "vocab", kind: "quiz", title: "", instruction: "", instruction_vi: "", passage: "" };
    dialogForm({
      title: isNew ? "Thêm bài tập" : "Sửa bài tập", wide: true,
      body: `<div class="grid3"><div class="fld"><label for="sec">Phần</label><select class="select" id="sec" ${isNew ? "" : "disabled"}>${SEC3.map((s) => `<option value="${s}" ${e.section === s ? "selected" : ""}>${SECTIONS[s].n} — ${SECTIONS[s].vi}</option>`).join("")}</select></div>
        <div class="fld"><label for="kd">Dạng bài</label><select class="select" id="kd" ${isNew ? "" : "disabled"}><option value="quiz" ${e.kind === "quiz" ? "selected" : ""}>Trắc nghiệm / điền từ</option><option value="match" ${e.kind === "match" ? "selected" : ""}>Bài nối cột A–B</option></select></div>
        <div class="fld"><label for="ti">Tiêu đề *</label><input class="input" id="ti" value="${esc(e.title)}" placeholder="Bài 1 · Chọn từ đúng"></div></div>
        <div class="grid2"><div class="fld"><label for="in">Hướng dẫn (tiếng Anh)</label><input class="input" id="in" value="${esc(e.instruction)}" placeholder="Choose the best word."></div>
        <div class="fld"><label for="iv">Hướng dẫn (tiếng Việt)</label><input class="input" id="iv" value="${esc(e.instruction_vi)}"></div></div>
        <div class="fld"><label for="ps">Bài đọc (tuỳ chọn)</label><textarea class="textarea" id="ps" rows="9" placeholder="Dán đoạn văn vào đây. Mỗi đoạn cách nhau một dòng; học viên có nút dịch từng đoạn.">${esc(e.passage)}</textarea><span class="hint">Đặt trong phần Reading, các câu hỏi bên dưới sẽ hiển thị cùng bài đọc.</span></div>`,
      onSubmit: async (d) => {
        const title = $("#ti", d).value.trim();
        if (!title) throw new Error("Vui lòng nhập tiêu đề bài.");
        const row = { title, instruction: $("#in", d).value.trim(), instruction_vi: $("#iv", d).value.trim(), passage: $("#ps", d).value.trim() };
        if (isNew) {
          const section = $("#sec", d).value;
          const order = exercises.filter((x) => x.section === section).length;
          await api.insertRow("exercises", { ...row, unit_id: scope.unit.id, section, kind: $("#kd", d).value, sort_order: order });
        } else await api.updateRow("exercises", e.id, row);
        await load();
      },
    });
  };

  /* ---------- Thêm / sửa câu hỏi ---------- */
  const editQuestion = (ex, q) => {
    const isNew = !q;
    const isMatch = ex.kind === "match";
    let kind = q ? q.kind : isMatch ? "pair" : "mc";
    const cur = JSON.parse(JSON.stringify(q ? q.content : {}));

    const fieldsFor = (k, c) => {
      const common = `<div class="fld"><label for="why">Giải thích vì sao đúng</label><textarea class="textarea" id="why" rows="2" placeholder="Dùng **chữ đậm** để nhấn mạnh">${esc(c.why || "")}</textarea></div>
        <div class="fld"><label for="tip">Mẹo ghi nhớ</label><input class="input" id="tip" value="${esc(c.tip || "")}"></div>`;
      if (k === "pair") return `<div class="grid2"><div class="fld"><label for="pa">Cột A *</label><input class="input" id="pa" value="${esc(c.a || "")}" placeholder="bug"></div>
        <div class="fld"><label for="pb">Cột B (đáp án đúng) *</label><input class="input" id="pb" value="${esc(c.b || "")}" placeholder="an error in a program"></div></div>
        <div class="fld"><label for="px">Ghi chú thêm (hiện sau "A ↔ B")</label><input class="input" id="px" value="${esc(c.extra || "")}"></div><div class="fld"><label for="tip">Mẹo ghi nhớ</label><input class="input" id="tip" value="${esc(c.tip || "")}"></div>`;
      if (k === "tf") return `<div class="fld"><label for="q">Phát biểu *</label><textarea class="textarea" id="q" rows="2">${esc(c.q || "")}</textarea></div>
        <div class="fld"><label for="tfa">Đáp án đúng</label><select class="select" id="tfa" style="max-width:200px"><option value="0" ${(c.ans || [0])[0] === 0 ? "selected" : ""}>True</option><option value="1" ${(c.ans || [0])[0] === 1 ? "selected" : ""}>False</option></select></div>${common}`;
      if (k === "fl") return `<div class="fld"><label for="q">Câu hỏi * <span class="hint">— đánh dấu chỗ trống bằng <code>___</code></span></label><textarea class="textarea" id="q" rows="2" placeholder="The bug ___ (fix) yesterday.">${esc(c.q || "")}</textarea></div>
        <div class="fld"><label for="fa">Đáp án (mỗi dòng = một chỗ trống) *</label><textarea class="textarea" id="fa" rows="3" placeholder="was fixed">${esc((c.ans || []).map((a) => (Array.isArray(a) ? a : [a]).join(" | ")).join("\n"))}</textarea><span class="hint">Nhiều đáp án chấp nhận được thì ngăn cách bằng <code>|</code>, ví dụ <code>has used | has been using</code>.</span></div>${common}`;
      // mc | ms
      return `<div class="fld"><label for="q">Câu hỏi *</label><textarea class="textarea" id="q" rows="2">${esc(c.q || "")}</textarea></div>
        <div class="fld"><label for="op">Các lựa chọn (mỗi dòng một lựa chọn) *</label><textarea class="textarea" id="op" rows="4">${esc((c.opts || []).join("\n"))}</textarea></div>
        <div class="fld"><span class="lbl">${k === "mc" ? "Chọn đáp án đúng" : "Tick tất cả đáp án đúng"}</span><div class="qopts" id="cor"></div></div>
        ${k === "mc" ? `<div class="fld"><label for="no">Vì sao các đáp án còn lại sai (tuỳ chọn)</label><textarea class="textarea" id="no" rows="2">${esc(typeof c.no === "string" ? c.no : "")}</textarea></div>
        <label class="chk" style="margin-bottom:12px"><input type="checkbox" id="fx" ${c.fixed ? "checked" : ""}> Giữ nguyên thứ tự lựa chọn (không xáo trộn)</label>` : ""}${common}`;
    };

    const renderCorrect = (d, k, sel) => {
      const box = $("#cor", d), op = lines($("#op", d).value);
      box.innerHTML = op.length ? op.map((o, i) => `<label class="qopt"><input type="${k === "mc" ? "radio" : "checkbox"}" name="cr" value="${i}" ${sel.includes(i) ? "checked" : ""}><span>${esc(o)}</span></label>`).join("") : '<span class="small">Nhập các lựa chọn ở trên trước.</span>';
    };

    const paint = (d) => {
      const kindSel = isMatch ? "" : `<div class="fld"><label for="kk">Loại câu hỏi</label><select class="select" id="kk" style="max-width:260px" ${isNew ? "" : "disabled"}>${["mc", "tf", "ms", "fl"].map((k) => `<option value="${k}" ${k === kind ? "selected" : ""}>${KIND_LABEL[k]}</option>`).join("")}</select></div>`;
      $("#qbody", d).innerHTML = kindSel + fieldsFor(kind, cur);
      if (!isMatch && $("#kk", d)) $("#kk", d).onchange = (ev) => { harvest(d); kind = ev.target.value; paint(d); };
      if (kind === "mc" || kind === "ms") {
        renderCorrect(d, kind, cur.ans || []);
        $("#op", d).oninput = () => renderCorrect(d, kind, $$('input[name="cr"]:checked', d).map((x) => +x.value));
      }
    };
    const val = (d, id) => { const el = $("#" + id, d); return el ? el.value : undefined; };
    const harvest = (d) => { // giữ lại những gì đã gõ khi đổi loại câu hỏi
      ["q", "why", "tip"].forEach((id) => { const v = val(d, id); if (v !== undefined) cur[id] = v; });
    };

    dialogForm({
      title: (isNew ? "Thêm" : "Sửa") + (isMatch ? " cặp nối" : " câu hỏi") + " · " + ex.title, wide: true,
      body: `<div id="qbody"></div>`,
      onMount: paint,
      onSubmit: async (d) => {
        let content;
        if (kind === "pair") {
          const a = val(d, "pa").trim(), b = val(d, "pb").trim();
          if (!a || !b) throw new Error("Cần nhập cả cột A và cột B.");
          content = { a, b, extra: val(d, "px").trim(), tip: val(d, "tip").trim() };
        } else {
          const qt = (val(d, "q") || "").trim();
          if (!qt) throw new Error("Vui lòng nhập nội dung câu hỏi.");
          content = { q: qt, why: (val(d, "why") || "").trim(), tip: (val(d, "tip") || "").trim() };
          if (kind === "tf") content.ans = [+val(d, "tfa")];
          else if (kind === "fl") {
            const ans = lines(val(d, "fa")).map((l) => l.split("|").map((s) => s.trim()).filter(Boolean));
            const blanks = qt.split("___").length - 1;
            if (!blanks) throw new Error('Câu hỏi cần có ít nhất một chỗ trống "___".');
            if (ans.length !== blanks) throw new Error(`Câu có ${blanks} chỗ trống nhưng bạn nhập ${ans.length} dòng đáp án.`);
            content.ans = ans;
          } else {
            const opts = lines(val(d, "op"));
            if (opts.length < 2) throw new Error("Cần ít nhất 2 lựa chọn.");
            const ans = $$('input[name="cr"]:checked', d).map((x) => +x.value);
            if (!ans.length) throw new Error("Hãy chọn đáp án đúng.");
            Object.assign(content, { opts, ans });
            if (kind === "mc") { const no = (val(d, "no") || "").trim(); if (no) content.no = no; if ($("#fx", d).checked) content.fixed = true; }
          }
        }
        if (isNew) await api.insertRow("questions", { exercise_id: ex.id, kind, content, sort_order: ex.questions.length });
        else await api.updateRow("questions", q.id, { kind, content });
        await load();
      },
    });
  };

  /* ---------- Dán JSON nhiều câu ---------- */
  const jsonQuestions = (ex) => dialogForm({
    title: "Thêm nhiều câu bằng JSON · " + ex.title, wide: true, submitText: "Thêm tất cả",
    body: `<div class="help">Dán một mảng JSON. Mỗi phần tử có <code>kind</code> (mc, tf, ms, fl, pair) và <code>content</code>. Mẹo: nhờ Claude/ChatGPT soạn câu hỏi theo mẫu này rồi dán vào đây.<pre>[
 {"kind":"mc","content":{"q":"A ___ translates code.","opts":["compiler","branch"],"ans":[0],"why":"**compiler** = trình biên dịch.","tip":""}},
 {"kind":"tf","content":{"q":"The team has six engineers.","ans":[0],"why":"Đoạn 1.","tip":""}},
 {"kind":"fl","content":{"q":"The bug ___ (fix) yesterday.","ans":[["was fixed"]],"why":"","tip":""}},
 {"kind":"pair","content":{"a":"bug","b":"an error in a program","extra":"","tip":""}}
]</pre></div><div class="fld"><textarea class="textarea" id="js" rows="12" spellcheck="false"></textarea></div>`,
    onSubmit: async (d) => {
      let arr;
      try { arr = JSON.parse($("#js", d).value); } catch (e) { throw new Error("JSON không hợp lệ: " + e.message); }
      if (!Array.isArray(arr) || !arr.length) throw new Error("Cần một mảng JSON có ít nhất 1 câu.");
      const okKinds = ex.kind === "match" ? ["pair"] : ["mc", "tf", "ms", "fl"];
      arr.forEach((x, i) => { if (!okKinds.includes(x.kind) || !x.content) throw new Error(`Phần tử #${i + 1}: "kind" phải là ${okKinds.join(", ")} và có "content".`); });
      await api.insertRows("questions", arr.map((x, i) => ({ exercise_id: ex.id, kind: x.kind, content: x.content, sort_order: ex.questions.length + i })));
      await load();
    },
  });

  scope = await scopeFilters(true, async (s) => { scope = s; await load(); });
  if (!scope) return;
  $("#add").onclick = () => (scope.unit ? editExercise(null) : null);
  await load();
}

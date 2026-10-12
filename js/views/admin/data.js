import { $, $$, esc, toast, errMsg, confirmBox, notice, openDialog, closeDialog, SECTIONS } from "../../utils.js";
import * as api from "../../api.js";
import { shell } from "./ui.js";
import { unitHue } from "../shared.js";
import { guardField, guardUnit, guardExercise, guardExercisesOfUnit, guardUnitsOfField } from "./guard.js";

const TABS = [["import", "⬆️ Nhập dữ liệu"], ["export", "⬇️ Xuất dữ liệu"], ["delete", "🗑️ Xóa dữ liệu"]];
let tab = "import";
const openNodes = new Set(); // nhớ nhánh đang mở khi vẽ lại cây xóa

export async function viewAdminData() {
  const body = shell("data", "Quản lý dữ liệu");
  const draw = async () => {
    body.innerHTML = `<div class="tabs-mini" role="tablist">${TABS.map(([k, t]) => `<button class="tab ${k === tab ? "on" : ""}" role="tab" data-t="${k}">${t}</button>`).join("")}</div><div id="tabbody"></div>`;
    $$("[data-t]", body).forEach((b) => (b.onclick = () => { tab = b.dataset.t; draw(); }));
    const box = $("#tabbody", body);
    try {
      if (tab === "import") await importTab(box);
      else if (tab === "export") await exportTab(box);
      else await deleteTab(box);
    } catch (e) { box.innerHTML = `<div class="alert err">${esc(errMsg(e))}</div>`; }
  };
  await draw();
}

/* ============================================================
   NHẬP
   ============================================================ */
async function importTab(box) {
  box.innerHTML = `<div class="help">Dữ liệu một ngành (unit, từ vựng, bài tập, câu hỏi) nằm trong một file JSON. Nhập vào luôn tạo ngành <b>MỚI</b>, không ghi đè ngành cũ.</div>
    <section class="panel"><h3>Nhập dữ liệu</h3>
      <p class="muted" style="margin-top:0">Bộ mẫu <b>Công nghệ thông tin</b> (8 unit, ~670 từ, ~380 câu hỏi) đi kèm trong thư mục <code>data/</code>.</p>
      <div class="row" style="margin-top:0"><button class="btn hi" id="seed">Nạp dữ liệu mẫu CNTT</button></div>
      <div class="fld" style="margin-top:18px"><label for="file">Hoặc chọn file JSON</label><input class="input" id="file" type="file" accept=".json,application/json"></div>
      <button class="btn" id="imp">Nhập file</button></section>
    <pre class="progress-log" id="log" hidden></pre>`;
  const log = $("#log", box);
  const say = (t) => { log.hidden = false; log.textContent += t + "\n"; log.scrollTop = log.scrollHeight; };
  const run = async (data) => {
    log.textContent = "";
    try { await api.importField(data, say); toast("Nhập dữ liệu thành công"); say("→ Vào mục Ngành / Unit để xem kết quả."); }
    catch (e) { say("✘ Lỗi: " + errMsg(e)); toast(errMsg(e), "err"); }
  };
  $("#seed", box).onclick = async (ev) => {
    ev.target.disabled = true;
    try { const r = await fetch("data/it-field.json"); if (!r.ok) throw new Error("Không tìm thấy data/it-field.json"); await run(await r.json()); }
    catch (e) { say("✘ " + errMsg(e)); } finally { ev.target.disabled = false; }
  };
  $("#imp", box).onclick = async () => {
    const f = $("#file", box).files[0];
    if (!f) return toast("Hãy chọn file JSON trước", "err");
    let data;
    try { data = JSON.parse(await f.text()); } catch (e) { return toast("File không phải JSON hợp lệ", "err"); }
    await run(data);
  };
}

/* ============================================================
   XUẤT
   ============================================================ */
async function exportTab(box) {
  const fields = await api.listFields();
  box.innerHTML = `<section class="panel"><h3>Xuất dữ liệu một ngành</h3>
    <p class="muted" style="margin-top:0">Tải về file JSON để sao lưu, chuyển sang dự án khác hoặc dùng làm mẫu.</p>
    <div class="fld"><label for="xf">Chọn ngành</label><select class="select" id="xf" style="max-width:420px">${fields.map((f) => `<option value="${f.id}">${esc(f.icon)} ${esc(f.name_vi || f.name)}</option>`).join("") || "<option value=''>(chưa có ngành)</option>"}</select></div>
    <button class="btn" id="exp" ${fields.length ? "" : "disabled"}>Tải file JSON</button></section>`;
  $("#exp", box).onclick = async () => {
    try {
      const data = await api.exportField($("#xf", box).value);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
      a.download = `${data.field.slug}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { toast(errMsg(e), "err"); }
  };
}

/* ============================================================
   XÓA — theo cấp, từ nhỏ đến lớn (cây: Ngành › Unit › Bài tập)
   ============================================================ */
const LOCK = '<svg width="12" height="12" viewBox="0 0 18 20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 9V6a4 4 0 018 0v3M3 9h12v9H3z"/></svg>';
const showAll = new Set(); // các nhánh đã bấm "Hiện tất cả"
let query = "";

async function deleteTab(box) {
  box.innerHTML = '<div class="loading"><div class="spin"></div>Đang tải cấu trúc dữ liệu…</div>';
  const T = await api.adminTree();
  const tot = {
    fields: T.fields.length, units: T.units.length, exercises: T.exercises.length,
    words: Object.values(T.words).reduce((a, s) => a + s.n_words, 0),
    questions: T.exercises.reduce((a, e) => a + e.nq, 0), glossary: T.glossary,
  };
  let menu = null; // id menu "Dọn dẹp" đang mở

  const unitsOf = (fid) => T.units.filter((u) => u.field_id === fid);
  const exOf = (uid) => T.exercises.filter((e) => e.unit_id === uid);
  const nWords = (uid) => T.words[uid]?.n_words || 0;
  const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
  const lc = (x) => String(x || "").toLowerCase();
  const hit = (...xs) => xs.some((x) => lc(x).includes(query));

  const btn = (act, id, label, cls = "", ico = "") => `<button class="btn sm ${cls}" data-act="${act}" data-id="${id}">${ico}${label}</button>`;
  const mi = (act, id, label, n) => `<button class="dz-mi" role="menuitem" data-act="${act}" data-id="${id}">${label}<span class="dz-n">${n}</span></button>`;
  const menuBtn = (key, items) => `<span class="menu-wrap"><button class="btn sm ghost" data-menu="${key}" aria-haspopup="true" aria-expanded="${menu === key}">Dọn dẹp ▾</button>${menu === key ? `<div class="dz-menu" role="menu">${items}</div>` : ""}</span>`;
  const more = (key, n, what) => `<button class="dz-more" data-more="${key}">+ ${n} ${what} khác · Hiện tất cả</button>`;

  const exRow = (e) => `<div class="dz-ex"><span class="dz-tag soft">${esc(SECTIONS[e.section]?.n || e.section)}</span><span class="sp">${esc(e.title)}</span><span class="dz-n">${e.nq} câu</span>
    ${btn("q-ex", e.id, "Xóa câu hỏi", "ghost")}${e.nq ? btn("ex", e.id, "Xóa bài", "lock", LOCK) : btn("ex", e.id, "Xóa bài", "del")}</div>`;

  const unitBlock = (u, i, f, fieldMatch) => {
    const exs = exOf(u.id), nw = nWords(u.id), nq = sum(exs, (e) => e.nq);
    const open = query ? true : openNodes.has("u" + u.id);
    const unitMatch = !query || fieldMatch || hit(u.name, u.name_vi);
    const list = query && !unitMatch ? exs.filter((e) => hit(e.title)) : exs;
    const limit = query || showAll.has("ua" + u.id) ? list.length : 3;
    const left = [nw ? `${nw} từ` : "", exs.length ? `${exs.length} bài` : ""].filter(Boolean).join(" · ");
    const items = mi("q-unit", u.id, "Xóa tất cả câu hỏi", nq) + mi("ex-unit", u.id, "Xóa tất cả bài tập", exs.length) + mi("w-unit", u.id, "Xóa tất cả từ vựng", nw);
    let kids = "";
    if (open) {
      kids = `<div class="dz-sub">${nw ? `<div class="dz-ex"><span class="dz-tag gold">Từ vựng</span><span class="sp">${nw} từ trong kho từ vựng</span>${btn("w-unit", u.id, "Xóa tất cả từ vựng", "del")}</div>` : ""}
        ${list.slice(0, limit).map(exRow).join("")}${list.length > limit ? more("ua" + u.id, list.length - limit, "bài tập") : ""}
        ${!nw && !exs.length ? '<div class="dz-ex muted">Unit trống — có thể xóa.</div>' : ""}</div>`;
    }
    return `<div class="dz-unit ${open ? "open" : ""}"><div class="dz-uhead"><button class="dz-tg" data-tg="u${u.id}" aria-expanded="${open}"><span class="chev"></span><span class="dz-tag" style="--tc:hsl(${unitHue(u, f, i)} 55% 38%)">UNIT ${i + 1}</span><b class="sp">${esc(u.name)}</b>
      <span class="dz-n">${nw} từ</span><span class="dz-n">${exs.length} bài</span><span class="dz-n">${nq} câu</span></button>
      ${left ? btn("unit", u.id, `Còn ${left}`, "lock", LOCK) : btn("unit", u.id, "Xóa unit", "del")}${menuBtn("m" + u.id, items)}</div>${kids}</div>`;
  };

  const fieldBlock = (f) => {
    const us = unitsOf(f.id);
    const fieldMatch = !query || hit(f.name, f.name_vi);
    let vis = us.map((u, i) => ({ u, i }));
    if (query && !fieldMatch) vis = vis.filter(({ u }) => hit(u.name, u.name_vi) || exOf(u.id).some((e) => hit(e.title)));
    if (query && !fieldMatch && !vis.length) return "";
    const open = query ? true : openNodes.has("f" + f.id);
    const limit = query || showAll.has("fa" + f.id) ? vis.length : 3;
    const nq = sum(us, (u) => sum(exOf(u.id), (e) => e.nq)), nw = sum(us, (u) => nWords(u.id));
    const kids = open ? `<div class="dz-kids">${vis.slice(0, limit).map(({ u, i }) => unitBlock(u, i, f, fieldMatch)).join("") || '<div class="dz-ex muted">Ngành chưa có unit — có thể xóa.</div>'}${vis.length > limit ? more("fa" + f.id, vis.length - limit, "unit") : ""}</div>` : "";
    return `<div class="dz-field" style="--fh:${f.hue}"><div class="dz-fhead"><button class="dz-tg" data-tg="f${f.id}" aria-expanded="${open}"><span class="chev"></span><span class="dz-tile" aria-hidden="true">${esc(f.icon)}</span>
      <span class="sp"><span class="t dz-fname">${esc(f.name_vi || f.name)}</span><span class="small" style="display:block">${esc(f.name)}</span></span>
      <span class="dz-n">${us.length} unit</span><span class="dz-n">${nw} từ</span><span class="dz-n">${nq} câu hỏi</span></button>
      ${us.length ? btn("field", f.id, `Còn ${us.length} unit`, "lock", LOCK) : btn("field", f.id, "Xóa ngành", "del")}${menuBtn("m" + f.id, mi("u-field", f.id, "Xóa tất cả unit", us.length))}</div>${kids}</div>`;
  };

  const drawTree = () => {
    const html = T.fields.map(fieldBlock).join("");
    $("#tree", box).innerHTML = html || `<div class="empty-state">${T.fields.length ? "Không tìm thấy kết quả phù hợp." : "Chưa có dữ liệu nào để xóa."}</div>`;
  };

  box.innerHTML = `<div class="dz-bar"><div class="sp"><div class="muted">Xóa từ cấp nhỏ lên lớn: <b>Câu hỏi → Bài tập/Từ vựng → Unit → Ngành</b>.<br> Nút xám có ổ khóa nghĩa là bên trong còn mục con.</div></div>
      <input id="tsearch" class="input" placeholder="Tìm ngành, unit, bài tập…" aria-label="Tìm" value="${esc(query)}" style="max-width:260px"><button class="btn ghost" id="collapse" type="button">Thu gọn tất cả</button></div>
    <div id="tree" class="dz-tree"></div>
    <p class="small">Khi xóa câu hỏi hoặc từ vựng, <b>tiến độ học</b> liên quan của học viên cũng bị xóa theo.</p>
    <section class="panel danger-zone"><h3>Xóa toàn bộ dữ liệu</h3>
      <p class="muted" style="margin-top:0">Hiện có <b>${tot.fields}</b> ngành, <b>${tot.units}</b> unit, <b>${tot.words}</b> từ vựng, <b>${tot.exercises}</b> bài tập, <b>${tot.questions}</b> câu hỏi và <b>${tot.glossary}</b> mục từ điển. Tài khoản người dùng được giữ lại.</p>
      <button class="btn danger" id="all" ${tot.fields || tot.glossary ? "" : "disabled"}>Xóa toàn bộ dữ liệu…</button></section>`;
  drawTree();

  $("#tsearch", box).oninput = (e) => { query = e.target.value.trim().toLowerCase(); menu = null; drawTree(); };
  $("#collapse", box).onclick = () => { openNodes.clear(); showAll.clear(); menu = null; query = ""; $("#tsearch", box).value = ""; drawTree(); };
  $("#all", box).onclick = () => deleteAllDialog(tot, () => deleteTab(box));

  box.onclick = async (e) => {
    if (menu && !e.target.closest(".menu-wrap")) { menu = null; drawTree(); } // bấm ra ngoài → đóng menu
    const b = e.target.closest("button");
    if (!b || b.id === "all" || b.id === "collapse") return;
    const d = b.dataset;
    if (d.tg) { openNodes.has(d.tg) ? openNodes.delete(d.tg) : openNodes.add(d.tg); menu = null; return drawTree(); }
    if (d.more) { showAll.add(d.more); return drawTree(); }
    if (d.menu) { menu = menu === d.menu ? null : d.menu; return drawTree(); }
    if (d.act) {
      menu = null; b.disabled = true;
      try { if (await runAction(d.act, d.id, T)) return await deleteTab(box); drawTree(); }
      catch (err) { toast(errMsg(err), "err"); drawTree(); }
    }
  };
}

/** Thực hiện 1 thao tác xóa. Trả về true nếu đã xóa (cần vẽ lại cây). */
async function runAction(act, id, T) {
  const unit = T.units.find((u) => u.id === id), field = T.fields.find((f) => f.id === id), ex = T.exercises.find((e) => e.id === id);
  const done = (msg) => { toast(msg); return true; };
  const nothing = async (m) => { await notice(m, "Không có gì để xóa"); return false; };
  const blocked = async (m) => { await notice(m); return false; };

  if (act === "q-ex") {
    if (!ex.nq) return nothing(`Bài "${ex.title}" chưa có câu hỏi nào.`);
    if (!(await confirmBox(`Xóa tất cả ${ex.nq} câu hỏi của bài "${ex.title}"? Tiến độ học liên quan cũng bị xóa.`))) return false;
    await api.deleteWhere("questions", "exercise_id", ex.id);
    return done(`Đã xóa ${ex.nq} câu hỏi`);
  }
  if (act === "ex") {
    const msg = await guardExercise(ex);
    if (msg) return blocked(msg);
    if (!(await confirmBox(`Xóa bài tập "${ex.title}"?`))) return false;
    await api.deleteRow("exercises", ex.id);
    return done("Đã xóa bài tập");
  }
  if (act === "q-unit") {
    const exs = T.exercises.filter((e) => e.unit_id === id), n = exs.reduce((a, e) => a + e.nq, 0);
    if (!n) return nothing(`Unit "${unit.name}" không còn câu hỏi nào.`);
    if (!(await confirmBox(`Xóa tất cả ${n} câu hỏi trong ${exs.length} bài tập của unit "${unit.name}"? Tiến độ học liên quan cũng bị xóa.`))) return false;
    await api.deleteIn("questions", "exercise_id", exs.map((e) => e.id));
    return done(`Đã xóa ${n} câu hỏi`);
  }
  if (act === "ex-unit") {
    const exs = T.exercises.filter((e) => e.unit_id === id);
    if (!exs.length) return nothing(`Unit "${unit.name}" không có bài tập nào.`);
    const msg = await guardExercisesOfUnit(unit, exs.map((e) => e.id));
    if (msg) return blocked(msg);
    if (!(await confirmBox(`Xóa tất cả ${exs.length} bài tập (đã hết câu hỏi) của unit "${unit.name}"?`))) return false;
    await api.deleteWhere("exercises", "unit_id", id);
    return done(`Đã xóa ${exs.length} bài tập`);
  }
  if (act === "w-unit") {
    const n = T.words[id]?.n_words || 0;
    if (!n) return nothing(`Unit "${unit.name}" chưa có từ vựng nào.`);
    if (!(await confirmBox(`Xóa tất cả ${n} từ vựng của unit "${unit.name}"? Tiến độ học từ vựng liên quan cũng bị xóa.`))) return false;
    await api.deleteWhere("words", "unit_id", id);
    return done(`Đã xóa ${n} từ vựng`);
  }
  if (act === "unit") {
    const msg = await guardUnit(unit);
    if (msg) return blocked(msg);
    if (!(await confirmBox(`Xóa unit "${unit.name}"?`))) return false;
    await api.deleteRow("units", id);
    return done("Đã xóa unit");
  }
  if (act === "u-field") {
    const us = T.units.filter((u) => u.field_id === id);
    if (!us.length) return nothing(`Ngành "${field.name}" chưa có unit nào.`);
    const msg = await guardUnitsOfField(field, us.map((u) => u.id));
    if (msg) return blocked(msg);
    if (!(await confirmBox(`Xóa tất cả ${us.length} unit (đã trống) của ngành "${field.name}"?`))) return false;
    await api.deleteWhere("units", "field_id", id);
    return done(`Đã xóa ${us.length} unit`);
  }
  if (act === "field") {
    const msg = await guardField(field);
    if (msg) return blocked(msg);
    if (!(await confirmBox(`Xóa ngành "${field.name}"?`))) return false;
    await api.deleteRow("fields", id);
    return done("Đã xóa ngành");
  }
  return false;
}

/** Xóa toàn bộ: lần lượt từ cấp nhỏ nhất lên lớn nhất */
function deleteAllDialog(tot, onDone) {
  const PHRASE = "XOA TAT CA";
  const dlg = openDialog({
    title: "Xóa toàn bộ dữ liệu",
    body: `<div class="alert err">Thao tác này <b>không thể hoàn tác</b>. Sẽ xóa ${tot.questions} câu hỏi, ${tot.exercises} bài tập, ${tot.words} từ vựng, ${tot.units} unit, ${tot.fields} ngành và toàn bộ <b>tiến độ học</b> của mọi học viên. Tài khoản người dùng được giữ lại. Nên <b>xuất file JSON</b> để sao lưu trước.</div>
      <label class="chk" style="margin-bottom:12px"><input type="checkbox" id="gl" checked> Xóa cả từ điển tra nhanh (${tot.glossary} mục)</label>
      <div class="fld"><label for="ph">Gõ <code>${PHRASE}</code> để xác nhận</label><input class="input" id="ph" autocomplete="off"></div>
      <pre class="progress-log" id="alog" hidden></pre>`,
    foot: `<button class="btn ghost" id="cx" type="button">Hủy</button><button class="btn danger" id="go" type="button" disabled>Xóa tất cả</button>`,
  });
  const go = $("#go", dlg), log = $("#alog", dlg);
  $("#cx", dlg).onclick = closeDialog;
  $("#ph", dlg).oninput = (e) => (go.disabled = e.target.value.trim().toUpperCase() !== PHRASE);
  go.onclick = async () => {
    go.disabled = true; $("#cx", dlg).disabled = true; $("#ph", dlg).disabled = true;
    log.hidden = false;
    const say = (t) => { log.textContent += t + "\n"; };
    const steps = [
      ["questions", "id", `${tot.questions} câu hỏi`], ["exercises", "id", `${tot.exercises} bài tập`], ["words", "id", `${tot.words} từ vựng`],
      ["units", "id", `${tot.units} unit`], ["fields", "id", `${tot.fields} ngành`],
    ];
    if ($("#gl", dlg).checked) steps.push(["glossary", "en_key", `${tot.glossary} mục từ điển`]);
    try {
      for (const [table, pk, label] of steps) { await api.deleteAllRows(table, pk); say("✔ Đã xóa " + label); }
      say("Hoàn tất."); toast("Đã xóa toàn bộ dữ liệu");
      setTimeout(() => { closeDialog(); onDone(); }, 900);
    } catch (e) {
      say("✘ Dừng lại: " + errMsg(e));
      $("#cx", dlg).disabled = false; $("#cx", dlg).textContent = "Đóng";
      onDone();
    }
  };
}

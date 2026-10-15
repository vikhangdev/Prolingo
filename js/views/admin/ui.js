/* Khung giao diện + bộ lọc dùng chung cho khu vực admin */
import { $, esc, errMsg, toast, openDialog, closeDialog } from "../../utils.js";
import * as api from "../../api.js";
import { app, setCrumbs, theme } from "../shared.js";

const NAV = [
  ["", "📊", "Tổng quan"], ["fields", "🗂️", "Ngành"], ["units", "📘", "Unit"],
  ["words", "🔤", "Từ vựng"], ["exercises", "📝", "Bài tập & bài đọc"], ["users", "👥", "Người dùng"],
  ["data", "💾", "Quản lý dữ liệu"],
];

export function shell(active, title, actions = "") {
  theme(); setCrumbs("Quản trị › " + title);
  app().innerHTML = `<div class="adm"><nav class="adm-nav" aria-label="Quản trị"><h4>TRANG QUẢN TRỊ</h4>${NAV.map(([k, ic, t]) => `<a href="#/admin${k ? "/" + k : ""}" ${k === active ? 'aria-current="page"' : ""}>${ic} ${t}</a>`).join("")}</nav>
    <div class="adm-main"><div class="adm-head"><h1 class="h2">${esc(title)}</h1><div class="row" style="margin:0">${actions}</div></div><div id="adm-filters"></div><div id="adm-body"></div></div></div>`;
  return $("#adm-body");
}

const SS = "nghe_admin_scope";
const loadScope = () => { try { return JSON.parse(sessionStorage.getItem(SS) || "{}"); } catch (e) { return {}; } };
const saveScope = (s) => { try { sessionStorage.setItem(SS, JSON.stringify(s)); } catch (e) { /* ignore */ } };

/** Bộ lọc Ngành (+ Unit). Gọi onChange({field, unit}) khi chọn. Trả về scope hiện tại. */
export async function scopeFilters(needUnit, onChange) {
  const fields = await api.listFields();
  const box = $("#adm-filters");
  if (!box) return null; // trang đã chuyển sang màn hình khác trong lúc đang tải
  if (!fields.length) {
    box.innerHTML = `<div class="empty-state"><div class="big">🗂️</div><h3>Chưa có ngành nào</h3><p>Hãy <a href="#/admin/fields">tạo ngành</a> hoặc <a href="#/admin/data">nạp dữ liệu mẫu</a> trước.</p></div>`;
    return null;
  }
  const sc = loadScope();
  let field = fields.find((f) => f.id === sc.fieldId) || fields[0];
  let units = needUnit ? await api.listUnits(field.id) : [];
  let unit = units.find((u) => u.id === sc.unitId) || units[0] || null;

  const draw = () => {
    box.innerHTML = `<div class="filters"><div class="fld"><label for="sf">Ngành</label><select class="select" id="sf">${fields.map((f) => `<option value="${f.id}" ${f.id === field.id ? "selected" : ""}>${esc(f.icon)} ${esc(f.name_vi || f.name)}</option>`).join("")}</select></div>
      ${needUnit ? `<div class="fld"><label for="su">Unit</label><select class="select" id="su">${units.length ? units.map((u, i) => `<option value="${u.id}" ${unit && u.id === unit.id ? "selected" : ""}>Unit ${i + 1} · ${esc(u.name)}</option>`).join("") : "<option value=''>(ngành chưa có unit)</option>"}</select></div>` : ""}</div>`;
    $("#sf").onchange = async (e) => {
      field = fields.find((f) => f.id === e.target.value);
      units = needUnit ? await api.listUnits(field.id) : [];
      unit = units[0] || null;
      saveScope({ fieldId: field.id, unitId: unit?.id });
      draw(); onChange({ field, unit, units });
    };
    if (needUnit) $("#su").onchange = (e) => {
      unit = units.find((u) => u.id === e.target.value) || null;
      saveScope({ fieldId: field.id, unitId: unit?.id });
      onChange({ field, unit, units });
    };
  };
  saveScope({ fieldId: field.id, unitId: unit?.id });
  draw();
  return { field, unit, units };
}

/** Chạy 1 thao tác ghi dữ liệu, báo lỗi/thành công bằng toast */
export async function act(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r ?? true; }
  catch (e) { toast(errMsg(e), "err"); return false; }
}

export const dialogForm = ({ title, body, submitText = "Lưu", wide = false, onMount, onSubmit }) => {
  const dlg = openDialog({
    title, wide,
    body: `<form id="dform" novalidate>${body}<div id="derr" role="alert"></div></form>`,
    foot: `<button class="btn ghost" type="button" id="dno">Hủy</button><button class="btn" type="button" id="dok">${esc(submitText)}</button>`,
    onMount,
  });
  $("#dno", dlg).onclick = closeDialog;
  const submit = async () => {
    const btn = $("#dok", dlg);
    btn.disabled = true;
    try { const r = await onSubmit(dlg); if (r !== false) closeDialog(); }
    catch (e) { $("#derr", dlg).innerHTML = `<div class="alert err">${esc(errMsg(e))}</div>`; }
    finally { btn.disabled = false; }
  };
  $("#dok", dlg).onclick = submit;
  $("#dform", dlg).addEventListener("submit", (e) => { e.preventDefault(); submit(); });
  return dlg;
};

export const moveItem = (rows, id, dir) => {
  const i = rows.findIndex((r) => r.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= rows.length) return null;
  const a = rows.slice();
  [a[i], a[j]] = [a[j], a[i]];
  return a;
};

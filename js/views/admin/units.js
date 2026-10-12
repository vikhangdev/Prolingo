import { $, $$, esc, confirmBox, notice } from "../../utils.js";
import * as api from "../../api.js";
import { shell, scopeFilters, act, dialogForm, moveItem } from "./ui.js";
import { guardUnit } from "./guard.js";

export async function viewAdminUnits() {
  const body = shell("units", "Quản lý Unit trong ngành", '<button class="btn" id="add">+ Thêm unit</button>');
  let scope = null, rows = [];
  const load = async () => {
    const [us, stats] = await Promise.all([api.listUnits(scope.field.id), api.unitStats()]);
    rows = us;
    const sm = Object.fromEntries(stats.map((s) => [s.unit_id, s]));
    body.innerHTML = rows.length ? `<div class="tbl-scroll"><table class="dtable"><thead><tr><th>STT</th><th></th><th>Tên unit</th><th>Từ</th><th>Câu hỏi</th><th>Hiển thị</th><th>Từ vựng / Câu hỏi / Chức năng</th></tr></thead><tbody>${rows.map((u, i) => {
      const s = sm[u.id] || {};
      return `<tr><td style="text-align:center">${i + 1}</td><td class="ico">${esc(u.icon)}</td><td><b>${esc(u.name)}</b><br><span class="small">${esc(u.name_vi)}</span></td>
      <td>${s.n_words || 0}</td><td>${(s.n_vocab || 0) + (s.n_lang || 0) + (s.n_read || 0)}</td>
      <td>${u.is_published ? '<span class="badge green">Hiển thị</span>' : '<span class="badge red">Đã ẩn</span>'}</td>
      <td class="acts"><button class="btn ghost sm" data-up="${u.id}" ${i === 0 ? "disabled" : ""}>↑</button><button class="btn ghost sm" data-dn="${u.id}" ${i === rows.length - 1 ? "disabled" : ""}>↓</button>
      <a class="btn ghost sm" href="#/admin/words" data-go="${u.id}">Từ vựng</a><a class="btn ghost sm" href="#/admin/exercises" data-go="${u.id}">Bài tập</a>
      <button class="btn ghost sm" data-ed="${u.id}">Sửa</button><button class="btn danger sm" data-del="${u.id}">Xóa</button></td></tr>`;
    }).join("")}</tbody></table></div>` : `<div class="empty-state"><div class="big">📘</div><h3>Ngành này chưa có unit</h3><p>Bấm "Thêm unit" để bắt đầu.</p></div>`;
    $$("[data-ed]", body).forEach((b) => (b.onclick = () => edit(rows.find((r) => r.id === b.dataset.ed))));
    $$("[data-del]", body).forEach((b) => (b.onclick = () => del(rows.find((r) => r.id === b.dataset.del))));
    $$("[data-up]", body).forEach((b) => (b.onclick = () => reorder(b.dataset.up, -1)));
    $$("[data-dn]", body).forEach((b) => (b.onclick = () => reorder(b.dataset.dn, 1)));
    $$("[data-go]", body).forEach((a) => a.addEventListener("click", () => {
      try { sessionStorage.setItem("nghe_admin_scope", JSON.stringify({ fieldId: scope.field.id, unitId: a.dataset.go })); } catch (e) { /* ignore */ }
    }));
  };
  const reorder = async (id, d) => {
    const a = moveItem(rows, id, d);
    if (!a) return;
    await act(() => api.saveOrder("units", a.map((r) => ({ id: r.id, sort_order: -1 }))));
    await load();
  };
  const del = async (u) => {
    const msg = await guardUnit(u);
    if (msg) return notice(msg);
    if (!(await confirmBox(`Xóa unit "${u.name}"?`))) return;
    if (await act(() => api.deleteRow("units", u.id), "Đã xóa unit")) load();
  };
  const edit = (u) => {
    const isNew = !u;
    u = u || { name: "", name_vi: "", icon: "📖", hue: null, is_published: true };
    const auto = u.hue == null;
    dialogForm({
      title: isNew ? "Thêm unit" : "Sửa unit",
      body: `<div class="grid2"><div class="fld"><label for="n">Tên tiếng Anh *</label><input class="input" id="n" value="${esc(u.name)}"></div>
        <div class="fld"><label for="nv">Tên tiếng Việt</label><input class="input" id="nv" value="${esc(u.name_vi)}"></div></div>
        <div class="fld"><label for="ic">Biểu tượng (emoji)</label><input class="input" id="ic" value="${esc(u.icon)}" maxlength="4" style="max-width:120px"></div>
        <div class="fld"><span class="lbl">Màu của unit</span><label class="chk"><input type="checkbox" id="au" ${auto ? "checked" : ""}> Tự động theo màu của ngành</label>
          <div class="hue-row"><input type="range" class="rainbow" id="hu" min="0" max="360" value="${u.hue ?? scope.field.hue}" ${auto ? "disabled" : ""}><span class="swatch" id="sw" style="background:hsl(${u.hue ?? scope.field.hue} 52% 40%)"></span></div></div>
        <label class="chk"><input type="checkbox" id="pb" ${u.is_published ? "checked" : ""}> Hiển thị cho học viên</label>`,
      onMount: (d) => {
        $("#au", d).onchange = (e) => ($("#hu", d).disabled = e.target.checked);
        $("#hu", d).oninput = (e) => ($("#sw", d).style.background = `hsl(${e.target.value} 52% 40%)`);
      },
      onSubmit: async (d) => {
        const name = $("#n", d).value.trim();
        if (!name) throw new Error("Vui lòng nhập tên unit.");
        const row = { name, name_vi: $("#nv", d).value.trim(), icon: $("#ic", d).value.trim() || "📖", hue: $("#au", d).checked ? null : +$("#hu", d).value, is_published: $("#pb", d).checked };
        if (isNew) await api.insertRow("units", { ...row, field_id: scope.field.id, sort_order: rows.length }); else await api.updateRow("units", u.id, row);
        await load();
      },
    });
  };
  scope = await scopeFilters(false, async (s) => { scope = s; await load(); });
  if (!scope) return;
  $("#add").onclick = () => edit(null);
  await load();
}

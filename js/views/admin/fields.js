import { $, $$, esc, confirmBox, notice, slugify } from "../../utils.js";
import * as api from "../../api.js";
import { shell, act, dialogForm, moveItem } from "./ui.js";
import { guardField } from "./guard.js";

export async function viewAdminFields() {
  const body = shell("fields", "Quản lý ngành nghề", '<button class="btn" id="add">+ Thêm ngành</button>');
  let rows = [];
  const load = async () => {
    const [fields, stats] = await Promise.all([api.listFields(), api.unitStats()]);
    rows = fields;
    const nu = {}; stats.forEach((s) => (nu[s.field_id] = (nu[s.field_id] || 0) + 1));
    body.innerHTML = rows.length ? `<div class="tbl-scroll"><table class="dtable"><thead><tr><th></th><th>Tên ngành</th><th>Slug</th><th>Màu</th><th>Unit</th><th>Hiển thị</th><th></th></tr></thead><tbody>${rows.map((f, i) => `<tr>
      <td class="ico">${esc(f.icon)}</td><td><b>${esc(f.name)}</b><br><span class="small">${esc(f.name_vi)}</span></td><td><code>${esc(f.slug)}</code></td>
      <td><span class="swatch" style="background:hsl(${f.hue} 52% 40%)"></span> ${f.hue}°</td><td>${nu[f.id] || 0}</td>
      <td>${f.is_published ? '<span class="badge green">Đang hiển thị</span>' : '<span class="badge red">Đã ẩn</span>'}</td>
      <td class="acts"><button class="btn ghost sm" data-up="${f.id}" ${i === 0 ? "disabled" : ""} aria-label="Lên">↑</button><button class="btn ghost sm" data-dn="${f.id}" ${i === rows.length - 1 ? "disabled" : ""} aria-label="Xuống">↓</button>
      <button class="btn ghost sm" data-ed="${f.id}">Sửa</button><button class="btn danger sm" data-del="${f.id}">Xóa</button></td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty-state"><div class="big">🗂️</div><h3>Chưa có ngành nào</h3><p>Bấm "Thêm ngành" để tạo ngành đầu tiên.</p></div>`;
    $$("[data-ed]", body).forEach((b) => (b.onclick = () => edit(rows.find((r) => r.id === b.dataset.ed))));
    $$("[data-del]", body).forEach((b) => (b.onclick = () => del(rows.find((r) => r.id === b.dataset.del))));
    $$("[data-up]", body).forEach((b) => (b.onclick = () => reorder(b.dataset.up, -1)));
    $$("[data-dn]", body).forEach((b) => (b.onclick = () => reorder(b.dataset.dn, 1)));
  };
  const reorder = async (id, d) => {
    const a = moveItem(rows, id, d);
    if (!a) return;
    // ghi lại toàn bộ sort_order theo vị trí mới
    await act(() => api.saveOrder("fields", a.map((r) => ({ id: r.id, sort_order: -1 }))));
    await load();
  };
  const del = async (f) => {
    const msg = await guardField(f);
    if (msg) return notice(msg);
    if (!(await confirmBox(`Xóa ngành "${f.name}"?`))) return;
    if (await act(() => api.deleteRow("fields", f.id), "Đã xóa ngành")) load();
  };
  const edit = (f) => {
    const isNew = !f;
    f = f || { name: "", name_vi: "", slug: "", icon: "📘", hue: 210, description: "", is_published: true };
    dialogForm({
      title: isNew ? "Thêm ngành" : "Sửa ngành",
      body: `<div class="grid2"><div class="fld"><label for="n">Tên tiếng Anh *</label><input class="input" id="n" value="${esc(f.name)}" placeholder="Medicine"></div>
        <div class="fld"><label for="nv">Tên tiếng Việt</label><input class="input" id="nv" value="${esc(f.name_vi)}" placeholder="Y khoa"></div></div>
        <div class="grid2"><div class="fld"><label for="sl">Slug (đường dẫn)</label><input class="input" id="sl" value="${esc(f.slug)}" placeholder="y-khoa"><span class="hint">Chữ thường, không dấu. Để trống sẽ tự tạo.</span></div>
        <div class="fld"><label for="ic">Biểu tượng (emoji)</label><input class="input" id="ic" value="${esc(f.icon)}" maxlength="4"></div></div>
        <div class="fld"><label for="hu">Màu chủ đạo</label><div class="hue-row"><input type="range" class="rainbow" id="hu" min="0" max="360" value="${f.hue}"><span class="swatch" id="sw" style="background:hsl(${f.hue} 52% 40%)"></span></div></div>
        <div class="fld"><label for="ds">Mô tả ngắn</label><textarea class="textarea" id="ds" rows="2">${esc(f.description)}</textarea></div>
        <label class="chk"><input type="checkbox" id="pb" ${f.is_published ? "checked" : ""}> Hiển thị cho học viên</label>`,
      onMount: (d) => { $("#hu", d).oninput = (e) => ($("#sw", d).style.background = `hsl(${e.target.value} 52% 40%)`); },
      onSubmit: async (d) => {
        const name = $("#n", d).value.trim();
        if (!name) throw new Error("Vui lòng nhập tên ngành.");
        const row = { name, name_vi: $("#nv", d).value.trim(), slug: slugify($("#sl", d).value || name) || "nganh", icon: $("#ic", d).value.trim() || "📘",
          hue: +$("#hu", d).value, description: $("#ds", d).value.trim(), is_published: $("#pb", d).checked };
        if (isNew) await api.insertRow("fields", { ...row, sort_order: rows.length }); else await api.updateRow("fields", f.id, row);
        await load();
      },
    });
  };
  $("#add").onclick = () => edit(null);
  await load();
}

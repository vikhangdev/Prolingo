import { $, $$, esc, confirmBox, debounce } from "../../utils.js";
import * as api from "../../api.js";
import { shell, scopeFilters, act, dialogForm } from "./ui.js";

export async function viewAdminWords() {
  const body = shell("words", "Kho từ vựng của unit", '<button class="btn ghost" id="bulk">+ Thêm nhiều từ</button><button class="btn" id="add">+ Thêm từ</button>');
  let scope = null, rows = [], q = "";
  const draw = () => {
    const list = rows.filter((w) => !q || w.en.toLowerCase().includes(q) || w.vi.toLowerCase().includes(q));
    body.innerHTML = `<div class="filters"><div class="fld"><label for="sq">Tìm trong unit</label><input class="input" id="sq" value="${esc(q)}" placeholder="Gõ từ tiếng Anh hoặc nghĩa…"></div><div class="small" style="padding-bottom:10px">${list.length}/${rows.length} từ</div></div>
      ${rows.length ? `<div class="tbl-scroll"><table class="dtable"><thead><tr><th>#</th><th>Tiếng Anh</th><th>Nghĩa tiếng Việt</th><th></th></tr></thead><tbody>${list.map((w) => `<tr><td>${rows.indexOf(w) + 1}</td><td><b>${esc(w.en)}</b></td><td>${esc(w.vi)}</td>
      <td class="acts"><button class="btn ghost sm" data-ed="${w.id}">Sửa</button><button class="btn danger sm" data-del="${w.id}">Xóa</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty-state"><div class="big">🔤</div><h3>Unit này chưa có từ vựng</h3><p>Dùng "Thêm nhiều từ" để dán danh sách nhanh.</p></div>`}`;
    $("#sq").oninput = debounce((e) => { q = e.target.value.trim().toLowerCase(); const pos = e.target.selectionStart; draw(); const el = $("#sq"); el.focus(); el.setSelectionRange(pos, pos); }, 200);
    $$("[data-ed]", body).forEach((b) => (b.onclick = () => edit(rows.find((r) => r.id === b.dataset.ed))));
    $$("[data-del]", body).forEach((b) => (b.onclick = async () => {
      const w = rows.find((r) => r.id === b.dataset.del);
      if (!(await confirmBox(`Xóa từ "${w.en}"?`))) return;
      if (await act(() => api.deleteRow("words", w.id), "Đã xóa từ")) load();
    }));
  };
  const load = async () => {
    if (!scope.unit) { body.innerHTML = `<div class="empty-state"><div class="big">📘</div><h3>Ngành này chưa có unit</h3><a class="btn" href="#/admin/units">Tạo unit</a></div>`; return; }
    rows = await api.adminListWords(scope.unit.id);
    draw();
  };
  const nextOrder = () => rows.reduce((m, r) => Math.max(m, r.sort_order), -1) + 1;
  const edit = (w) => {
    const isNew = !w;
    w = w || { en: "", vi: "" };
    dialogForm({
      title: isNew ? "Thêm từ vựng" : "Sửa từ vựng",
      body: `<div class="fld"><label for="en">Tiếng Anh *</label><input class="input" id="en" value="${esc(w.en)}" autocomplete="off"></div>
        <div class="fld"><label for="vi">Nghĩa tiếng Việt *</label><input class="input" id="vi" value="${esc(w.vi)}" autocomplete="off"></div>`,
      onSubmit: async (d) => {
        const en = $("#en", d).value.trim(), vi = $("#vi", d).value.trim();
        if (!en || !vi) throw new Error("Cần nhập cả tiếng Anh và nghĩa tiếng Việt.");
        if (isNew) await api.insertRow("words", { unit_id: scope.unit.id, en, vi, sort_order: nextOrder() }); else await api.updateRow("words", w.id, { en, vi });
        await load();
      },
    });
  };
  const bulk = () => dialogForm({
    title: "Thêm nhiều từ vựng", submitText: "Thêm tất cả", wide: true,
    body: `<div class="help">Mỗi dòng một từ, dạng <code>English | nghĩa tiếng Việt</code> (cũng nhận dấu <code>=</code> hoặc Tab, nên dán được từ Excel/Google Sheets).<pre>requirement | yêu cầu (phần mềm)\ncompiler = trình biên dịch</pre></div>
      <div class="fld"><textarea class="textarea" id="tx" rows="12" placeholder="word | nghĩa"></textarea></div><div class="small" id="cnt">0 từ hợp lệ</div>`,
    onMount: (d) => {
      $("#tx", d).oninput = () => ($("#cnt", d).textContent = parse($("#tx", d).value).length + " từ hợp lệ");
    },
    onSubmit: async (d) => {
      const list = parse($("#tx", d).value);
      if (!list.length) throw new Error("Chưa có dòng hợp lệ nào.");
      const start = nextOrder();
      await api.insertRows("words", list.map((w, i) => ({ unit_id: scope.unit.id, en: w.en, vi: w.vi, sort_order: start + i })));
      await load();
    },
  });
  const parse = (t) => t.split("\n").map((l) => {
    const m = l.match(/^(.*?)\s*(?:\||\t|=)\s*(.+)$/);
    return m && m[1].trim() && m[2].trim() ? { en: m[1].trim(), vi: m[2].trim() } : null;
  }).filter(Boolean);

  scope = await scopeFilters(true, async (s) => { scope = s; q = ""; await load(); });
  if (!scope) return;
  $("#add").onclick = () => (scope.unit ? edit(null) : null);
  $("#bulk").onclick = () => (scope.unit ? bulk() : null);
  await load();
}

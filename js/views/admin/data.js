import { $, esc, toast, errMsg } from "../../utils.js";
import * as api from "../../api.js";
import { shell } from "./ui.js";

export async function viewAdminData() {
  const body = shell("data", "Nhập / xuất dữ liệu");
  const fields = await api.listFields();
  body.innerHTML = `<div class="help">Dữ liệu một ngành (unit, từ vựng, bài tập, câu hỏi) được lưu dưới dạng một file JSON. Dùng để <b>sao lưu</b>, <b>chuyển ngành sang dự án khác</b> hoặc <b>nạp nhanh bộ dữ liệu mẫu</b>. Nhập vào luôn tạo ngành MỚI, không ghi đè ngành cũ.</div>
    <div class="grid2" style="gap:22px;align-items:start">
      <section class="panel"><h3>Nhập dữ liệu</h3>
        <p class="muted" style="margin-top:0">Bộ mẫu <b>Công nghệ thông tin</b> (8 unit, ~670 từ, ~380 câu hỏi) đi kèm trong thư mục <code>data/</code>.</p>
        <div class="row" style="margin-top:0"><button class="btn hi" id="seed">Nạp dữ liệu mẫu CNTT</button></div>
        <div class="fld" style="margin-top:18px"><label for="file">Hoặc chọn file JSON</label><input class="input" id="file" type="file" accept=".json,application/json"></div>
        <button class="btn" id="imp">Nhập file</button></section>
      <section class="panel"><h3>Xuất dữ liệu</h3>
        <div class="fld"><label for="xf">Chọn ngành</label><select class="select" id="xf">${fields.map((f) => `<option value="${f.id}">${esc(f.icon)} ${esc(f.name_vi || f.name)}</option>`).join("") || "<option value=''>(chưa có ngành)</option>"}</select></div>
        <button class="btn" id="exp" ${fields.length ? "" : "disabled"}>Tải file JSON</button></section></div>
    <pre class="progress-log" id="log" hidden></pre>`;
  const log = $("#log");
  const say = (t) => { log.hidden = false; log.textContent += t + "\n"; log.scrollTop = log.scrollHeight; };
  const run = async (data) => {
    log.textContent = "";
    try { await api.importField(data, say); toast("Nhập dữ liệu thành công"); say("→ Vào mục Ngành / Unit để xem kết quả."); }
    catch (e) { say("✘ Lỗi: " + errMsg(e)); toast(errMsg(e), "err"); }
  };
  $("#seed").onclick = async (ev) => {
    ev.target.disabled = true;
    try { const r = await fetch("data/it-field.json"); if (!r.ok) throw new Error("Không tìm thấy data/it-field.json"); await run(await r.json()); }
    catch (e) { say("✘ " + errMsg(e)); } finally { ev.target.disabled = false; }
  };
  $("#imp").onclick = async () => {
    const f = $("#file").files[0];
    if (!f) return toast("Hãy chọn file JSON trước", "err");
    try { await run(JSON.parse(await f.text())); } catch (e) { toast("File không phải JSON hợp lệ", "err"); }
  };
  $("#exp").onclick = async () => {
    try {
      const data = await api.exportField($("#xf").value);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
      a.download = `${data.field.slug}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { toast(errMsg(e), "err"); }
  };
}

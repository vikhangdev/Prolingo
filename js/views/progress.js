import { esc, fmtDate, fieldColor } from "../utils.js";
import * as api from "../api.js";
import { Progress } from "../progress.js";
import { app, loading, showError, setCrumbs, theme, pctOf, unitTotal } from "./shared.js";

const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

export async function viewProgress() {
  theme(); setCrumbs("Tiến độ học tập");
  loading();
  try {
    const [fields, units, stats] = await Promise.all([api.listFields(), api.listAllUnits(), api.unitStats()]);
    const sm = Object.fromEntries(stats.map((s) => [s.unit_id, s]));
    const t = Progress.totals(), days = Progress.byDay(14), max = Math.max(1, ...days.map((d) => d.n));
    const week = days.slice(-7).reduce((a, d) => a + d.n, 0);
    const bars = days.map((d) => `<div class="col" title="${fmtDate(d.date)}: ${d.n} câu"><div class="stick ${d.n ? "" : "zero"}" style="height:${Math.max(3, (d.n / max) * 100)}%">${d.n ? `<span>${d.n}</span>` : ""}</div><small>${WD[d.date.getDay()]}</small></div>`).join("");

    const groups = fields.map((f) => {
      const us = units.filter((u) => u.field_id === f.id);
      const rows = us.map((u, i) => {
        const s = sm[u.id] || { n_words: 0, n_vocab: 0, n_lang: 0, n_read: 0 };
        const tot = unitTotal(s), p = Progress.unitStat(u.id);
        const acc = p.done ? Math.round((p.ok / p.done) * 100) : null;
        return `<tr><td><a href="#/u/${u.id}">Unit ${i + 1} · ${esc(u.icon)} ${esc(u.name)}</a></td>
          <td style="width:34%"><div class="bar" style="--u:${fieldColor(f)}"><i style="width:${pctOf(p.done, tot)}%"></i></div></td>
          <td>${p.done}/${tot}</td><td>${acc == null ? "—" : `<span class="badge ${acc >= 80 ? "green" : acc >= 50 ? "gold" : "red"}">${acc}% đúng</span>`}</td></tr>`;
      }).join("");
      const ft = us.reduce((a, u) => a + unitTotal(sm[u.id] || { n_words: 0, n_vocab: 0, n_lang: 0, n_read: 0 }), 0);
      const fd = us.reduce((a, u) => a + Progress.unitStat(u.id).done, 0);
      return `<details class="fgroup" ${fd ? "open" : ""}><summary>${esc(f.icon)} ${esc(f.name_vi || f.name)} <span class="small">· ${pctOf(fd, ft)}% hoàn thành</span></summary>
        <div class="tbl-wrap"><table class="ptable"><thead><tr><th>Unit</th><th>Tiến độ</th><th>Đã làm</th><th>Độ chính xác</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="muted">Chưa có unit.</td></tr>'}</tbody></table></div></details>`;
    }).join("");

    // Các unit còn sai nhiều → gợi ý ôn lại
    const weak = units.map((u) => ({ u, p: Progress.unitStat(u.id) })).filter((x) => x.p.done >= 5 && x.p.ok / x.p.done < 0.7)
      .sort((a, b) => a.p.ok / a.p.done - b.p.ok / b.p.done).slice(0, 4);

    app().innerHTML = `<h1 class="h2">Tiến độ học tập</h1><p class="sub">Kết quả mới nhất của từng câu hỏi và từ vựng bạn đã làm.</p>
      <div class="kpis"><div class="kpi"><b>${t.done}</b><span>câu / từ đã làm</span></div><div class="kpi"><b>${t.ok}</b><span>trả lời đúng</span></div>
      <div class="kpi"><b>${t.done ? Math.round((t.ok / t.done) * 100) : 0}%</b><span>tỉ lệ đúng</span></div><div class="kpi"><b>${Progress.streakDays()} ngày</b><span>học liên tiếp</span></div></div>
      <section class="panel"><h3>14 ngày gần đây <span class="small">· 7 ngày qua: ${week} câu</span></h3><div class="week">${bars}</div></section>
      ${weak.length ? `<section class="panel"><h3>Nên ôn lại</h3><p class="muted" style="margin-top:0">Những unit bạn còn làm sai nhiều:</p><div class="chips">${weak.map((x) => `<a class="chip" style="--ch:0;text-decoration:none;color:inherit" href="#/u/${x.u.id}">${esc(x.u.icon)} ${esc(x.u.name)} · ${Math.round((x.p.ok / x.p.done) * 100)}%</a>`).join("")}</div></section>` : ""}
      <section class="panel"><h3>Theo ngành & unit</h3>${groups || '<p class="muted">Chưa có ngành nào.</p>'}</section>`;
  } catch (e) { showError(e); }
}

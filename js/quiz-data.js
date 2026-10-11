/* ============================================================
   QUIZ-DATA — biến dữ liệu thô từ Supabase thành bài tập cho engine
   Định dạng câu hỏi nội bộ (giống bản cũ):
     { k:'mc'|'ms'|'fl'|'card', q, opts, ans:[...], why, no, tip, fixed, tf, match, _id, _t }
   _t = 'q' (câu hỏi) | 'w' (từ vựng) → dùng để ghi tiến độ.
   ============================================================ */
import { shuffle } from "./utils.js";
import { rootTip } from "./roots.js";

const arr = (v) => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]);

/** Hàng `questions` (kind ≠ pair) → câu hỏi nội bộ */
export function normalizeQuestion(row) {
  const c = row.content || {};
  const base = { _id: row.id, _t: "q", q: c.q || "", why: c.why || "", tip: c.tip || "" };
  switch (row.kind) {
    case "tf": {
      const a = arr(c.ans)[0] === 1 ? 1 : 0; // 0 = True, 1 = False
      return {
        ...base, k: "mc", tf: 1, fixed: 1, opts: ["True", "False"], ans: [a],
        no: a === 0
          ? "Chọn **False** là sai vì phát biểu này KHỚP với nội dung bài / kiến thức."
          : "Chọn **True** là sai vì phát biểu này KHÔNG khớp với nội dung bài / kiến thức.",
      };
    }
    case "ms":
      return { ...base, k: "ms", opts: arr(c.opts), ans: arr(c.ans).map(Number), fixed: 1 };
    case "fl":
      return { ...base, k: "fl", ans: arr(c.ans).map((a) => arr(a)) };
    default: // mc
      return {
        ...base, k: "mc", opts: arr(c.opts), ans: arr(c.ans).map(Number),
        no: c.no || null, fixed: c.fixed ? 1 : 0,
      };
  }
}

/** Bài nối: các hàng `pair` → các "câu" nối A ↔ B */
function buildMatch(ex, rows) {
  const pairs = rows.map((r) => ({ id: r.id, a: r.content.a || "", b: r.content.b || "", extra: r.content.extra || "", tip: r.content.tip || "" }));
  let B = pairs.map((p) => p.b);
  const order = ex.config && Array.isArray(ex.config.b_order) ? ex.config.b_order : null;
  const fixed = !!order;
  if (order) {
    // giữ thứ tự cột B của sách; thêm những đáp án mới (nếu admin vừa bổ sung) vào cuối
    B = order.filter((b) => pairs.some((p) => p.b === b)).concat(B.filter((b) => !order.includes(b)));
  }
  const owner = {};
  pairs.forEach((p) => { owner[p.b] = p.a; });
  return pairs.map((p) => {
    const ai = B.indexOf(p.b);
    return {
      _id: p.id, _t: "q", k: "mc", match: 1, fixed, q: p.a, opts: B, ans: [ai],
      why: `**${p.a}** ↔ **${p.b}**.` + (p.extra ? " " + p.extra : ""),
      no: B.map((b, bi) =>
        bi === ai ? null : owner[b] ? `"${b}" là nghĩa/đáp án của **${owner[b]}**, không phải của "${p.a}".` : `"${b}" không khớp với "${p.a}".`
      ),
      tip: p.tip || null,
    };
  });
}

/* ---------- Word Bank sinh tự động từ danh sách từ ---------- */
function buildBank(unitId, W) {
  const mk = (extra) => ({ _t: "w", ...extra });
  const pick = (k) => shuffle(W).slice(0, Math.min(k, W.length));
  const choices = (w, f) => {
    const seen = new Set([w[f]]), ds = [];
    for (const x of shuffle(W)) {
      if (seen.has(x[f])) continue;
      seen.add(x[f]); ds.push(x);
      if (ds.length === 3) break;
    }
    return shuffle([w, ...ds]);
  };
  const mcFrom = (w, field, qText, why, noFn) => {
    const all = choices(w, field), idx = all.indexOf(w);
    return mk({
      _id: w.id, k: "mc", q: qText, opts: all.map((x) => x[field]), ans: [idx], why,
      no: all.map((x, i) => (i === idx ? null : noFn(x))), tip: rootTip(w.en), fixed: 1,
    });
  };
  const genEV = () => pick(15).map((w) => mcFrom(w, "vi", w.en, `**${w.en}** = ${w.vi}.`, (x) => `"${x.vi}" là nghĩa của **${x.en}**, không phải của "${w.en}".`));
  const genVE = () => pick(15).map((w) => mcFrom(w, "en", w.vi, `**${w.vi}** = **${w.en}**.`, (x) => `"${x.en}" nghĩa là "${x.vi}", không phải "${w.vi}".`));
  const typeable = W.filter((w) => /^[A-Za-z][A-Za-z\-' ]{3,26}$/.test(w.en) && !/-$|^-/.test(w.en));
  const genType = () =>
    shuffle(typeable).slice(0, 10).map((w) =>
      mk({ _id: w.id, k: "fl", q: `${w.vi} → ___`, ans: [[w.en]], why: `Từ cần gõ là **${w.en}** (= ${w.vi}).`, tip: rootTip(w.en) })
    );
  const cards = W.map((w) => mk({ _id: w.id, k: "card", q: w.en, en: w.en, vi: w.vi, why: `**${w.en}** = ${w.vi}.`, tip: rootTip(w.en) }));

  return [
    { id: "bank:list", t: "Danh sách từ vựng", ins: 'Bấm vào từ để nghe phát âm. Bật "Che nghĩa" để tự kiểm tra.', isList: 1, noscore: 1, words: W, items: [] },
    { id: "bank:cards", t: "Thẻ ghi nhớ (Flashcards)", ins: "Bấm vào thẻ để lật. Tự chấm: đã thuộc hay chưa thuộc.", isCards: 1, items: cards },
    { id: "bank:ev", t: "Trắc nghiệm: Anh → Việt", ins: "Chọn nghĩa tiếng Việt đúng của từ (15 từ ngẫu nhiên).", gen: genEV, items: genEV() },
    { id: "bank:ve", t: "Trắc nghiệm: Việt → Anh", ins: "Chọn từ tiếng Anh đúng với nghĩa tiếng Việt (15 từ ngẫu nhiên).", gen: genVE, items: genVE() },
    { id: "bank:ty", t: "Gõ từ tiếng Anh", ins: "Nhìn nghĩa tiếng Việt, gõ từ tiếng Anh (10 từ ngẫu nhiên).", gen: genType, items: genType() },
  ];
}

/** Dựng toàn bộ 4 phần của một unit */
export function buildSections(unitId, { words, exercises }) {
  const sec = { bank: words.length ? buildBank(unitId, words) : [], vocab: [], lang: [], read: [] };
  exercises.forEach((e) => {
    const rows = (e.questions || []).slice();
    if (!rows.length) return; // bài chưa có câu hỏi → ẩn với người học
    const ex = {
      id: e.id, t: e.title, ins: e.instruction, insvi: e.instruction_vi, ctx: e.passage || "",
      isMatch: e.kind === "match" ? 1 : 0, items: [],
    };
    ex.items = e.kind === "match"
      ? buildMatch(e, rows.filter((r) => r.kind === "pair"))
      : rows.filter((r) => r.kind !== "pair").map(normalizeQuestion);
    if (ex.items.length) sec[e.section].push(ex);
  });
  return sec;
}

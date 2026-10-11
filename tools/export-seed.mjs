// Chuyển dữ liệu 8 Unit IT từ script.js cũ  ->  data/it-field.json
// Dùng:  node tools/export-seed.mjs  duong-dan/script.js-cu  data/it-field.json
import fs from 'node:fs';
import vm from 'node:vm';

const [, , inFile = 'script.old.js', outFile = 'data/it-field.json'] = process.argv;
const src = fs.readFileSync(inFile, 'utf8');
const cut = src.indexOf('/* ================= ENGINE ================= */');
const ctx = {};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(src.slice(0, cut), ctx);
const U = ctx.U;

const HUES = [172, 262, 350, 28, 200, 320, 190, 45];
const strip = (s) => (s == null ? '' : s);

function pairFromItem(it) {
  const a = it.q;
  const b = it.opts[it.ans[0]];
  const extra = (it.why || '').replace(`**${a}** ↔ **${b}**.`, '').trim();
  return { a, b, extra, tip: it.tip || '' };
}

function convertQuestion(q) {
  if (q.match) return { kind: 'pair', content: pairFromItem(q) };
  if (q.tf) return { kind: 'tf', content: { q: q.q, ans: q.ans, why: strip(q.why), tip: strip(q.tip) } };
  if (q.k === 'fl') return { kind: 'fl', content: { q: q.q, ans: q.ans, why: strip(q.why), tip: strip(q.tip) } };
  if (q.k === 'ms') return { kind: 'ms', content: { q: q.q, opts: q.opts, ans: q.ans, why: strip(q.why), tip: strip(q.tip) } };
  const c = { q: q.q, opts: q.opts, ans: q.ans, why: strip(q.why), tip: strip(q.tip) };
  // Lỗi dữ liệu cũ: mẹo nhớ bị truyền vào tham số `no` (vd. "de + bug = gỡ lỗi.") -> chuyển về `tip`
  if (!c.tip && typeof q.no === 'string') c.tip = q.no;
  else if (q.no) c.no = Array.isArray(q.no) ? q.no.filter(Boolean).join(' ') : q.no;
  return { kind: 'mc', content: c };
}

const units = Object.keys(U).map((n, idx) => {
  const u = U[n];
  const exercises = [];
  for (const section of ['vocab', 'lang', 'read']) {
    u.sec[section].forEach((e) => {
      const ex = {
        section,
        kind: e.isMatch ? 'match' : 'quiz',
        title: e.t,
        instruction: strip(e.ins),
        instruction_vi: strip(e.insvi),
        passage: strip(e.ctx),
        config: {},
        questions: e.items.map(convertQuestion),
      };
      if (e.isMatch && e.items[0].fixed) ex.config.b_order = e.items[0].opts; // giữ thứ tự cột B như sách
      exercises.push(ex);
    });
  }
  return {
    name: u.name,
    name_vi: u.vi,
    icon: u.icon,
    hue: HUES[idx] ?? null,
    words: (ctx.WORDS[n] || []).map((w) => ({ en: w.en, vi: w.vi })),
    exercises,
  };
});

const have = new Set();
units.forEach((u) => u.words.forEach((w) => have.add(w.en.toLowerCase().trim())));
const glossary = [];
ctx.GLOSS.split('\n').forEach((l) => {
  const i = l.indexOf('=');
  if (i < 1) return;
  const en = l.slice(0, i).trim().toLowerCase();
  const vi = l.slice(i + 1).trim();
  if (en && vi && !have.has(en)) glossary.push([en, vi]);
});

const out = {
  version: 1,
  field: {
    slug: 'it',
    name: 'Information Technology',
    name_vi: 'Công nghệ thông tin',
    icon: '💻',
    hue: 200,
    description: 'Từ vựng, ngữ pháp và bài đọc cho ngành CNTT: phần mềm, web, đám mây, game, AI, blockchain, an ninh mạng, DevOps.',
  },
  units,
  glossary,
};
fs.writeFileSync(outFile, JSON.stringify(out));
const nq = units.reduce((a, u) => a + u.exercises.reduce((b, e) => b + e.questions.length, 0), 0);
const nw = units.reduce((a, u) => a + u.words.length, 0);
console.log(`OK: ${units.length} unit, ${nw} từ, ${nq} câu hỏi, ${glossary.length} mục từ điển -> ${outFile}`);

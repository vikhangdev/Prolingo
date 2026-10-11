/* ============================================================
   API — toàn bộ lời gọi Supabase nằm ở đây
   ============================================================ */
import { sb } from "./supabase.js";

const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data;
};

/** Lấy hết bản ghi (Supabase giới hạn 1000 dòng/lần) */
export async function fetchAll(makeQuery, size = 1000) {
  const out = [];
  for (let from = 0; ; from += size) {
    const rows = unwrap(await makeQuery().range(from, from + size - 1));
    out.push(...rows);
    if (rows.length < size) break;
  }
  return out;
}

/* ---------- Nội dung (người học đọc) ---------- */
export const listFields = async () =>
  unwrap(await sb.from("fields").select("*").order("sort_order").order("name"));

export const getFieldBySlug = async (slug) =>
  unwrap(await sb.from("fields").select("*").eq("slug", slug).maybeSingle());

export const listUnits = async (fieldId) =>
  unwrap(await sb.from("units").select("*").eq("field_id", fieldId).order("sort_order").order("created_at"));

export const listAllUnits = async () =>
  unwrap(await sb.from("units").select("id, field_id, name, name_vi, icon, hue, sort_order").order("sort_order").order("created_at"));

export const getUnit = async (id) =>
  unwrap(await sb.from("units").select("*, field:fields(*)").eq("id", id).maybeSingle());

export const unitStats = async () => unwrap(await sb.from("unit_stats").select("*"));

export async function getUnitContent(unitId) {
  const [words, exercises] = await Promise.all([
    fetchAll(() => sb.from("words").select("*").eq("unit_id", unitId).order("sort_order").order("en")),
    fetchAll(() =>
      sb
        .from("exercises")
        .select("*, questions(*)")
        .eq("unit_id", unitId)
        .order("sort_order")
        .order("created_at")
        .order("sort_order", { referencedTable: "questions" })
        .order("created_at", { referencedTable: "questions" })
    ),
  ]);
  return { words, exercises };
}

/* ---------- Từ điển ---------- */
export const loadGlossary = async () => fetchAll(() => sb.from("glossary").select("en_key, vi").order("en_key"));

export async function lookupWords(keys) {
  if (!keys.length) return [];
  const [w, g] = await Promise.all([
    sb.from("words").select("en_key, vi").in("en_key", keys).limit(5),
    sb.from("glossary").select("en_key, vi").in("en_key", keys).limit(5),
  ]);
  return [...(g.data || []), ...(w.data || [])];
}

/* ---------- Tiến độ của người dùng ---------- */
export const loadProgress = async (userId) =>
  fetchAll(() =>
    sb.from("progress").select("unit_id, section, question_id, word_id, ok, updated_at").eq("user_id", userId).order("id")
  );

export const loadScores = async (userId) => unwrap(await sb.from("scores").select("*").eq("user_id", userId));

export async function saveProgress(rows) {
  const q = rows.filter((r) => r.question_id);
  const w = rows.filter((r) => r.word_id);
  if (q.length) unwrap(await sb.from("progress").upsert(q, { onConflict: "user_id,question_id" }));
  if (w.length) unwrap(await sb.from("progress").upsert(w, { onConflict: "user_id,word_id" }));
}

export const saveScore = async (row) => unwrap(await sb.from("scores").upsert(row, { onConflict: "user_id,ex_key" }));

/* ---------- CRUD tổng quát (admin) ---------- */
export const insertRow = async (table, row) => unwrap(await sb.from(table).insert(row).select().single());
export const insertRows = async (table, rows, chunk = 400) => {
  for (let i = 0; i < rows.length; i += chunk) unwrap(await sb.from(table).insert(rows.slice(i, i + chunk)));
};
export const updateRow = async (table, id, patch) =>
  unwrap(await sb.from(table).update(patch).eq("id", id).select().single());
export const deleteRow = async (table, id) => unwrap(await sb.from(table).delete().eq("id", id));
export const deleteWhere = async (table, col, val) => unwrap(await sb.from(table).delete().eq(col, val));

/** Đổi chỗ thứ tự: nhận mảng hàng đã sắp xếp mới → ghi lại sort_order = vị trí */
export async function saveOrder(table, rows) {
  await Promise.all(
    rows.map((r, i) => (r.sort_order === i ? null : sb.from(table).update({ sort_order: i }).eq("id", r.id).then(unwrap)))
  );
}

export const adminListUnits = async (fieldId) => listUnits(fieldId);

export const adminListWords = async (unitId) =>
  fetchAll(() => sb.from("words").select("*").eq("unit_id", unitId).order("sort_order").order("en"));

export const adminListExercises = async (unitId) =>
  unwrap(
    await sb
      .from("exercises")
      .select("*, questions(count)")
      .eq("unit_id", unitId)
      .order("section")
      .order("sort_order")
      .order("created_at")
  );

export const adminListQuestions = async (exerciseId) =>
  unwrap(await sb.from("questions").select("*").eq("exercise_id", exerciseId).order("sort_order").order("created_at"));

/* ---------- Người dùng ---------- */
export const adminUsers = async () => unwrap(await sb.rpc("admin_users"));
export const setUserRole = async (id, role) => unwrap(await sb.from("profiles").update({ role }).eq("id", id).select().single());
export const adminCounts = async () => {
  const c = async (t) => (await sb.from(t).select("*", { count: "exact", head: true })).count || 0;
  const [fields, units, words, questions, users] = await Promise.all(
    ["fields", "units", "words", "questions", "profiles"].map(c)
  );
  return { fields, units, words, questions, users };
};

/* ---------- Xuất / nhập cả một ngành (JSON) ---------- */
export async function exportField(fieldId) {
  const field = unwrap(await sb.from("fields").select("*").eq("id", fieldId).single());
  const units = await listUnits(fieldId);
  const out = {
    version: 1,
    field: pick(field, ["slug", "name", "name_vi", "icon", "hue", "description"]),
    units: [],
    glossary: [],
  };
  for (const u of units) {
    const { words, exercises } = await getUnitContent(u.id);
    out.units.push({
      ...pick(u, ["name", "name_vi", "icon", "hue"]),
      words: words.map((w) => ({ en: w.en, vi: w.vi })),
      exercises: exercises.map((e) => ({
        ...pick(e, ["section", "kind", "title", "instruction", "instruction_vi", "passage", "config"]),
        questions: e.questions.map((q) => ({ kind: q.kind, content: q.content })),
      })),
    });
  }
  return out;
}

const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));

export async function importField(data, log = () => {}) {
  if (!data || !data.field || !Array.isArray(data.units)) throw new Error("File JSON không đúng định dạng (thiếu field/units).");
  const uuid = () => crypto.randomUUID();

  // slug trùng → tự thêm hậu tố
  let slug = data.field.slug || "nganh";
  const taken = new Set(unwrap(await sb.from("fields").select("slug")).map((r) => r.slug));
  for (let i = 2; taken.has(slug); i++) slug = `${data.field.slug}-${i}`;
  const maxOrder = unwrap(await sb.from("fields").select("sort_order").order("sort_order", { ascending: false }).limit(1));
  const fieldId = uuid();
  unwrap(
    await sb.from("fields").insert({
      id: fieldId,
      slug,
      name: data.field.name,
      name_vi: data.field.name_vi || "",
      icon: data.field.icon || "📘",
      hue: data.field.hue ?? 210,
      description: data.field.description || "",
      sort_order: (maxOrder[0]?.sort_order ?? -1) + 1,
      is_published: true,
    })
  );
  log(`✔ Ngành "${data.field.name}" (slug: ${slug})`);

  let nq = 0, nw = 0;
  for (let ui = 0; ui < data.units.length; ui++) {
    const u = data.units[ui];
    const unitId = uuid();
    unwrap(
      await sb.from("units").insert({
        id: unitId, field_id: fieldId, name: u.name, name_vi: u.name_vi || "", icon: u.icon || "📖",
        hue: u.hue ?? null, sort_order: ui, is_published: true,
      })
    );
    await insertRows("words", (u.words || []).map((w, i) => ({ unit_id: unitId, en: w.en, vi: w.vi, sort_order: i })));
    nw += (u.words || []).length;

    const exRows = [], qRows = [];
    (u.exercises || []).forEach((e, ei) => {
      const id = uuid();
      exRows.push({
        id, unit_id: unitId, section: e.section, kind: e.kind || "quiz", title: e.title,
        instruction: e.instruction || "", instruction_vi: e.instruction_vi || "", passage: e.passage || "",
        config: e.config || {}, sort_order: ei,
      });
      (e.questions || []).forEach((q, qi) => qRows.push({ exercise_id: id, kind: q.kind, content: q.content, sort_order: qi }));
    });
    await insertRows("exercises", exRows);
    await insertRows("questions", qRows);
    nq += qRows.length;
    log(`✔ Unit ${ui + 1}: ${u.name} — ${(u.words || []).length} từ, ${qRows.length} câu`);
  }

  if (Array.isArray(data.glossary) && data.glossary.length) {
    const rows = data.glossary.map(([en, vi]) => ({ en_key: String(en).toLowerCase().trim(), vi }));
    for (let i = 0; i < rows.length; i += 400)
      unwrap(await sb.from("glossary").upsert(rows.slice(i, i + 400), { onConflict: "en_key" }));
    log(`✔ Từ điển tra nhanh: ${rows.length} mục`);
  }
  log(`Hoàn tất: ${data.units.length} unit · ${nw} từ · ${nq} câu hỏi.`);
  return { fieldId, slug };
}

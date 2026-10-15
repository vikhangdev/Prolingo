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
export const insertWordsIgnoringDuplicates = async (rows) =>
  rows.length
    ? unwrap(await sb.from("words").upsert(rows, {
        onConflict: "unit_id,en_key",
        ignoreDuplicates: true,
      }).select("en_key"))
    : [];
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

/* ---------- Đếm & xóa theo cấp (trang Quản lý dữ liệu) ---------- */
export async function countRows(table, col, val) {
  const { count, error } = await sb.from(table).select("*", { count: "exact", head: true }).eq(col, val);
  if (error) throw error;
  return count || 0;
}
export async function countIn(table, col, vals) {
  if (!vals.length) return 0;
  const { count, error } = await sb.from(table).select("*", { count: "exact", head: true }).in(col, vals);
  if (error) throw error;
  return count || 0;
}
export const deleteIn = async (table, col, vals) => (vals.length ? unwrap(await sb.from(table).delete().in(col, vals)) : null);
/** Xóa mọi dòng của bảng (PostgREST bắt buộc có bộ lọc nên dùng "khác null") */
export const deleteAllRows = async (table, pk = "id") => unwrap(await sb.from(table).delete().not(pk, "is", null));

/** Toàn bộ cây ngành → unit → bài tập kèm số lượng, dùng cho màn hình xóa */
export async function adminTree() {
  const [fields, units, exercises, stats, gl] = await Promise.all([
    listFields(),
    fetchAll(() => sb.from("units").select("*").order("sort_order").order("created_at")),
    fetchAll(() => sb.from("exercises").select("id, unit_id, section, kind, title, sort_order, questions(count)").order("sort_order").order("created_at")),
    unitStats(),
    sb.from("glossary").select("*", { count: "exact", head: true }),
  ]);
  const sm = Object.fromEntries(stats.map((s) => [s.unit_id, s]));
  exercises.forEach((e) => { e.nq = e.questions?.[0]?.count || 0; });
  return { fields, units, exercises, words: sm, glossary: gl.count || 0 };
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

/* ---------- Nhật ký học tập (lượt làm + từng câu trả lời) ---------- */
export const saveRuns = async (rows) => unwrap(await sb.from("study_runs").upsert(rows, { onConflict: "id" }));
export const saveAnswers = async (rows) => unwrap(await sb.from("answer_log").insert(rows));

/* ---------- Lời nhắc ---------- */
export const myReminders = async () =>
  unwrap(await sb.from("reminders").select("*").is("read_at", null).order("created_at", { ascending: false }));
export const markReminderRead = async (id) =>
  unwrap(await sb.from("reminders").update({ read_at: new Date().toISOString() }).eq("id", id));
export const sendReminder = async (userId, senderId, message) =>
  unwrap(await sb.from("reminders").insert({ user_id: userId, sender_id: senderId, message }));
export const studentReminders = async (userId) =>
  unwrap(await sb.from("reminders").select("*").eq("user_id", userId).order("created_at", { ascending: false }));

/* ---------- Ảnh đại diện ---------- */
export async function uploadAvatar(userId, file) {
  if (!file || !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
    throw new Error("Chọn ảnh JPG, PNG, WebP hoặc GIF.");
  }
  if (file.size > 5 * 1024 * 1024) throw new Error("Ảnh đại diện không được lớn hơn 5 MB.");
  const { error } = await sb.storage.from("avatars").upload(`${userId}/avatar`, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: true,
  });
  if (error) throw error;
  return `${sb.storage.from("avatars").getPublicUrl(`${userId}/avatar`).data.publicUrl}?v=${Date.now()}`;
}

export const updateUserProfile = async (id, updates) =>
  unwrap(await sb.from("profiles").update(updates).eq("id", id).select().single());

/* ---------- Báo cáo từng học viên (admin) ---------- */
const chunk = (a, n = 80) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
async function byIds(table, col, ids, select, extra = (q) => q) {
  const out = [];
  for (const part of chunk(ids)) out.push(...unwrap(await extra(sb.from(table).select(select).in(col, part))));
  return out;
}

export async function studentReport(userId) {
  const [profileRes, runs, progress, exercises, qlinks, units, fields, stats] = await Promise.all([
    sb.from("profiles").select("*").eq("id", userId).maybeSingle(),
    fetchAll(() => sb.from("study_runs").select("*").eq("user_id", userId).order("started_at", { ascending: false }).order("id")),
    fetchAll(() => sb.from("progress").select("unit_id, section, question_id, word_id, ok, updated_at").eq("user_id", userId).order("id")),
    fetchAll(() => sb.from("exercises").select("id, unit_id, section, title, sort_order").order("sort_order").order("id")),
    fetchAll(() => sb.from("questions").select("id, exercise_id").order("id")),
    listAllUnits(), listFields(), unitStats(),
  ]);
  return { profile: unwrap(profileRes), runs, progress, exercises, qlinks, units, fields, stats };
}

export async function runAnswers(runId) {
  const answers = unwrap(await sb.from("answer_log").select("*").eq("run_id", runId).order("id"));
  const questionIds = [...new Set(answers.map((answer) => answer.question_id).filter(Boolean))];
  const questions = questionIds.length
    ? await byIds("questions", "id", questionIds, "id, content")
    : [];
  const questionById = Object.fromEntries(questions.map((question) => [question.id, question]));
  return answers.map((answer) => {
    const content = questionById[answer.question_id]?.content || {};
    return { ...answer, why: content.why || "", tip: content.tip || "" };
  });
}

/** Chi tiết các câu đang sai: lần sai gần nhất + nội dung câu hỏi (để xem lời giải) */
export async function studentWrongDetail(userId, qIds, wIds) {
  const cols = "question_id, word_id, q_text, given_text, correct_text, created_at";
  const logQ = (q) => q.eq("user_id", userId).eq("ok", false).order("created_at", { ascending: false });
  const [lq, lw, questions, words] = await Promise.all([
    byIds("answer_log", "question_id", qIds, cols, logQ),
    byIds("answer_log", "word_id", wIds, cols, logQ),
    byIds("questions", "id", qIds, "id, kind, exercise_id, content"),
    byIds("words", "id", wIds, "id, en, vi, unit_id"),
  ]);
  return { logs: [...lq, ...lw], questions, words };
}

/* ---------- Người dùng ---------- */
export const adminUsers = async () => unwrap(await sb.rpc("admin_users"));
export const touchOnlinePresence = async () =>
  unwrap(await sb.rpc("touch_online_presence"));
export const clearOnlinePresence = async (userId) =>
  unwrap(await sb.from("online_presence").delete().eq("user_id", userId));
export const adminOnlineUserCount = async () => unwrap(await sb.rpc("admin_online_user_count"));
export const adminSignupEmailAlerts = async () =>
  unwrap(await sb.from("signup_email_alerts").select("*").order("last_seen_at", { ascending: false }));
export const reviewSignupEmailAlert = async (id) =>
  unwrap(await sb.rpc("admin_review_signup_email_alert", { target_id: id }));
export const adminUser = async (id) =>
  unwrap(await sb.from("profiles").select("id, email, display_name, role, created_at, is_active, primary_field_id, avatar_url").eq("id", id).maybeSingle());
export const setUserRole = async (id, role) => unwrap(await sb.from("profiles").update({ role }).eq("id", id).select().single());
export const updateUserName = async (id, display_name) =>
  unwrap(await sb.from("profiles").update({ display_name }).eq("id", id).select().single());
export const setUserPrimaryField = async (id, primary_field_id) =>
  unwrap(await sb.from("profiles").update({ primary_field_id }).eq("id", id).select().single());
export const setUserActive = async (id, is_active) =>
  unwrap(await sb.from("profiles").update({ is_active }).eq("id", id).select().single());
export const deleteUser = async (id) => unwrap(await sb.rpc("admin_delete_user", { target_id: id }));
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
    field: pick(field, ["slug", "name", "name_vi", "icon", "hue", "color_hex", "description"]),
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

/** Đặt ngành vào vị trí mong muốn rồi đánh số lại thứ tự: "start" | "end" | "after:<id ngành>" */
export async function placeField(fieldId, position) {
  if (!position || position === "end") return;
  const all = await listFields();
  const me = all.find((f) => f.id === fieldId), rest = all.filter((f) => f.id !== fieldId);
  if (!me) return;
  let idx = rest.length;
  if (position === "start") idx = 0;
  else if (position.startsWith("after:")) { const i = rest.findIndex((f) => f.id === position.slice(6)); idx = i >= 0 ? i + 1 : rest.length; }
  rest.splice(idx, 0, me);
  await saveOrder("fields", rest.map((r) => ({ id: r.id, sort_order: -1 })));
}

/** Kiểm tra cấu trúc file JSON TRƯỚC khi nhập. Trả về mảng thông báo lỗi (rỗng = hợp lệ). */
export function validateImportData(d) {
  const err = [];
  const add = (m) => { if (err.length < 12) err.push(m); };
  if (!d || typeof d !== "object" || Array.isArray(d)) return ["Nội dung không phải là một đối tượng JSON (cần có field và units)."];
  if (!d.field || typeof d.field !== "object") add('Thiếu khối "field" (thông tin ngành).');
  else if (!String(d.field.name || "").trim()) add('Thiếu "field.name" (tên ngành).');
  if (!Array.isArray(d.units)) { add('Thiếu mảng "units".'); return err; }
  if (!d.units.length) add('Mảng "units" đang trống.');
  d.units.forEach((u, ui) => {
    const U = `Unit ${ui + 1}`;
    if (!u || !String(u.name || "").trim()) { add(`${U}: thiếu "name".`); if (!u) return; }
    (u.words || []).forEach((w, wi) => { if (!w || !String(w.en || "").trim() || !String(w.vi || "").trim()) add(`${U}, từ #${wi + 1}: thiếu "en" hoặc "vi".`); });
    (u.exercises || []).forEach((e, ei) => {
      const E = `${U}, bài ${ei + 1}`;
      if (!e) return add(`${E}: dữ liệu rỗng.`);
      if (!["vocab", "lang", "read"].includes(e.section)) add(`${E}: "section" phải là vocab, lang hoặc read.`);
      if (!["quiz", "match"].includes(e.kind || "quiz")) add(`${E}: "kind" phải là quiz hoặc match.`);
      if (!String(e.title || "").trim()) add(`${E}: thiếu "title".`);
      const kinds = e.kind === "match" ? ["pair"] : ["mc", "tf", "ms", "fl"];
      (e.questions || []).forEach((q, qi) => {
        const Q = `${E}, câu ${qi + 1}`, c = q && q.content;
        if (!q || !kinds.includes(q.kind)) return add(`${Q}: "kind" phải là ${kinds.join(", ")}.`);
        if (!c || typeof c !== "object") return add(`${Q}: thiếu "content".`);
        if (q.kind === "pair") { if (!String(c.a || "").trim() || !String(c.b || "").trim()) add(`${Q}: thiếu "a" hoặc "b".`); return; }
        if (!String(c.q || "").trim()) add(`${Q}: thiếu "q" (nội dung câu hỏi).`);
        if (q.kind === "mc" || q.kind === "ms") {
          if (!Array.isArray(c.opts) || c.opts.length < 2) add(`${Q}: cần ít nhất 2 lựa chọn trong "opts".`);
          else if (!Array.isArray(c.ans) || !c.ans.length || c.ans.some((a) => !Number.isInteger(a) || a < 0 || a >= c.opts.length)) add(`${Q}: "ans" phải là số thứ tự (bắt đầu từ 0) nằm trong "opts".`);
        }
        if (q.kind === "tf" && !(Array.isArray(c.ans) && (c.ans[0] === 0 || c.ans[0] === 1))) add(`${Q}: "ans" của True/False phải là [0] hoặc [1].`);
        if (q.kind === "fl") {
          const blanks = String(c.q || "").split("___").length - 1;
          if (!blanks) add(`${Q}: câu điền từ cần có chỗ trống "___".`);
          else if (!Array.isArray(c.ans) || c.ans.length !== blanks) add(`${Q}: có ${blanks} chỗ trống nhưng "ans" có ${Array.isArray(c.ans) ? c.ans.length : 0} phần tử.`);
        }
      });
    });
  });
  return err;
}

/** Hoàn tác: xóa ngành vừa tạo dở (từ cấp nhỏ đến lớn) */
async function rollbackField(fieldId) {
  try {
    const units = unwrap(await sb.from("units").select("id").eq("field_id", fieldId)).map((u) => u.id);
    if (units.length) {
      const exs = unwrap(await sb.from("exercises").select("id").in("unit_id", units)).map((e) => e.id);
      await deleteIn("questions", "exercise_id", exs);
      await deleteIn("exercises", "unit_id", units);
      await deleteIn("words", "unit_id", units);
      await deleteIn("units", "id", units);
    }
    await deleteRow("fields", fieldId);
  } catch (e) { console.warn("Không hoàn tác hết được:", e.message); }
}

export async function importField(data, log = () => {}, options = {}) {
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
      color_hex: data.field.color_hex ?? null,
      description: data.field.description || "",
      sort_order: (maxOrder[0]?.sort_order ?? -1) + 1,
      is_published: true,
    })
  );
  log(`✔ Ngành "${data.field.name}" (slug: ${slug})`);

  let nq = 0, nw = 0;
  try {
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
  } catch (e) {
    await rollbackField(fieldId);
    throw new Error((e && e.message ? e.message : String(e)) + " (đã hoàn tác phần vừa nhập dở)");
  }
  if (options.position && options.position !== "end") {
    await placeField(fieldId, options.position);
    log("✔ Đã đặt ngành vào vị trí bạn chọn");
  }
  log(`Hoàn tất: ${data.units.length} unit · ${nw} từ · ${nq} câu hỏi.`);
  return { fieldId, slug, units: data.units.length, words: nw, questions: nq };
}

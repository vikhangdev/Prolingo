/* ============================================================
   GUARD — quy tắc xóa: CHA KHÔNG ĐƯỢC XÓA KHI CÒN CON
     Ngành  → Unit → ( Từ vựng | Bài tập → Câu hỏi )
   Thứ tự xóa đúng:  Câu hỏi → Bài tập / Từ vựng → Unit → Ngành
   Mỗi hàm trả về chuỗi thông báo (nếu bị chặn) hoặc null (được phép xóa).
   ============================================================ */
import * as api from "../../api.js";

const list = (parts) => parts.filter(Boolean).join(" và ");
const plural = (n, word) => (n ? `${n} ${word}` : "");

export const HIERARCHY = "Câu hỏi → Bài tập / Từ vựng → Unit → Ngành";

/** Xóa 1 ngành: phải hết unit */
export async function guardField(field) {
  const n = await api.countRows("units", "field_id", field.id);
  return n ? `Không thể xóa ngành "${field.name}" vì còn ${n} unit. Hãy xóa các unit trước (thứ tự xóa: ${HIERARCHY}).` : null;
}

/** Xóa 1 unit: phải hết từ vựng và bài tập */
export async function guardUnit(unit) {
  const [w, e] = await Promise.all([api.countRows("words", "unit_id", unit.id), api.countRows("exercises", "unit_id", unit.id)]);
  if (!w && !e) return null;
  return `Không thể xóa unit "${unit.name}" vì còn ${list([plural(w, "từ vựng"), plural(e, "bài tập")])}. Hãy xóa chúng trước (thứ tự xóa: ${HIERARCHY}).`;
}

/** Xóa 1 bài tập: phải hết câu hỏi */
export async function guardExercise(ex) {
  const n = await api.countRows("questions", "exercise_id", ex.id);
  return n ? `Không thể xóa bài "${ex.title}" vì còn ${n} câu hỏi. Hãy xóa các câu hỏi trước (thứ tự xóa: ${HIERARCHY}).` : null;
}

/** Xóa tất cả bài tập của 1 unit: mọi bài phải hết câu hỏi */
export async function guardExercisesOfUnit(unit, exerciseIds) {
  const n = await api.countIn("questions", "exercise_id", exerciseIds);
  return n ? `Không thể xóa các bài tập của unit "${unit.name}" vì còn ${n} câu hỏi bên trong. Hãy xóa câu hỏi trước.` : null;
}

/** Xóa tất cả unit của 1 ngành: mọi unit phải hết từ vựng và bài tập */
export async function guardUnitsOfField(field, unitIds) {
  const [w, e] = await Promise.all([api.countIn("words", "unit_id", unitIds), api.countIn("exercises", "unit_id", unitIds)]);
  if (!w && !e) return null;
  return `Không thể xóa các unit của ngành "${field.name}" vì bên trong còn ${list([plural(w, "từ vựng"), plural(e, "bài tập")])}. Hãy xóa chúng trước.`;
}

export const deleteGuard = (kind, row) => ({ field: guardField, unit: guardUnit, exercise: guardExercise }[kind](row));

import type { BXlsxInspection } from "./b-office";
import type { BDataset } from "./b-dataset";

type Finding = { label: string; ok: boolean | null; feedback: string };
const norm = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[ _—–-]+/g, "");

/** Сверяем только однозначно распознанные таблицы; смысл разделов не оцениваем. */
export function bFileEvidence(file: BXlsxInspection, dataset: BDataset, variantId: string): Finding[] {
  const result: Finding[] = [];
  if (["b-practice-report", "b-practice-full"].includes(variantId)) {
    const labels = file.worksheets.flatMap(s => [s.name, ...s.cells.filter(c => !c.formula).map(c => c.value)]).map(norm);
    for (const section of ["Введение", "Основная часть", "Выводы"]) result.push({ label: `Заголовок «${section}» в отчёте`,
      ok: labels.includes(norm(section)) ? true : null,
      feedback: labels.includes(norm(section)) ? "Найден заголовок. Наличие содержательного раздела проверяет наставник." : "Заголовок не распознан; наставник проверит структуру вручную. Можно назвать так лист или ячейку-заголовок." });
  }
  if (!["b-practice-clean", "b-practice-report", "b-practice-full"].includes(variantId)) return result;
  const sheet = file.worksheets.find(s => norm(s.name) === "матчи");
  const pending = (feedback: string) => result.push({ label: "Длительности и состав очищенного списка матчей", ok: null, feedback });
  if (!sheet) { pending("Лист «Матчи» не распознан. Наставник найдёт очищенные данные вручную."); return result; }
  const header = sheet.cells.find(c => norm(c.value) === "idматча");
  const rowNumber = header?.ref.match(/\d+$/)?.[0];
  const duration = sheet.cells.find(c => c.ref.match(/\d+$/)?.[0] === rowNumber && norm(c.value) === "длительностьмин");
  if (!header || !duration) { pending("Нужны заголовки ID_матча и Длительность_мин в одной строке. Другую структуру проверит наставник."); return result; }
  const idCol = header.ref.replace(/\d+$/, ""), durationCol = duration.ref.replace(/\d+$/, "");
  const byRef = new Map(sheet.cells.map(c => [c.ref, c]));
  const ids = sheet.cells.filter(c => c.ref.replace(/\d+$/, "") === idCol && Number(c.ref.match(/\d+$/)?.[0]) > Number(rowNumber) && c.value !== null && c.value !== "");
  if (!ids.length || ids.some(c => c.formula || typeof c.value !== "string" || !/^M\d+$/i.test(c.value.trim()))) {
    pending("ID или формулы нельзя однозначно сопоставить с учебным набором. Нужна проверка наставника."); return result;
  }
  const expected = new Map(dataset.matches.map(m => [m.id, m.duration]));
  const wrong: string[] = [];
  for (const cell of ids) {
    const id = String(cell.value).trim();
    const value = byRef.get(`${durationCol}${cell.ref.match(/\d+$/)?.[0]}`);
    if (value?.formula) { pending("Есть формулы длительности. Сайт не пересчитывает Excel: наставник проверит вычисленные значения."); return result; }
    if (!expected.has(id) || value?.type !== "n" || value.value !== expected.get(id)) wrong.push(cell.ref);
  }
  const unique = new Set(ids.map(c => String(c.value).trim()));
  const ok = !wrong.length && ids.length === expected.size && unique.size === expected.size;
  result.push({ label: "Длительности и состав очищенного списка матчей", ok,
    feedback: ok ? "ID, число строк и числовые длительности совпали с вариантом. Остальные поля и обоснование очистки проверяет наставник."
      : `Проверь лист «Матчи»: ${wrong.length ? `ячейки ${wrong.slice(0, 6).join(", ")}; ` : ""}строк ${ids.length}, различных ID ${unique.size}, ожидается ${expected.size}. Сверь повторы и столбец Длительность_мин.` });
  return result;
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { B_BEGINNER_LESSONS, B_SKILL_MAPPING } from "../../content/poligon/b-lessons";
import { CRITERIA } from "../../content/poligon/criteria";
import { makeBDataset } from "./b-dataset";
import { buildBDatasetXlsx, inspectBXlsx } from "./b-office";
import { bFileEvidence } from "./b-file-evidence";
import { bCharts, bPivots, reviewBPractice } from "./b-practice";

test("19 уроков покрывают 21 аспект, содержат пример и маленькую самопроверку", () => {
  assert.equal(B_BEGINNER_LESSONS.length, 19);
  assert.deepEqual([...new Set(B_BEGINNER_LESSONS.flatMap(l => l.aspectIds))].sort(), CRITERIA.b.tasks.flatMap(t => t.aspects.map(a => a.id)).sort());
  for (const lesson of B_BEGINNER_LESSONS) {
    assert.ok(lesson.blocks.some(b => b.type === "table" || b.type === "comparison"));
    assert.ok(lesson.blocks.some(b => b.type === "quiz"));
    assert.ok(lesson.blocks.some(b => b.type === "exercise"));
    assert.ok(lesson.practiceVariantId);
  }
  for (const m of B_SKILL_MAPPING) assert.ok(B_BEGINNER_LESSONS.find(l => l.id === m.lessonId)?.aspectIds.includes(m.aspectId));
});

test("версия 2: перемешанный XLSX и ключ принадлежат одному варианту, старый вариант не меняется", () => {
  const orders = new Set<string>(), missing = new Set<number>();
  for (let i = 0; i < 30; i++) {
    const seed = `new-${i}`, old = makeBDataset(seed), d = makeBDataset(seed, 2);
    assert.deepEqual(makeBDataset(seed, 1), old);
    assert.deepEqual(makeBDataset(seed, 2), d);
    assert.notDeepEqual(old, d);
    assert.equal(d.totals.knownDurations, d.incidents.filter(r => r.duration !== null).length);
    assert.ok(d.totals.knownDurations! < d.totals.incidents);
    missing.add(d.totals.incidents - d.totals.knownDurations!);
    orders.add(d.rawSheets.Матчи.slice(1).map(r => r[0]).join(","));
    const file = inspectBXlsx(buildBDatasetXlsx(seed, 2));
    for (const s of file.worksheets) assert.deepEqual(s.cells.map(c => c.value), d.rawSheets[s.name as keyof typeof d.rawSheets].flat());
    assert.equal(d.cleaningCases.find(c => c.id === "negative")?.decision, "remove");
  }
  assert.equal(orders.size, 30); assert.equal(missing.size, 2);
});

test("число событий и известных длительностей проверяются раздельно; новый пик не суммируется", () => {
  const d = makeBDataset("known", 2), w = { _b_seed: "known", _b_version: "2", calc_known: String(d.totals.incidents) };
  assert.equal(reviewBPractice("b-practice-report", w).checks.find(c => c.id === "calc_known")?.ok, false);
  w.calc_known = String(d.totals.knownDurations);
  assert.equal(reviewBPractice("b-practice-report", w).checks.find(c => c.id === "calc_known")?.ok, true);
  assert.equal(bPivots(1)[2].operation, "Сумма");
  assert.equal(bPivots(2)[2].operation, "Максимум");
  assert.equal(bPivots(2)[2].column, "Платформа");
  assert.deepEqual(bCharts(2)[2].types, ["Линия"]);
  assert.equal(reviewBPractice("b-practice-clean", w).checks.find(c => c.id === "clean_rationale")?.ok, null);
});

test("проверка файла отличает сырые строки от очищенного списка и не оценивает смысл", () => {
  const d = makeBDataset("file", 2), raw = inspectBXlsx(buildBDatasetXlsx("file", 2));
  assert.equal(bFileEvidence(raw, d, "b-practice-report").find(c => c.label.startsWith("Длительности"))?.ok, false);
  assert.ok(bFileEvidence(raw, d, "b-practice-report").some(c => c.ok === null));
  const clean = { ...raw, worksheets: [{ name: "Матчи", path: "", cells: [
    { ref: "A1", type: "inlineStr", value: "ID_матча" }, { ref: "B1", type: "inlineStr", value: "Длительность_мин" },
    ...d.matches.flatMap((m, i) => [{ ref: `A${i + 2}`, type: "inlineStr", value: m.id }, { ref: `B${i + 2}`, type: "n", value: m.duration }]),
  ] }] };
  assert.equal(bFileEvidence(clean, d, "b-practice-clean")[0].ok, true);
  clean.worksheets[0].cells[3].value = 0;
  assert.equal(bFileEvidence(clean, d, "b-practice-clean")[0].ok, false);
  assert.match(bFileEvidence(clean, d, "b-practice-clean")[0].feedback, /A2/);
  assert.equal(raw.attachedPivotCount, 0); assert.deepEqual(raw.attachedChartTypes, []);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { makeBDataset } from "./b-dataset";
import { bDelivery, B_PIVOTS, reviewBPractice } from "./b-practice";
import { reviewB } from "./b-trainers";
import type { Workbook } from "./a-practicum";
import { CRITERIA } from "../../content/poligon/criteria";
import { MODULE_B } from "../../content/poligon/b";
import { B_SKILL_MAPPING } from "../../content/poligon/b-lessons";

test("Б: вариант воспроизводится и его агрегаты согласованы", () => {
  for (let i = 0; i < 30; i++) {
    const d = makeBDataset(`variant-${i}`);
    assert.deepEqual(makeBDataset(`variant-${i}`), d);
    assert.equal(Object.values(d.totals.byHour).reduce((a, b) => a + b, 0), d.matches.length);
    assert.equal(Object.values(d.totals.byIncident).reduce((a, b) => a + b, 0), d.incidents.length);
    assert.equal(Object.values(d.totals.byPlatform).reduce((a, b) => a + b, 0), d.viewers.reduce((a, b) => a + b.viewers, 0));
    assert.ok(d.incidents.some(r => r.duration === null));
  }
  assert.notDeepEqual(makeBDataset("one"), makeBDataset("two"));
});
test("Б: журнал из тысячи символов не исправляет неверные решения", () => {
  const w: Workbook = { _b_seed: "one", _b_mode: "guided", log: "а".repeat(1000) };
  const bad = reviewBPractice("b-practice-clean", w);
  assert.equal(bad.failedIds.length, 6);
  for (const c of makeBDataset("one").cleaningCases) {
    w[`decision_${c.id}`] = c.decision;
    w[`fields_${c.id}`] = c.fields.join("|");
    w[`compare_${c.id}`] = c.comparison;
  }
  assert.equal(reviewBPractice("b-practice-clean", w).failedIds.length, 0);
  w.fields_exact = "ID_матча";
  assert.ok(reviewBPractice("b-practice-clean", w).failedIds.includes("clean_exact"));
});
test("Б: расчёты проверяются по конкретному seed, включая сводные и обоснование", () => {
  const d = makeBDataset("one");
  const w: Workbook = { _b_seed: "one", _b_mode: "independent", calc_teams: String(d.totals.teams), calc_players: String(d.totals.players), calc_matches: String(d.totals.matches), calc_incidents: String(d.totals.incidents), calc_network: String(d.totals.networkMinutes), top5: d.totals.top5.join(",") };
  for (const p of B_PIVOTS) {
    for (const part of ["row", "column", "value", "operation"] as const) w[`${p.id}_${part}`] = p[part];
    const groups = p.id === "time" ? d.totals.byHour : p.id === "incident" ? d.totals.byIncident : d.totals.byPlatform;
    Object.values(groups).forEach((n, i) => { w[`agg_${p.id}_${i}`] = String(n); });
  }
  const [a, b] = d.totals.top5.map(id => d.matches.find(m => m.id === id)!);
  Object.assign(w, { evidence_a: a.id, evidence_b: b.id, evidence_diff: String(a.duration - b.duration), evidence_source: "Матчи" });
  assert.equal(reviewBPractice("b-practice-report", w).failedIds.length, 0);
  const other = { ...w, _b_seed: "different-variant" };
  assert.ok(reviewBPractice("b-practice-report", other).failedIds.length > 0);
});
test("Б: цифра в заголовке не даёт судейской оценки, Б4 требует наблюдения", () => {
  const visual = reviewBPractice("b-practice-visual", { _b_seed: "one", visual_claim: "Диаграмма 3" });
  assert.equal(visual.checks.find(c => c.id === "claim")?.ok, null);
  assert.match(visual.checks.find(c => c.id === "claim")!.feedback, /не вывод/);
  const delivery = reviewBPractice("b-practice-delivery", { _b_seed: "one" });
  assert.equal(delivery.checks.find(c => c.id === "workplace")?.ok, null);
  assert.notEqual(bDelivery("one").number, bDelivery("two").number);
});
test("Б: повтор ошибок сохраняет только выбранные навыки, не засчитывает остальные", () => {
  const r = reviewBPractice("b-practice-clean", { _b_seed: "new", _b_mode: "retry", _b_focus: '["clean_exact"]' });
  assert.deepEqual(r.checks.map(c => c.id), ["clean_exact"]);
});
test("Б: прежний разбор и конкурсные веса остаются прежними", () => {
  const legacy = reviewB("b-calc", { k_teams: "8", k_players: "41", k_matches: "15" });
  assert.ok(legacy[0].good.some(s => s.includes("Команд")));
  assert.deepEqual(CRITERIA.b.tasks.map(t => t.aspects.reduce((sum, a) => sum + a.weight, 0)), [6, 6, 7, 1]);
  assert.equal(new Set(CRITERIA.b.tasks.flatMap(t => t.aspects.map(a => a.id))).size, 21);
});
test("Б: 21 аспект имеет читаемый урок и практику, старые адреса доступны", () => {
  const aspects = CRITERIA.b.tasks.flatMap(t => t.aspects.map(a => a.id)).sort();
  assert.deepEqual(B_SKILL_MAPPING.map(m => m.aspectId).sort(), aspects);
  for (const mapping of B_SKILL_MAPPING) {
    const lesson = MODULE_B.lessons.find(l => l.id === mapping.lessonId)!;
    assert.ok(lesson?.blocks.some(b => b.type === "exercise"));
    assert.ok(MODULE_B.variants.some(v => v.id === lesson.practiceVariantId));
  }
  for (let i = 0; i <= 10; i++) assert.ok(MODULE_B.lessons.some(l => l.id === `b-l${i}`));
  for (const id of ["b-tr-clean", "b-tr-calc", "b-tr-charts", "b-tr-pres", "b-razminka", "b-otchet", "b-chempionat"]) assert.ok(MODULE_B.variants.some(v => v.id === id));
});

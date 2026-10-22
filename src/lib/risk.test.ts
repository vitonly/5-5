/**
 * Автотесты «зоны риска» (src/lib/risk.ts). Запуск: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assessRisk, type RiskInput } from "./risk";

const now = new Date("2026-10-23T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

function input(over: Partial<RiskInput>): RiskInput {
  return {
    students: [
      { id: "a", name: "Аня", groupIds: ["g1"] },
      { id: "b", name: "Боря", groupIds: [] },
    ],
    assignments: [],
    submissions: [],
    lessons: [],
    now,
    ...over,
  };
}

describe("assessRisk — ученики в зоне риска", () => {
  it("без проблем — список пустой", () => {
    assert.deepEqual(assessRisk(input({})), []);
  });

  it("2 просрочки за месяц — в списке, 1 — нет", () => {
    const r = assessRisk(input({
      assignments: [
        { studentId: "a", status: "OVERDUE", createdAt: daysAgo(20) },
        { studentId: "a", status: "OVERDUE", createdAt: daysAgo(25) },
        { studentId: "b", status: "OVERDUE", createdAt: daysAgo(5) },
        { studentId: "b", status: "OVERDUE", createdAt: daysAgo(40) },   // давно — не считается
      ],
      submissions: [{ studentId: "a", submittedAt: daysAgo(1) }, { studentId: "b", submittedAt: daysAgo(1) }],
    }));
    assert.deepEqual(r.map((x) => x.name), ["Аня"]);
    assert.match(r[0].reasons[0], /2 просрочки/);
  });

  it("домашки выдавались, а сдач за 2 недели нет", () => {
    const r = assessRisk(input({
      assignments: [
        { studentId: "a", status: "ASSIGNED", createdAt: daysAgo(10) },
        { studentId: "b", status: "GRADED", createdAt: daysAgo(10) },
      ],
      submissions: [{ studentId: "b", submittedAt: daysAgo(9) }],
    }));
    assert.deepEqual(r.map((x) => x.name), ["Аня"]);
    assert.equal(r[0].reasons[0], "2 недели не сдаёт домашки");
  });

  it("пропуски считаются только по занятиям, где ученика ждали", () => {
    const r = assessRisk(input({
      lessons: [
        { date: daysAgo(2), groupId: "g1", presentIds: [] },      // группа Ани — Аня пропустила
        { date: daysAgo(9), groupId: "g1", presentIds: [] },      // ещё раз
        { date: daysAgo(4), groupId: null, presentIds: ["a", "b"] },
        { date: daysAgo(30), groupId: null, presentIds: [] },     // давно — не считается
      ],
    }));
    assert.deepEqual(r.map((x) => x.name), ["Аня"]);              // Боря не в g1 — его там не ждали
    assert.equal(r[0].reasons[0], "пропущено 2 из 3 занятий");
  });

  it("занятия до прихода ученика в школу не считаются пропусками", () => {
    const r = assessRisk(input({
      students: [{ id: "a", name: "Аня", groupIds: [], createdAt: daysAgo(3) }],
      lessons: [
        { date: daysAgo(10), groupId: null, presentIds: [] },
        { date: daysAgo(5), groupId: null, presentIds: [] },
      ],
    }));
    assert.deepEqual(r, []);
  });

  it("больше причин — выше в списке", () => {
    const r = assessRisk(input({
      assignments: [
        { studentId: "b", status: "OVERDUE", createdAt: daysAgo(3) },
        { studentId: "b", status: "OVERDUE", createdAt: daysAgo(4) },
        { studentId: "a", status: "ASSIGNED", createdAt: daysAgo(3) },
      ],
    }));
    assert.deepEqual(r.map((x) => x.name), ["Боря", "Аня"]);
    assert.equal(r[0].reasons.length, 2);   // просрочки + не сдаёт
  });
});

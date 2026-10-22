/**
 * Автотесты начисления очков школы (src/lib/points.ts).
 * Запуск: npm test
 *
 * Тест — это маленькая программа, которая вызывает нашу функцию с известными данными
 * и проверяет, что ответ именно такой, как мы ожидаем. Если кто-то случайно поменяет
 * правила начисления, тест «покраснеет» раньше, чем ученики увидят неправильные очки.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  POINT_VALUES,
  calcMatchWinPoints,
  categorizePointReason,
  formatPoints,
  isOffRole,
  roleWinBonus,
  rolePriorityList,
  roundPoints,
} from "./points";

describe("roundPoints / formatPoints — округление до десятых", () => {
  it("убирает «хвосты» дробей", () => {
    assert.equal(roundPoints(0.1 + 0.2), 0.3);
    assert.equal(roundPoints(1.25), 1.3);
    assert.equal(roundPoints(-0.5), -0.5);
  });
  it("целые пишет без запятой, дробные — с одной цифрой", () => {
    assert.equal(formatPoints(3), "3");
    assert.equal(formatPoints(1.5), "1.5");
    assert.equal(formatPoints(2.04), "2");
  });
});

describe("calcMatchWinPoints — очки за победу в 5v5", () => {
  const equal = { winnerAvgRating: 50, loserAvgRating: 50 };

  it("обычная победа на основной роли — 1 очко", () => {
    const r = calcMatchWinPoints({ winStreak: 1, ...equal, primaryRole: "MID", position: 2 });
    assert.equal(r.delta, POINT_VALUES.MATCH_WIN);
    assert.equal(r.reason, "Победа в 5v5");
  });

  it("вторая победа подряд за день — ровно 2 очка", () => {
    const r = calcMatchWinPoints({ winStreak: 2, ...equal, primaryRole: "MID", position: 2 });
    assert.equal(r.delta, POINT_VALUES.MATCH_WIN_STREAK);
  });

  it("апсет: слабая команда победила — 1.1 / 1.2 / 1.3", () => {
    const at = (winner: number) =>
      calcMatchWinPoints({ winStreak: 1, winnerAvgRating: winner, loserAvgRating: 100 }).delta;
    assert.equal(at(90), 1);    // разница 10% — не апсет
    assert.equal(at(85), 1.1);  // 15%
    assert.equal(at(75), 1.2);  // 25%
    assert.equal(at(60), 1.3);  // 40%
  });

  it("апсет не добавляется ко второй победе подряд", () => {
    const r = calcMatchWinPoints({ winStreak: 2, winnerAvgRating: 60, loserAvgRating: 100 });
    assert.equal(r.delta, 2);
  });

  it("бонус за роль прибавляется, а не умножает", () => {
    const second = calcMatchWinPoints({ winStreak: 1, ...equal, primaryRole: "MID", secondaryRoles: ["CARRY"], position: 1 });
    assert.equal(second.delta, 1.1);
    const off = calcMatchWinPoints({ winStreak: 1, ...equal, primaryRole: "MID", position: 5 });
    assert.equal(off.delta, 1.5);
    assert.match(off.reason, /не на своей роли/);
    const streakOff = calcMatchWinPoints({ winStreak: 2, ...equal, primaryRole: "MID", position: 5 });
    assert.equal(streakOff.delta, 2.5);   // 2 + 0.5, а не 2 × 1.5
  });
});

describe("роли игрока", () => {
  it("список ролей: основная + до двух дополнительных без повторов", () => {
    assert.deepEqual(rolePriorityList("MID", ["MID", "CARRY", "OFFLANE", "SUPPORT"]), ["MID", "CARRY", "OFFLANE"]);
    assert.deepEqual(rolePriorityList(null, ["SUPPORT"]), ["SUPPORT"]);
  });
  it("бонус по месту роли в списке: 0 / 0.1 / 0.2 / 0.5", () => {
    const roles = ["CARRY", "OFFLANE"] as const;
    assert.equal(roleWinBonus("MID", [...roles], 2).bonus, 0);
    assert.equal(roleWinBonus("MID", [...roles], 1).bonus, 0.1);
    assert.equal(roleWinBonus("MID", [...roles], 3).bonus, 0.2);
    assert.equal(roleWinBonus("MID", [...roles], 4).bonus, 0.5);
    assert.equal(roleWinBonus("MID", [...roles], 0).bonus, 0);   // позиция не задана — как основная
  });
  it("isOffRole: не своя позиция", () => {
    assert.equal(isOffRole("CARRY", 1), false);
    assert.equal(isOffRole("CARRY", 4), true);
    assert.equal(isOffRole(null, 4), false);
  });
});

describe("categorizePointReason — раздел в истории очков", () => {
  it("раскладывает причины по разделам", () => {
    assert.equal(categorizePointReason("Штраф: опоздание"), "penalty");
    assert.equal(categorizePointReason("Бонус: Своя игра — 1 место"), "bonus");
    assert.equal(categorizePointReason("Домашка принята: Ласт-хит"), "homework");
    assert.equal(categorizePointReason("Победа в 5v5"), "match");
    assert.equal(categorizePointReason("Посещение занятия 21.10"), "bonus");
    assert.equal(categorizePointReason("Зал славы: самый быстрый"), "other");
  });
});

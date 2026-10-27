/**
 * Автотесты автобаланса 5v5 (src/lib/team-balance.ts).
 * Запуск: npm test
 *
 * Проверяем главное, что должно быть всегда правдой, какими бы ни были игроки:
 * в каждой команде 5 человек, никто не потерялся и не попал дважды,
 * позиции 1–5 в команде разные, а сила команд близкая.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { DotaRole } from "@prisma/client";
import { balanceTeams, reshuffleForSecondGame, type BalancePlayer, type BalancedTeams } from "./team-balance";

const ROLES: DotaRole[] = ["CARRY", "MID", "OFFLANE", "SUPPORT", "HARD_SUPPORT"];

/** 10 игроков: по двое на каждую роль, сила — из списка */
function makePlayers(ratings: number[]): BalancePlayer[] {
  return ratings.map((r, i) => ({
    id: `p${i}`,
    name: `Игрок ${i}`,
    finalRating: r,
    primaryRole: ROLES[i % 5],
    secondaryRoles: [ROLES[(i + 1) % 5]],
  }));
}

/** Общие проверки для любого результата баланса */
function checkLineup(players: BalancePlayer[], t: BalancedTeams) {
  assert.equal(t.radiant.length, 5, "в Radiant 5 игроков");
  assert.equal(t.dire.length, 5, "в Dire 5 игроков");
  const ids = [...t.radiant, ...t.dire].map((p) => p.id).sort();
  assert.deepEqual(ids, players.map((p) => p.id).sort(), "каждый игрок ровно в одной команде");
  for (const team of [t.radiant, t.dire]) {
    assert.deepEqual(team.map((p) => p.position).sort(), [1, 2, 3, 4, 5], "позиции 1–5 без повторов");
  }
  const sum = (team: BalancePlayer[]) => team.reduce((s, p) => s + p.finalRating, 0);
  assert.equal(t.radiantTotal, sum(t.radiant));
  assert.equal(t.direTotal, sum(t.dire));
  assert.equal(t.difference, Math.abs(t.radiantTotal - t.direTotal));
}

describe("balanceTeams — автобаланс 5v5", () => {
  it("нужно ровно 10 игроков", () => {
    assert.throws(() => balanceTeams(makePlayers([50, 50, 50])));
  });

  it("равные по силе пары → разница 0", () => {
    const players = makePlayers([90, 80, 70, 60, 50, 90, 80, 70, 60, 50]);
    const t = balanceTeams(players);
    checkLineup(players, t);
    assert.equal(t.difference, 0);
  });

  it("разные игроки → разница не больше, чем у «наивного» деления пополам", () => {
    const ratings = [97, 88, 81, 74, 66, 59, 52, 44, 37, 25];
    const players = makePlayers(ratings);
    const t = balanceTeams(players);
    checkLineup(players, t);
    const naive = Math.abs(ratings.slice(0, 5).reduce((a, b) => a + b) - ratings.slice(5).reduce((a, b) => a + b));
    assert.ok(t.difference <= naive, `разница ${t.difference} должна быть ≤ ${naive}`);
  });

  it("строгий режим: каждый играет на своей основной или дополнительной роли", () => {
    const players = makePlayers([70, 65, 60, 55, 50, 70, 65, 60, 55, 50]);
    const t = balanceTeams(players, true);
    checkLineup(players, t);
    for (const p of [...t.radiant, ...t.dire]) {
      const allowed = [p.primaryRole, ...(p.secondaryRoles ?? [])].map((r) => ROLES.indexOf(r!) + 1);
      assert.ok(allowed.includes(p.position), `${p.name} поставлен на позицию ${p.position}`);
    }
  });
});

/**
 * Настоящий случай с занятия: 10 игроков, сила и роли как в базе (имена заменены).
 * Раньше в строгом режиме балансер раздавал роли «жадно» и находил только разницу 41,
 * хотя честный состав с разницей 1 существует.
 */
function realCasePlayers(): BalancePlayer[] {
  const rows: [number, DotaRole, DotaRole[]][] = [
    [88, "OFFLANE", ["MID", "CARRY"]],
    [85, "CARRY", ["OFFLANE", "SUPPORT"]],
    [77, "CARRY", ["HARD_SUPPORT", "OFFLANE"]],
    [75, "OFFLANE", ["SUPPORT", "CARRY"]],
    [72, "CARRY", ["MID", "OFFLANE"]],
    [68, "OFFLANE", ["SUPPORT", "HARD_SUPPORT"]],
    [58, "HARD_SUPPORT", ["SUPPORT", "MID"]],
    [27, "SUPPORT", ["HARD_SUPPORT", "CARRY"]],
    [27, "CARRY", ["SUPPORT", "HARD_SUPPORT"]],
    [20, "SUPPORT", ["HARD_SUPPORT", "MID"]],
  ];
  return rows.map(([finalRating, primaryRole, secondaryRoles], i) => ({
    id: `r${i}`,
    name: `Ученик ${i}`,
    finalRating,
    primaryRole,
    secondaryRoles,
  }));
}

/** Каждый стоит на своей основной или дополнительной роли */
function checkListedRoles(t: BalancedTeams) {
  for (const p of [...t.radiant, ...t.dire]) {
    const allowed = [p.primaryRole, ...(p.secondaryRoles ?? [])].map((r) => ROLES.indexOf(r!) + 1);
    assert.ok(allowed.includes(p.position), `${p.name} поставлен на позицию ${p.position}`);
  }
}

describe("строгий режим — настоящий случай с занятия", () => {
  it("находит честный состав с разницей 1, а не 41", () => {
    const players = realCasePlayers();
    const t = balanceTeams(players, true);
    checkLineup(players, t);
    checkListedRoles(t);
    assert.ok(t.difference <= 1, `разница ${t.difference}`);
  });

  it("пересборка ко 2-й игре тоже соблюдает роли", () => {
    const players = realCasePlayers();
    const first = balanceTeams(players, true);
    const game1: Record<string, { team: "RADIANT" | "DIRE"; position: number }> = {};
    for (const p of first.radiant) game1[p.id] = { team: "RADIANT", position: p.position };
    for (const p of first.dire) game1[p.id] = { team: "DIRE", position: p.position };
    const second = reshuffleForSecondGame(players, game1, null, 3, true);
    checkLineup(players, second);
    checkListedRoles(second);
  });
});

describe("reshuffleForSecondGame — пересборка ко 2-й игре", () => {
  it("состав остаётся честным: те же 10 игроков, позиции 1–5", () => {
    const players = makePlayers([90, 80, 70, 60, 50, 85, 75, 65, 55, 45]);
    const first = balanceTeams(players);
    // Составы 1-й игры: кто за какую сторону и на какой позиции
    const game1: Record<string, { team: "RADIANT" | "DIRE"; position: number }> = {};
    for (const p of first.radiant) game1[p.id] = { team: "RADIANT", position: p.position };
    for (const p of first.dire) game1[p.id] = { team: "DIRE", position: p.position };
    const second = reshuffleForSecondGame(players, game1);
    checkLineup(players, second);
  });
});

/**
 * Разовый импорт игр 5v5, у которых не сохранились демки: данные перенесены со скриншотов итогов игры.
 *
 *   npx tsx scripts/import-screenshot-replays.ts scripts/data/screenshot-replays-2026-09-26.json          — проверка, ничего не пишет
 *   npx tsx scripts/import-screenshot-replays.ts scripts/data/screenshot-replays-2026-09-26.json --apply  — записать
 *
 * Как сопоставляются ученики: у каждого игрока в файле есть позиция и подсказка ника (userHint).
 * Скрипт берёт состав этой игры с сайта, ищет среди двух игроков на этой позиции того, чьё имя содержит подсказку,
 * и проверяет, что вся пятёрка одной стороны Dota — это одна команда состава.
 * После записи пересчитывает Зал славы и выдаёт ачивки (как после загрузки демки).
 */
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/db";
import { syncHallPoints } from "../src/lib/hall-of-fame";
import { checkAllAchievements } from "../src/lib/achievements";
import { normalizeReplayPlayers, type ReplayPlayer } from "../src/lib/replay";

type InPlayer = Record<string, unknown> & {
  team: "RADIANT" | "DIRE";
  userHint: string;
  position: number;
  draftOrder: number;
  heroId: number;
  name: string;
};
type InGame = {
  gameNumber: number;
  dotaMatchId: string | null;
  durationSec: number;
  radiantWin: boolean;
  radiantScore: number;
  direScore: number;
  screenshots: string[];
  players: InPlayer[];
};
type InFile = { sessionId: string; note?: string; games: InGame[] };

type Assign = Record<string, { team?: string; position?: number }>;
const parse = (raw: string | null | undefined): Assign => {
  try {
    return JSON.parse(raw || "{}") as Assign;
  } catch {
    return {};
  }
};

async function main() {
  const file = process.argv[2];
  const apply = process.argv.includes("--apply");
  if (!file) throw new Error("Укажи путь к JSON с данными");
  const input = JSON.parse(readFileSync(file, "utf8")) as InFile;

  const session = await prisma.matchSession.findUnique({
    where: { id: input.sessionId },
    select: { id: true, date: true, teamAssignments: true, teamAssignmentsGame2: true },
  });
  if (!session) throw new Error(`Матч ${input.sessionId} не найден`);
  console.log(`Матч ${session.id} от ${new Date(session.date).toLocaleDateString("ru-RU")}${apply ? "" : " — ПРОВЕРКА, без записи"}`);

  const a1 = parse(session.teamAssignments);
  const a2 = parse(session.teamAssignmentsGame2);
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set([...Object.keys(a1), ...Object.keys(a2)])] } },
    select: { id: true, firstName: true, lastName: true, username: true },
  });
  const nameOf = (id: string) => {
    const u = users.find((x) => x.id === id);
    return u ? [u.firstName, u.lastName, u.username].filter(Boolean).join(" ") : id;
  };

  const ready: { game: InGame; players: ReplayPlayer[] }[] = [];
  for (const game of input.games) {
    // Состав №2, если он задан для второй игры, иначе №1
    const assign = game.gameNumber >= 2 && Object.keys(a2).length ? a2 : a1;
    const sideTeams: Record<string, Set<string>> = { RADIANT: new Set(), DIRE: new Set() };
    const mapped = new Map<InPlayer, string>();

    for (const p of game.players) {
      const onPos = Object.entries(assign).filter(([, v]) => Number(v.position) === p.position);
      const hint = p.userHint.toLowerCase();
      const hits = onPos.filter(([id]) => nameOf(id).toLowerCase().includes(hint));
      if (hits.length !== 1) {
        throw new Error(
          `Игра ${game.gameNumber}: не удалось однозначно найти «${p.userHint}» на позиции ${p.position} ` +
            `(кандидаты: ${onPos.map(([id]) => nameOf(id)).join(", ") || "нет"})`
        );
      }
      const [userId, slot] = hits[0];
      mapped.set(p, userId);
      sideTeams[p.team].add(String(slot.team));
    }
    if (sideTeams.RADIANT.size !== 1 || sideTeams.DIRE.size !== 1 || [...sideTeams.RADIANT][0] === [...sideTeams.DIRE][0]) {
      throw new Error(`Игра ${game.gameNumber}: стороны Dota не совпадают с командами состава`);
    }

    // Тот же формат, что пишет загрузка демки; userId подставляем по сопоставлению
    const players = normalizeReplayPlayers(game.players, new Map(), game.durationSec).map((p, i) => ({
      ...p,
      userId: mapped.get(game.players[i]) ?? null,
      gpm: (game.players[i].gpm as number) ?? null,
      xpm: (game.players[i].xpm as number) ?? null,
    }));

    console.log(`\nИгра ${game.gameNumber}: ${game.radiantScore}:${game.direScore}, победа ${game.radiantWin ? "Света" : "Тьмы"}`);
    for (const [i, p] of players.entries()) {
      const src = game.players[i];
      console.log(
        `  ${p.team === "RADIANT" ? "Свет" : "Тьма"} · поз.${src.position} · ${src.name} → ${nameOf(p.userId!)} · ` +
          `${p.kills}/${p.deaths}/${p.assists} · NW ${p.netWorth}`
      );
    }
    ready.push({ game, players });
  }

  if (!apply) {
    console.log("\nВсё сопоставилось. Запусти с --apply, чтобы записать.");
    return;
  }

  for (const { game, players } of ready) {
    const draft = [...game.players]
      .sort((x, y) => x.draftOrder - y.draftOrder)
      .map((p, i) => ({ order: i + 1, heroId: p.heroId, pick: true, team: p.team }));
    const data = { players, draft, kills: [], source: "screenshot" as const, screenshots: game.screenshots };
    const fields = {
      durationSec: game.durationSec,
      radiantWin: game.radiantWin,
      radiantScore: game.radiantScore,
      direScore: game.direScore,
      dotaMatchId: game.dotaMatchId,
    };
    await prisma.matchReplay.upsert({
      where: { sessionId_gameNumber: { sessionId: session.id, gameNumber: game.gameNumber } },
      create: { sessionId: session.id, gameNumber: game.gameNumber, ...fields, data },
      update: { ...fields, data },
    });
    console.log(`Игра ${game.gameNumber} записана`);
  }

  const hall = await syncHallPoints();
  console.log(`Зал славы пересчитан, изменений: ${hall.changed}`);
  const ach = await checkAllAchievements();
  console.log(`Ачивки проверены, новых: ${ach}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

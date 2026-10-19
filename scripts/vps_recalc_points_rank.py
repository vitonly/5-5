#!/usr/bin/env python3
"""Hotpatch scoring/rank changes and recalculate points + finalRating on VPS."""
from __future__ import annotations

import sys
from pathlib import Path

import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

KEY = Path.home() / ".ssh" / "id_ed25519_startdota"
ROOT = Path(__file__).resolve().parents[1]
REMOTE = "/var/www/startplus/app"

FILES = [
    "src/lib/points.ts",
    "src/lib/hall-of-fame.ts",
    "src/lib/rating.ts",
    "src/lib/labels.ts",
    "src/components/RankMedalPicker.tsx",
    "src/components/RatingBreakdown.tsx",
    "src/app/(dashboard)/rules/page.tsx",
    "src/app/admin/page.tsx",
]

RECALC = r"""
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function roundPoints(v) {
  return Math.round(v * 10) / 10;
}

const RANK_BASE_MAX = 65;
const RANK_BASE_TABLE = {
  1: [1, 3, 4, 5, 7],
  2: [8, 9, 10, 12, 14],
  3: [16, 18, 21, 23, 26],
  4: [27, 29, 31, 34, 35],
  5: [36, 39, 42, 44, 47],
  6: [48, 51, 53, 56, 59],
  7: [60, 61, 62, 64, 64],
  8: [65],
};

function rankTierToBase(rankTier) {
  if (!rankTier) return RANK_BASE_TABLE[1][0];
  const medal = Math.floor(rankTier / 10);
  if (medal === 8) return RANK_BASE_MAX;
  let stars = rankTier % 10;
  if (stars <= 0) stars = 1;
  if (stars > 5) stars = 5;
  const row = RANK_BASE_TABLE[medal] || RANK_BASE_TABLE[1];
  return row[stars - 1] ?? row[0];
}

function clampRating(value) {
  return Math.max(1, Math.min(100, Math.round(value)));
}

async function main() {
  const overdue = await prisma.pointLog.updateMany({
    where: { reason: { contains: "не сдана к дедлайну" }, delta: -0.5 },
    data: { delta: -1 },
  });
  console.log("overdue_updated", overdue.count);

  const hallTypes = ["HALL_OF_FAME", "HALL_OF_FAME_PAST", "HALL_OF_FAME_LOSS"];
  const hallLogs = await prisma.pointLog.findMany({
    where: {
      OR: [
        { sourceType: { in: hallTypes } },
        { reason: { startsWith: "Зал славы:" } },
        { reason: { startsWith: "Антирекорд:" } },
      ],
    },
    select: { id: true, delta: true },
  });
  const hallTargets = hallLogs.filter((l) => Math.abs(l.delta) === 3);
  for (const l of hallTargets) {
    await prisma.pointLog.update({
      where: { id: l.id },
      data: { delta: roundPoints(Math.sign(l.delta) * 1.5) },
    });
  }
  console.log("hall_updated", hallTargets.length);

  const season = await prisma.ratingSeason.findFirst({ where: { isActive: true } });
  if (season) {
    const students = await prisma.user.findMany({
      where: { role: "STUDENT" },
      select: { id: true },
    });
    const grouped = await prisma.pointLog.groupBy({
      by: ["userId"],
      where: { seasonId: season.id },
      _sum: { delta: true },
    });
    const byUser = Object.fromEntries(
      grouped.map((g) => [g.userId, roundPoints(g._sum.delta ?? 0)])
    );
    for (const s of students) {
      await prisma.playerProfile.update({
        where: { userId: s.id },
        data: { totalPoints: byUser[s.id] ?? 0 },
      });
    }
    console.log("profiles_restored", students.length, "season", season.name);
  } else {
    console.log("no_active_season");
  }

  const profiles = await prisma.playerProfile.findMany({
    select: { id: true, rankTier: true, skillMod: true, vibeMod: true, finalRating: true },
  });
  let ratingUpdated = 0;
  for (const p of profiles) {
    const next = clampRating(rankTierToBase(p.rankTier) + p.skillMod + Math.round(p.vibeMod ?? 0));
    if (next !== p.finalRating) {
      await prisma.playerProfile.update({
        where: { id: p.id },
        data: { finalRating: next },
      });
      ratingUpdated++;
    }
  }
  console.log("ratings_updated", ratingUpdated);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
"""


def main() -> None:
    pkey = paramiko.Ed25519Key.from_private_key_file(str(KEY))
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(
        "201.34.159.109",
        username="root",
        pkey=pkey,
        allow_agent=False,
        look_for_keys=False,
        timeout=60,
    )
    t = c.get_transport()
    if t:
        t.set_keepalive(30)

    sftp = c.open_sftp()
    for rel in FILES:
        local = ROOT / rel
        if not local.exists():
            print("skip missing", rel, flush=True)
            continue
        print("upload", rel, flush=True)
        sftp.put(str(local), f"{REMOTE}/{rel}")
    with sftp.file(f"{REMOTE}/_recalc_points_rank.js", "w") as f:
        f.write(RECALC)
    sftp.close()

    _, o, e = c.exec_command(
        f"cd {REMOTE} && npm run build > /tmp/prbuild.log 2>&1; echo BUILD:$?; "
        "node _recalc_points_rank.js; echo RECALC:$?; "
        "rm -f _recalc_points_rank.js; "
        "pm2 restart startplus && pm2 save",
        timeout=900,
        get_pty=True,
    )
    print((o.read() + e.read()).decode("utf-8", "replace")[-5000:], flush=True)
    c.close()


if __name__ == "__main__":
    main()

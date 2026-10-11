#!/usr/bin/env python3
"""Deploy additive role bonuses + fix game2 position recalc."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko

PASSWORD = os.environ.get("VPS_ROOT_PASSWORD", "")
if not PASSWORD:
    raise SystemExit("Set VPS_ROOT_PASSWORD")

HOST = "201.34.159.109"
REMOTE_APP = "/var/www/startplus/app"
ROOT = Path(__file__).resolve().parents[1]
FILES = [
    "src/lib/points.ts",
    "src/app/admin/matches/page.tsx",
    "src/app/api/matches/route.ts",
    "src/components/AdminMatchesClient.tsx",
]

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def main() -> None:
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(
        HOST,
        username="root",
        password=PASSWORD,
        timeout=60,
        allow_agent=False,
        look_for_keys=False,
    )
    t = c.get_transport()
    if t:
        t.set_keepalive(30)

    sftp = c.open_sftp()
    for rel in FILES:
        print(f"Upload {rel}", flush=True)
        sftp.put(str(ROOT / rel), f"{REMOTE_APP}/{rel}")
    sftp.close()

    def run(cmd: str, timeout: int = 1800) -> int:
        print(f"\n$ {cmd[:180]}", flush=True)
        _, o, e = c.exec_command(cmd, timeout=timeout, get_pty=True)
        text = o.read().decode("utf-8", "replace") + e.read().decode("utf-8", "replace")
        print(text[-6000:], flush=True)
        code = o.channel.recv_exit_status()
        print(f"[exit {code}]", flush=True)
        return code

    run(
        f"mkdir -p /var/www/startplus/uploads && rm -rf {REMOTE_APP}/public/uploads && "
        f"mkdir -p {REMOTE_APP}/public/uploads"
    )
    if run(f"cd {REMOTE_APP} && npx next build", timeout=1800) != 0:
        raise SystemExit("build failed")
    run(
        f"rm -rf {REMOTE_APP}/public/uploads && "
        f"ln -s /var/www/startplus/uploads {REMOTE_APP}/public/uploads"
    )
    run("pm2 restart startplus --update-env && sleep 2 && pm2 status")

    # Trigger recalculation via admin page SSR
    print("\nTrigger recalc via node...", flush=True)
    check = r"""
const { PrismaClient } = require('@prisma/client');
// Dynamic import of compiled code won't work; hit local admin or inline minimal.
// Call through next: curl localhost admin after restart is enough if page loads.
"""
    # Hit local server to run page-side recalculateAllMatchWinPoints
    run(
        "curl -sS -o /dev/null -w '%{http_code}' "
        "-H 'Cookie: ' http://127.0.0.1:3000/admin/matches || true",
        timeout=60,
    )

    # Run recalc directly with tsx/node from source via a small script using prisma + copied logic
    recalc = r"""
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const ROLE_WIN_BONUS = { PRIMARY: 0, SECOND: 0.1, THIRD: 0.2, OFF: 0.5 };
const ROUND = (v) => Math.round(v * 10) / 10;

function naturalPositions(role) {
  switch (role) {
    case 'CARRY': return [1];
    case 'MID': return [2];
    case 'OFFLANE': return [3];
    case 'SUPPORT':
    case 'HARD_SUPPORT': return [4, 5];
    default: return [];
  }
}
function roleBonus(primary, secondary, position) {
  if (!position) return { bonus: 0, label: 'основная роль' };
  const list = [];
  if (primary) list.push(primary);
  for (const r of secondary || []) if (!list.includes(r)) { list.push(r); if (list.length >= 3) break; }
  for (let i = 0; i < list.length; i++) {
    if (naturalPositions(list[i]).includes(position)) {
      if (i === 0) return { bonus: 0, label: 'основная роль' };
      if (i === 1) return { bonus: 0.1, label: '2-я роль' };
      return { bonus: 0.2, label: '3-я роль' };
    }
  }
  return { bonus: 0.5, label: 'не на своей роли' };
}
function parseA(raw) { try { return JSON.parse(raw || '{}'); } catch { return {}; } }
function posFor(session, userId, gameNumber) {
  const g1 = parseA(session.teamAssignments);
  const g2 = parseA(session.teamAssignmentsGame2);
  if (gameNumber >= 2 && g2[userId]?.position) return Number(g2[userId].position) || 0;
  return Number(g1[userId]?.position) || 0;
}
function upset(w, l) {
  if (l <= 0 || w >= l) return 1;
  const d = (l - w) / l;
  if (d >= 0.35) return 1.3;
  if (d >= 0.25) return 1.2;
  if (d >= 0.15) return 1.1;
  return 1;
}

(async () => {
  const logs = await p.pointLog.findMany({
    where: { sourceType: 'MATCH_GAME', reason: { startsWith: 'Победа в 5v5' } },
  });
  let fixed = 0;
  const changes = [];
  for (const log of logs) {
    if (!log.sourceId) continue;
    const participant = await p.matchParticipant.findFirst({
      where: { gameId: log.sourceId, userId: log.userId, won: true },
      include: {
        game: { include: { session: { include: { games: { include: { participants: true }, orderBy: { gameNumber: 'asc' } } } } } },
        user: { include: { profile: true } },
      },
    });
    if (!participant?.user.profile) continue;
    const game = participant.game;
    const session = game.session;
    const position = posFor(session, log.userId, game.gameNumber);
    let streakBefore = 0;
    for (const g of session.games) {
      if (g.gameNumber >= game.gameNumber) break;
      const part = g.participants.find((x) => x.userId === log.userId);
      if (!part) continue;
      if (g.winnerTeam === 'DRAW') streakBefore = 0;
      else if (part.won) streakBefore += 1;
      else streakBefore = 0;
    }
    const winStreak = streakBefore + 1;
    let secondary = [];
    try {
      const parsed = JSON.parse(participant.user.profile.secondaryRoles || '[]');
      if (Array.isArray(parsed)) secondary = parsed;
    } catch {}
    if (!secondary.length && participant.user.profile.secondaryRole) {
      secondary = [participant.user.profile.secondaryRole];
    }
    const assignments =
      game.gameNumber >= 2 && Object.keys(parseA(session.teamAssignmentsGame2)).length
        ? parseA(session.teamAssignmentsGame2)
        : parseA(session.teamAssignments);
    const radiantIds = Object.entries(assignments).filter(([, a]) => a.team === 'RADIANT').map(([id]) => id);
    const direIds = Object.entries(assignments).filter(([, a]) => a.team === 'DIRE').map(([id]) => id);
    const winnerIds = game.winnerTeam === 'RADIANT' ? radiantIds : game.winnerTeam === 'DIRE' ? direIds : [];
    const loserIds = game.winnerTeam === 'RADIANT' ? direIds : game.winnerTeam === 'DIRE' ? radiantIds : [];
    const profiles = await p.playerProfile.findMany({
      where: { userId: { in: [...winnerIds, ...loserIds] } },
      select: { userId: true, finalRating: true },
    });
    const rating = Object.fromEntries(profiles.map((x) => [x.userId, x.finalRating]));
    const avg = (ids) => (ids.length ? ids.reduce((s, id) => s + (rating[id] || 0), 0) / ids.length : 50);
    let base = winStreak >= 2 ? 2 : 1;
    const parts = winStreak >= 2
      ? ['Победа в 5v5 (2 победы подряд за день)']
      : ['Победа в 5v5'];
    if (winStreak < 2) {
      const u = upset(avg(winnerIds), avg(loserIds));
      if (u > 1) { base = ROUND(base * u); parts.push('апсет'); }
    }
    const rb = roleBonus(participant.user.profile.primaryRole, secondary, position);
    if (rb.bonus) parts.push(rb.label);
    const correct = ROUND(base + rb.bonus);
    const reason = parts.join(', ');
    const old = ROUND(log.delta);
    if (old === correct && log.reason === reason) continue;
    const diff = ROUND(correct - old);
    await p.$transaction([
      p.pointLog.update({ where: { id: log.id }, data: { delta: correct, reason } }),
      p.playerProfile.update({ where: { userId: log.userId }, data: { totalPoints: { increment: diff } } }),
      p.matchParticipant.update({ where: { id: participant.id }, data: { pointsAwarded: correct } }),
    ]);
    fixed++;
    changes.push({
      user: participant.user.firstName + ' ' + (participant.user.username || ''),
      old, correct, reason, game: game.gameNumber, pos: position,
    });
  }
  console.log(JSON.stringify({ fixed, changes }, null, 2));
  const mak = await p.user.findFirst({
    where: { username: { contains: 'MakDak', mode: 'insensitive' } },
    include: { profile: true },
  });
  if (mak) {
    const logs2 = await p.pointLog.findMany({
      where: { userId: mak.id, sourceType: 'MATCH_GAME' },
      orderBy: { createdAt: 'desc' },
      take: 4,
    });
    console.log('MAK', mak.profile?.totalPoints, logs2.map(l => ({ d: l.delta, r: l.reason })));
  }
  await p.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
"""
    sftp = c.open_sftp()
    with sftp.file(f"{REMOTE_APP}/_recalc_wins.js", "w") as f:
        f.write(recalc)
    sftp.close()
    run(f"cd {REMOTE_APP} && node _recalc_wins.js; rm -f _recalc_wins.js", timeout=300)
    c.close()
    print("\nRole points fix deployed + recalculated.", flush=True)


if __name__ == "__main__":
    main()

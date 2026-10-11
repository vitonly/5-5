#!/usr/bin/env python3
"""Inspect MakDak recent match points and roles."""
from __future__ import annotations

import os
import sys

import paramiko

PASSWORD = os.environ.get("VPS_ROOT_PASSWORD", "")
if not PASSWORD:
    raise SystemExit("Set VPS_ROOT_PASSWORD")

HOST = "201.34.159.109"
REMOTE_APP = "/var/www/startplus/app"
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SCRIPT = r"""
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const u = await p.user.findFirst({
    where: {
      OR: [
        { firstName: { contains: 'Mak', mode: 'insensitive' } },
        { username: { contains: 'Mak', mode: 'insensitive' } },
      ],
    },
    include: { profile: true },
  });
  if (!u) { console.log('NOT FOUND'); return; }
  console.log('USER', JSON.stringify({
    id: u.id, name: u.firstName, username: u.username,
    primary: u.profile?.primaryRole,
    secondary: u.profile?.secondaryRole,
    secondaryRoles: u.profile?.secondaryRoles,
    points: u.profile?.totalPoints,
  }, null, 2));

  const logs = await p.pointLog.findMany({
    where: { userId: u.id, sourceType: 'MATCH_GAME' },
    orderBy: { createdAt: 'desc' },
    take: 15,
  });
  console.log('LOGS', JSON.stringify(logs.map(l => ({
    delta: l.delta, reason: l.reason, sourceId: l.sourceId, at: l.createdAt,
  })), null, 2));

  for (const l of logs.slice(0, 6)) {
    if (!l.sourceId) continue;
    const g = await p.matchGame.findUnique({
      where: { id: l.sourceId },
      include: {
        session: true,
        participants: { where: { userId: u.id } },
      },
    });
    if (!g) continue;
    const a1 = JSON.parse(g.session.teamAssignments || '{}');
    const a2 = JSON.parse(g.session.teamAssignmentsGame2 || '{}');
    console.log('GAME', g.gameNumber, g.winnerTeam, 'part', g.participants[0]);
    console.log('  g1 pos', a1[u.id]);
    console.log('  g2 pos', a2[u.id]);
  }
  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
"""


def main() -> None:
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", password=PASSWORD, timeout=60, allow_agent=False, look_for_keys=False)
    sftp = c.open_sftp()
    remote = f"{REMOTE_APP}/_check_mak.js"
    with sftp.file(remote, "w") as f:
        f.write(SCRIPT)
    sftp.close()
    _, o, e = c.exec_command(f"cd {REMOTE_APP} && node _check_mak.js; rm -f _check_mak.js", timeout=60)
    print(o.read().decode("utf-8", "replace"))
    err = e.read().decode("utf-8", "replace")
    if err.strip():
        print("ERR", err)
    c.close()


if __name__ == "__main__":
    main()

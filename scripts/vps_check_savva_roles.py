#!/usr/bin/env python3
"""Check Sav2a roles and latest match assignments on VPS."""
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
  const users = await p.user.findMany({
    where: {
      OR: [
        { firstName: { contains: 'Sav', mode: 'insensitive' } },
        { username: { contains: 'Sav', mode: 'insensitive' } },
        { lastName: { contains: 'Sav', mode: 'insensitive' } },
      ],
    },
    include: { profile: true },
  });
  console.log('USERS', JSON.stringify(users.map(u => ({
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    username: u.username,
    primary: u.profile?.primaryRole,
    secondary: u.profile?.secondaryRole,
    secondaryRoles: u.profile?.secondaryRoles,
    rating: u.profile?.finalRating,
  })), null, 2));

  const sessions = await p.matchSession.findMany({
    orderBy: { date: 'desc' },
    take: 3,
    select: {
      id: true,
      date: true,
      status: true,
      teamAssignments: true,
      teamAssignmentsGame2: true,
      radiantPlayerIds: true,
      direPlayerIds: true,
    },
  });
  for (const s of sessions) {
    console.log('\\nSESSION', s.id, s.date, s.status);
    console.log('g1', s.teamAssignments);
    console.log('g2', s.teamAssignmentsGame2);
  }
  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
"""


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
    sftp = c.open_sftp()
    remote = f"{REMOTE_APP}/_check_savva.js"
    with sftp.file(remote, "w") as f:
        f.write(SCRIPT)
    sftp.close()
    _, o, e = c.exec_command(
        f"cd {REMOTE_APP} && node _check_savva.js; rm -f _check_savva.js",
        timeout=60,
    )
    print(o.read().decode("utf-8", "replace"))
    err = e.read().decode("utf-8", "replace")
    if err:
        print("ERR", err)
    c.close()


if __name__ == "__main__":
    main()

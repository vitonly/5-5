#!/usr/bin/env python3
"""List all recent match win point logs after recalc."""
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
  const logs = await p.pointLog.findMany({
    where: { sourceType: 'MATCH_GAME', reason: { startsWith: 'Победа в 5v5' } },
    include: { user: { select: { firstName: true, username: true } } },
    orderBy: { createdAt: 'desc' },
  });
  console.log('count', logs.length);
  for (const l of logs) {
    console.log(
      l.createdAt.toISOString().slice(0,10),
      (l.user.firstName || '') + '/' + (l.user.username || ''),
      'delta=' + l.delta,
      '|',
      l.reason
    );
  }
  // Suspicious multiplicative leftovers: streak*1.1=2.2 with wrong meaning, 2.4, 3.0
  const sus = logs.filter(l => [2.2, 2.4, 3, 1.5].includes(l.delta) && l.reason.includes('подряд'));
  console.log('\\nSUSPICIOUS_STREAK', sus.map(l => ({
    u: l.user.username, d: l.delta, r: l.reason
  })));
  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
"""


def main() -> None:
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", password=PASSWORD, timeout=60, allow_agent=False, look_for_keys=False)
    sftp = c.open_sftp()
    with sftp.file(f"{REMOTE_APP}/_verify_wins.js", "w") as f:
        f.write(SCRIPT)
    sftp.close()
    _, o, e = c.exec_command(f"cd {REMOTE_APP} && node _verify_wins.js; rm -f _verify_wins.js", timeout=60)
    print(o.read().decode("utf-8", "replace"))
    err = e.read().decode("utf-8", "replace")
    if err.strip():
        print("ERR", err)
    c.close()


if __name__ == "__main__":
    main()

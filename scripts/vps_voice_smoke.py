#!/usr/bin/env python3
from __future__ import annotations

import os
import sys

import paramiko

PASSWORD = os.environ.get("VPS_ROOT_PASSWORD", "")
if not PASSWORD:
    raise SystemExit("Set VPS_ROOT_PASSWORD")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

CMD = r"""
set -e
cd /var/www/startplus/app
node <<'NODE'
const fs = require('fs');
const { SignJWT } = require('jose');
const { PrismaClient } = require('@prisma/client');
(async () => {
  const env = Object.fromEntries(
    fs.readFileSync('.env','utf8').split('\n')
      .map(l => l.trim()).filter(l => l && !l.startsWith('#') && l.includes('='))
      .map(l => { const i=l.indexOf('='); return [l.slice(0,i), l.slice(i+1).replace(/^"|"$/g,'')]; })
  );
  const prisma = new PrismaClient();
  const user = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } });
  const token = await new SignJWT({ userId: user.id })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode(env.JWT_SECRET));
  fs.writeFileSync('/tmp/voice_ck.txt', `dota_session=${token}`);
  console.log('ok', !!env.LIVEKIT_API_KEY, env.LIVEKIT_URL);
  await prisma.$disconnect();
})();
NODE
COOKIE=$(cat /tmp/voice_ck.txt)
echo "GET rooms"
curl -sS --max-time 15 -H "Cookie: $COOKIE" http://127.0.0.1:3000/api/voice/rooms | head -c 800; echo
echo "POST token voice-1"
curl -sS --max-time 15 -H "Cookie: $COOKIE" -H 'Content-Type: application/json' \
  -d '{"roomId":"voice-1"}' http://127.0.0.1:3000/api/voice/token | head -c 400; echo
echo "WSS port"
curl -skS -o /dev/null -w "wss8443=%{http_code} time=%{time_total}\n" --max-time 8 https://www.startdota.ru:8443/ || true
docker ps --format 'table {{.Names}}\t{{.Status}}' | head -5
"""


def main() -> None:
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(
        "201.34.159.109",
        username="root",
        password=PASSWORD,
        timeout=60,
        allow_agent=False,
        look_for_keys=False,
    )
    _, o, e = c.exec_command(CMD, timeout=120, get_pty=True)
    print((o.read() + e.read()).decode("utf-8", "replace"), flush=True)
    c.close()


if __name__ == "__main__":
    main()

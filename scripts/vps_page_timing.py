#!/usr/bin/env python3
"""Measure real authenticated dashboard TTFB on VPS."""
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
# make a short-lived login cookie via node using same JWT as app
node <<'NODE'
const fs = require('fs');
const crypto = require('crypto');
const env = Object.fromEntries(
  fs.readFileSync('.env','utf8').split('\n')
    .map(l => l.trim()).filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i=l.indexOf('='); return [l.slice(0,i), l.slice(i+1).replace(/^"|"$/g,'')]; })
);
const secret = env.JWT_SECRET;
async function main(){
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const user = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } });
  if (!user) { console.log('NO_ADMIN'); process.exit(1); }
  // Prefer app's createSession if available — else forge cookie via jose from node_modules
  let token;
  try {
    const { SignJWT } = require('jose');
    const key = new TextEncoder().encode(secret);
    token = await new SignJWT({ userId: user.id })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('10m')
      .sign(key);
  } catch (e) {
    console.error('jose fail', e);
    process.exit(1);
  }
  fs.writeFileSync('/tmp/sp_cookie.txt', `dota_session=${token}`);
  console.log('USER', user.id);
  await prisma.$disconnect();
}
main();
NODE

COOKIE=$(cat /tmp/sp_cookie.txt)
echo "cookie_len=${#COOKIE}"

for path in / /materials /match /profile; do
  curl -sS -o /tmp/body.html -w "path=${path} code=%{http_code} ttfb=%{time_starttransfer} total=%{time_total} size=%{size_download}\n" \
    --max-time 40 -H "Cookie: ${COOKIE}" "http://127.0.0.1:3000${path}" || echo "fail ${path}"
  head -c 120 /tmp/body.html | tr '\n' ' '; echo
done

# also time getLiveStreams path via node
node <<'NODE'
const start = Date.now();
(async () => {
  try {
    // dynamic import of built server chunks is hard; just time helix/token like app
    const fs = require('fs');
    const env = Object.fromEntries(
      fs.readFileSync('.env','utf8').split('\n')
        .map(l => l.trim()).filter(l => l && !l.startsWith('#') && l.includes('='))
        .map(l => { const i=l.indexOf('='); return [l.slice(0,i), l.slice(i+1).replace(/^"|"$/g,'')]; })
    );
    const t0 = Date.now();
    const tokRes = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${env.TWITCH_CLIENT_ID}&client_secret=${env.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST', signal: AbortSignal.timeout(10000) });
    console.log('token_status', tokRes.status, 'ms', Date.now()-t0);
    const body = await tokRes.text();
    console.log('token_body', body.slice(0,180));
  } catch (e) {
    console.log('token_err', String(e), 'ms', Date.now()-start);
  }
})();
NODE
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

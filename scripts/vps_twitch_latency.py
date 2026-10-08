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
CID=$(grep '^TWITCH_CLIENT_ID=' .env | cut -d= -f2- | tr -d '"')
SEC=$(grep '^TWITCH_CLIENT_SECRET=' .env | cut -d= -f2- | tr -d '"')
echo "token..."
TOK=$(curl -sS --max-time 8 -X POST "https://id.twitch.tv/oauth2/token?client_id=${CID}&client_secret=${SEC}&grant_type=client_credentials" -w "\nTOKEN_HTTP=%{http_code} TOKEN_TIME=%{time_total}\n" | tee /tmp/tw_tok.out | head -c 200)
echo
tail -n 1 /tmp/tw_tok.out
ACCESS=$(python3 -c "import json; print(json.load(open('/tmp/tw_tok.out')).get('access_token',''))" 2>/dev/null || true)
if [ -z "$ACCESS" ]; then echo NO_TOKEN; exit 0; fi
echo "helix..."
curl -sS --max-time 10 -H "Client-Id: $CID" -H "Authorization: Bearer $ACCESS" \
  "https://api.twitch.tv/helix/streams?user_login=yatoro_doto&user_login=otakerdota" \
  -o /tmp/tw_helix.json -w "HELIX_HTTP=%{http_code} HELIX_TIME=%{time_total}\n"
head -c 300 /tmp/tw_helix.json; echo
curl -sS --max-time 8 -o /dev/null -w "decapi=%{http_code} time=%{time_total}\n" "https://decapi.me/twitch/uptime/otakerdota" || echo decapi_fail
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
    _, o, e = c.exec_command(CMD, timeout=60, get_pty=True)
    print((o.read() + e.read()).decode("utf-8", "replace"), flush=True)
    c.close()


if __name__ == "__main__":
    main()

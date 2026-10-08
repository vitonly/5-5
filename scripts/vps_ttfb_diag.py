#!/usr/bin/env python3
from __future__ import annotations

import os
import sys

import paramiko

PASSWORD = os.environ.get("VPS_ROOT_PASSWORD", "")
if not PASSWORD:
    raise SystemExit("Set VPS_ROOT_PASSWORD")

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

CMDS = [
    'curl -sS -o /dev/null -w "local_home=%{http_code} ttfb=%{time_starttransfer} total=%{time_total}\\n" --max-time 40 -b /tmp/sp.ck -c /tmp/sp.ck http://127.0.0.1:3000/ || true',
    'curl -sS -o /dev/null -w "local_login=%{http_code} ttfb=%{time_starttransfer} total=%{time_total}\\n" --max-time 20 http://127.0.0.1:3000/login || true',
    'curl -sS -o /dev/null -w "local_mat=%{http_code} ttfb=%{time_starttransfer} total=%{time_total}\\n" --max-time 40 http://127.0.0.1:3000/materials || true',
    'curl -skS -o /dev/null -w "pub_login=%{http_code} ttfb=%{time_starttransfer} total=%{time_total}\\n" --max-time 20 https://www.startdota.ru/login || true',
    'grep -E "^(TWITCH_CLIENT_ID|TWITCH_CLIENT_SECRET)=" /var/www/startplus/app/.env | sed "s/=.*/=***/"',
    "ls /var/www/startplus/app/src/lib/twitch.ts; wc -l /var/www/startplus/app/src/lib/twitch.ts",
]


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
    for cmd in CMDS:
        print(f"\n===== {cmd[:100]} =====", flush=True)
        _, o, e = c.exec_command(cmd, timeout=90, get_pty=True)
        print((o.read() + e.read()).decode("utf-8", "replace")[-4000:], flush=True)
    c.close()


if __name__ == "__main__":
    main()

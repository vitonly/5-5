#!/usr/bin/env python3
"""Check outbound connectivity from VPS to Telegram API."""
from __future__ import annotations

import os
import sys

import paramiko

PASSWORD = os.environ.get("VPS_ROOT_PASSWORD", "")
if not PASSWORD:
    raise SystemExit("Set VPS_ROOT_PASSWORD")

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

CMDS = [
    'curl -sS -o /dev/null -w "tg_api=%{http_code} time=%{time_total}\\n" --max-time 25 https://api.telegram.org/ || echo tg_fail',
    'curl -4 -sS -o /dev/null -w "tg_api4=%{http_code} time=%{time_total}\\n" --max-time 25 https://api.telegram.org/ || echo tg4_fail',
    "getent hosts api.telegram.org || true",
    'curl -sS -o /dev/null -w "google=%{http_code} time=%{time_total}\\n" --max-time 10 https://www.google.com/ || echo google_fail',
    'curl -sS -o /dev/null -w "cloudflare=%{http_code} time=%{time_total}\\n" --max-time 10 https://cloudflare.com/ || echo cf_fail',
    "ip route | head -5; curl -sS --max-time 5 ifconfig.me || true; echo",
    (
        "cd /var/www/startplus/app && "
        "TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' .env | cut -d= -f2- | tr -d '\"') && "
        'curl -sS --max-time 30 "https://api.telegram.org/bot${TOKEN}/getMe"; echo; '
        'curl -sS --max-time 30 "https://api.telegram.org/bot${TOKEN}/getWebhookInfo"; echo'
    ),
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
        text = o.read().decode("utf-8", "replace") + e.read().decode("utf-8", "replace")
        print(text[-5000:], flush=True)
    c.close()


if __name__ == "__main__":
    main()

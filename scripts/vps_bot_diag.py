#!/usr/bin/env python3
"""Diagnose Telegram bot / app on VPS."""
from __future__ import annotations

import os
import sys

import paramiko

HOST = "201.34.159.109"
PASSWORD = os.environ.get("VPS_ROOT_PASSWORD", "")
if not PASSWORD:
    raise SystemExit("Set VPS_ROOT_PASSWORD")

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

CMDS = [
    "pm2 list",
    "curl -sS -o /dev/null -w 'local_login_http=%{http_code} time=%{time_total}\\n' --max-time 15 http://127.0.0.1:3000/login || echo local_fail",
    "curl -sS -o /dev/null -w 'public_https=%{http_code} time=%{time_total}\\n' --max-time 20 https://www.startdota.ru/login || echo public_fail",
    "free -h; uptime; df -h / | tail -1",
    r"""cd /var/www/startplus/app && TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' .env | cut -d= -f2- | tr -d '"') && curl -sS --max-time 20 "https://api.telegram.org/bot${TOKEN}/getWebhookInfo" """,
    "pm2 logs startplus --lines 120 --nostream",
]


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

    for cmd in CMDS:
        print(f"\n===== {cmd[:120]} =====", flush=True)
        _, o, e = c.exec_command(cmd, timeout=120, get_pty=True)
        text = o.read().decode("utf-8", "replace") + e.read().decode("utf-8", "replace")
        print(text[-8000:], flush=True)
        print(f"[exit {o.channel.recv_exit_status()}]", flush=True)

    c.close()


if __name__ == "__main__":
    main()

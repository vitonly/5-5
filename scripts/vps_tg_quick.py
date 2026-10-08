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
TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' .env | cut -d= -f2- | tr -d '"')
echo "=== outbound telegram ==="
curl -sS -o /tmp/tg_me.json -w "getMe http=%{http_code} time=%{time_total}\n" --max-time 12 \
  "https://api.telegram.org/bot${TOKEN}/getMe" || echo "getMe FAIL"
head -c 200 /tmp/tg_me.json; echo
curl -sS -o /tmp/tg_wh.json -w "webhook http=%{http_code} time=%{time_total}\n" --max-time 12 \
  "https://api.telegram.org/bot${TOKEN}/getWebhookInfo" || echo "webhook FAIL"
head -c 500 /tmp/tg_wh.json; echo
echo "=== pm2 ==="
pm2 list | head -20
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
    _, o, e = c.exec_command(CMD, timeout=90, get_pty=True)
    print((o.read() + e.read()).decode("utf-8", "replace"), flush=True)
    c.close()


if __name__ == "__main__":
    main()

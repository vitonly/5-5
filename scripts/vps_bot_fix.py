#!/usr/bin/env python3
"""Fix / probe Telegram webhook on VPS."""
from __future__ import annotations

import os
import sys
import time
from datetime import datetime, timezone

import paramiko

HOST = "201.34.159.109"
PASSWORD = os.environ.get("VPS_ROOT_PASSWORD", "")
if not PASSWORD:
    raise SystemExit("Set VPS_ROOT_PASSWORD")

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def run(c: paramiko.SSHClient, cmd: str, timeout: int = 120) -> tuple[int, str]:
    print(f"\n$ {cmd[:160]}", flush=True)
    _, o, e = c.exec_command(cmd, timeout=timeout, get_pty=True)
    text = o.read().decode("utf-8", "replace") + e.read().decode("utf-8", "replace")
    code = o.channel.recv_exit_status()
    print(text[-5000:], flush=True)
    print(f"[exit {code}]", flush=True)
    return code, text


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

    # Decode last_error_date from previous getWebhookInfo
    print("last_error_date 1790987707 ->", datetime.fromtimestamp(1790987707, tz=timezone.utc), flush=True)

    run(
        c,
        "curl -sS -o /tmp/wh_probe_body.txt -w 'webhook_probe http=%{http_code} time=%{time_total}\\n' "
        "--max-time 25 -X POST https://www.startdota.ru/api/telegram/webhook "
        "-H 'Content-Type: application/json' -d '{\"update_id\":1}' ; "
        "head -c 400 /tmp/wh_probe_body.txt; echo",
    )

    run(
        c,
        "curl -sS -o /tmp/wh_local.txt -w 'local_webhook http=%{http_code} time=%{time_total}\\n' "
        "--max-time 25 -X POST http://127.0.0.1:3000/api/telegram/webhook "
        "-H 'Content-Type: application/json' -d '{\"update_id\":1}' ; "
        "head -c 400 /tmp/wh_local.txt; echo",
    )

    # Restart app + re-set webhook
    run(c, "pm2 restart startplus && sleep 3 && pm2 list")

    run(
        c,
        r"""cd /var/www/startplus/app
TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' .env | cut -d= -f2- | tr -d '"')
SECRET=$(grep '^TELEGRAM_WEBHOOK_SECRET=' .env | cut -d= -f2- | tr -d '"')
CRON=$(grep '^CRON_SECRET=' .env | cut -d= -f2- | tr -d '"')
echo "token_len=${#TOKEN} secret_len=${#SECRET}"
# local setup endpoint
if [ -n "$CRON" ]; then
  curl -sS --max-time 30 -X POST -H "Authorization: Bearer $CRON" http://127.0.0.1:3000/api/telegram/setup-webhook
  echo
fi
# force setWebhook with secret if present
if [ -n "$TOKEN" ]; then
  if [ -n "$SECRET" ]; then
    curl -sS --max-time 30 "https://api.telegram.org/bot${TOKEN}/setWebhook" \
      -H 'Content-Type: application/json' \
      -d "{\"url\":\"https://www.startdota.ru/api/telegram/webhook\",\"secret_token\":\"${SECRET}\",\"drop_pending_updates\":true}"
  else
    curl -sS --max-time 30 "https://api.telegram.org/bot${TOKEN}/setWebhook" \
      -H 'Content-Type: application/json' \
      -d '{"url":"https://www.startdota.ru/api/telegram/webhook","drop_pending_updates":true}'
  fi
  echo
  sleep 1
  curl -sS --max-time 20 "https://api.telegram.org/bot${TOKEN}/getWebhookInfo"
  echo
fi
""",
        timeout=90,
    )

    # After restart, probe again with secret if needed
    run(
        c,
        r"""cd /var/www/startplus/app
SECRET=$(grep '^TELEGRAM_WEBHOOK_SECRET=' .env | cut -d= -f2- | tr -d '"')
HDR=()
if [ -n "$SECRET" ]; then HDR=(-H "X-Telegram-Bot-Api-Secret-Token: $SECRET"); fi
curl -sS -o /tmp/wh2.txt -w 'probe2 http=%{http_code} time=%{time_total}\n' --max-time 25 \
  -X POST https://www.startdota.ru/api/telegram/webhook \
  -H 'Content-Type: application/json' "${HDR[@]}" \
  -d '{"update_id":2,"message":{"message_id":1,"date":1,"chat":{"id":1,"type":"private"},"text":"ping","from":{"id":1,"is_bot":false,"first_name":"t"}}}'
head -c 500 /tmp/wh2.txt; echo
pm2 logs startplus --lines 30 --nostream
""",
        timeout=90,
    )

    c.close()
    print("\nDone.", flush=True)


if __name__ == "__main__":
    main()

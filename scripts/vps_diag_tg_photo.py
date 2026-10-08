#!/usr/bin/env python3
"""Diagnose why Telegram invite photos fail (URL vs multipart)."""
from __future__ import annotations

import os
import sys

import paramiko

PASSWORD = os.environ.get("VPS_ROOT_PASSWORD", "")
if not PASSWORD:
    raise SystemExit("Set VPS_ROOT_PASSWORD")

HOST = "201.34.159.109"
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

REMOTE = r"""
set -e
cd /var/www/startplus/app
FILE=$(ls -t /var/www/startplus/uploads/*meme* 2>/dev/null | head -1)
echo "FILE=$FILE"
file "$FILE" || true
ls -la "$FILE"
BN=$(basename "$FILE")
URL="https://www.startdota.ru/uploads/$BN"
echo "URL=$URL"
curl -sS -o /dev/null -w "public_http=%{http_code} size=%{size_download} type=%{content_type}\n" --max-time 20 "$URL" || true

TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' .env | cut -d= -f2- | tr -d '"')
BASE=$(grep '^TELEGRAM_API_BASE=' .env | cut -d= -f2- | tr -d '"')
SECRET=$(grep '^TELEGRAM_PROXY_SECRET=' .env | cut -d= -f2- | tr -d '"')
CHATID=$(sudo -u postgres psql -d startplus -tAc 'select "telegramChatId" from "User" where role='"'"'ADMIN'"'"' and "telegramChatId" is not null limit 1' | tr -d '[:space:]')
echo "CHATID=$CHATID"
echo "BASE=$BASE"
API="${BASE:-https://api.telegram.org}/bot${TOKEN}/sendPhoto"
echo "API_HOST=$(echo "$API" | cut -d/ -f3)"

HDR=()
if [ -n "$SECRET" ]; then
  HDR=(-H "X-Telegram-Proxy-Secret: $SECRET")
fi

echo "=== sendPhoto by URL ==="
curl -sS --max-time 30 "${HDR[@]}" -X POST "$API" \
  -H 'Content-Type: application/json' \
  --data-binary @- <<EOF
{"chat_id":"$CHATID","photo":"$URL","caption":"photo url test"}
EOF
echo

echo "=== sendPhoto multipart ==="
curl -sS --max-time 60 "${HDR[@]}" -X POST "$API" \
  -F "chat_id=$CHATID" \
  -F "photo=@$FILE" \
  -F "caption=multipart photo test"
echo
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
    _, o, e = c.exec_command(REMOTE, timeout=120, get_pty=True)
    print(o.read().decode("utf-8", "replace"))
    err = e.read().decode("utf-8", "replace")
    if err.strip():
        print(err)
    c.close()


if __name__ == "__main__":
    main()

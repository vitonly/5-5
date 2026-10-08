#!/usr/bin/env python3
"""Wire Cloudflare Telegram proxy into VPS app .env, rebuild, setWebhook."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko

PASSWORD = os.environ.get("VPS_ROOT_PASSWORD", "")
PROXY_BASE = os.environ.get(
    "TELEGRAM_API_BASE", "https://startplus-tg-proxy.startdota-startplus.workers.dev"
).rstrip("/")
PROXY_SECRET = os.environ.get("TELEGRAM_PROXY_SECRET", "").strip()
if not PASSWORD:
    raise SystemExit("Set VPS_ROOT_PASSWORD")
if not PROXY_SECRET:
    # local file written during wrangler secret generation
    secret_file = Path(__file__).resolve().parents[1] / "workers" / "telegram-proxy" / ".proxy_secret"
    if secret_file.is_file():
        PROXY_SECRET = secret_file.read_text(encoding="utf-8").strip()
if not PROXY_SECRET:
    raise SystemExit("Set TELEGRAM_PROXY_SECRET or create workers/telegram-proxy/.proxy_secret")

HOST = "201.34.159.109"
REMOTE_APP = "/var/www/startplus/app"
ROOT = Path(__file__).resolve().parents[1]

FILES = [
    "src/lib/telegram-api.ts",
    "src/lib/telegram.ts",
    "src/lib/telegram-bot.ts",
    "src/app/api/telegram/setup-webhook/route.ts",
]

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


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

    sftp = c.open_sftp()
    for rel in FILES:
        print(f"Upload {rel}", flush=True)
        remote = f"{REMOTE_APP}/{rel}"
        remote_dir = "/".join(remote.split("/")[:-1])
        _, o, _ = c.exec_command(f"mkdir -p '{remote_dir}'", timeout=30)
        o.channel.recv_exit_status()
        sftp.put(str(ROOT / rel), remote)
    sftp.close()

    def run(cmd: str, timeout: int = 1800) -> int:
        print(f"\n$ {cmd[:180]}", flush=True)
        _, o, e = c.exec_command(cmd, timeout=timeout, get_pty=True)
        print((o.read() + e.read()).decode("utf-8", "replace")[-7000:], flush=True)
        return o.channel.recv_exit_status()

    # Patch .env
    run(
        f"""
set -e
ENV={REMOTE_APP}/.env
touch "$ENV"
for key in TELEGRAM_API_BASE TELEGRAM_PROXY_SECRET; do
  grep -v "^${{key}}=" "$ENV" > /tmp/env.tmp || true
  mv /tmp/env.tmp "$ENV"
done
cat >> "$ENV" <<EOF
TELEGRAM_API_BASE="{PROXY_BASE}"
TELEGRAM_PROXY_SECRET="{PROXY_SECRET}"
EOF
echo "proxy env:"
grep -E '^TELEGRAM_API_BASE=|^TELEGRAM_PROXY_SECRET=' "$ENV" | sed 's/SECRET=.*/SECRET=***/'
"""
    )

    # Quick proxy smoke from VPS
    run(
        f"""
curl -sS --max-time 15 "{PROXY_BASE}/health" || true
echo
TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' {REMOTE_APP}/.env | cut -d= -f2- | tr -d '"')
SECRET=$(grep '^TELEGRAM_PROXY_SECRET=' {REMOTE_APP}/.env | cut -d= -f2- | tr -d '"')
curl -sS --max-time 20 -H "X-Telegram-Proxy-Secret: $SECRET" \
  "{PROXY_BASE}/bot${{TOKEN}}/getMe" | head -c 300
echo
"""
    )

    run(
        f"mkdir -p /var/www/startplus/uploads && rm -rf {REMOTE_APP}/public/uploads && "
        f"mkdir -p {REMOTE_APP}/public/uploads"
    )
    if run(f"cd {REMOTE_APP} && npx next build", timeout=1800) != 0:
        run(f"rm -rf {REMOTE_APP}/.next")
        if run(f"cd {REMOTE_APP} && npx next build", timeout=1800) != 0:
            raise SystemExit("build failed")
    run(
        f"rm -rf {REMOTE_APP}/public/uploads && "
        f"ln -s /var/www/startplus/uploads {REMOTE_APP}/public/uploads"
    )
    run("pm2 restart startplus --update-env && sleep 2")

    # setWebhook via app
    run(
        f"""
CRON=$(grep '^CRON_SECRET=' {REMOTE_APP}/.env | cut -d= -f2- | tr -d '"')
curl -sS --max-time 30 -X POST -H "Authorization: Bearer $CRON" \
  http://127.0.0.1:3000/api/telegram/setup-webhook
echo
"""
    )

    c.close()
    print("\nTelegram proxy configured.", flush=True)
    print(f"Worker: {PROXY_BASE}", flush=True)


if __name__ == "__main__":
    main()

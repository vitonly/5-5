#!/usr/bin/env python3
"""Install LiveKit voice stack on Timeweb VPS and wire Next.js env + nginx :8443."""
from __future__ import annotations

import os
import secrets
import string
import sys
from pathlib import Path

import paramiko

PASSWORD = os.environ.get("VPS_ROOT_PASSWORD", "")
if not PASSWORD:
    raise SystemExit("Set VPS_ROOT_PASSWORD")

HOST = "201.34.159.109"
REMOTE_APP = "/var/www/startplus/app"
REMOTE_LK = "/var/www/startplus/livekit"
ROOT = Path(__file__).resolve().parents[1]

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def gen_secret(n: int = 40) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(n))


def run(c: paramiko.SSHClient, cmd: str, timeout: int = 600) -> tuple[int, str]:
    print(f"\n$ {cmd[:200]}", flush=True)
    _, o, e = c.exec_command(cmd, timeout=timeout, get_pty=True)
    text = o.read().decode("utf-8", "replace") + e.read().decode("utf-8", "replace")
    print(text[-5000:], flush=True)
    code = o.channel.recv_exit_status()
    print(f"[exit {code}]", flush=True)
    return code, text


def main() -> None:
    api_key = "spk_" + gen_secret(16)
    api_secret = gen_secret(40)

    # Prefer pyyaml if available; else write YAML manually
    livekit_yaml = f"""port: 7880
bind_addresses:
  - ""

rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 50050
  use_external_ip: true

redis:
  address: 127.0.0.1:6379

keys:
  {api_key}: {api_secret}

logging:
  level: info

room:
  empty_timeout: 3600
  max_participants: 5
  auto_create: true
"""

    compose = (ROOT / "deploy" / "livekit" / "docker-compose.yml").read_text(encoding="utf-8")

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

    run(c, f"mkdir -p {REMOTE_LK}")

    sftp = c.open_sftp()
    with sftp.file(f"{REMOTE_LK}/docker-compose.yml", "w") as f:
        f.write(compose)
    with sftp.file(f"{REMOTE_LK}/livekit.yaml", "w") as f:
        f.write(livekit_yaml)
    sftp.close()

    # Docker engine + compose plugin
    run(
        c,
        "command -v docker >/dev/null || "
        "(curl -fsSL https://get.docker.com | sh && systemctl enable --now docker)",
        timeout=600,
    )
    run(c, "docker --version; docker compose version || docker-compose --version")

    run(c, f"cd {REMOTE_LK} && docker compose pull && docker compose up -d", timeout=600)
    run(c, "sleep 2; ss -lntu | grep -E '7880|7881|50000|6379' || true; docker ps --format 'table {{.Names}}\\t{{.Status}}'")

    # Firewall
    run(
        c,
        "if command -v ufw >/dev/null; then "
        "ufw allow 8443/tcp; ufw allow 7881/tcp; ufw allow 50000:50050/udp; ufw status | head -30; "
        "else "
        "iptables -C INPUT -p tcp --dport 8443 -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport 8443 -j ACCEPT; "
        "iptables -C INPUT -p tcp --dport 7881 -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport 7881 -j ACCEPT; "
        "iptables -C INPUT -p udp --dport 50000:50050 -j ACCEPT 2>/dev/null || iptables -I INPUT -p udp --dport 50000:50050 -j ACCEPT; "
        "fi",
    )

    nginx_extra = r"""
# LiveKit signaling (WSS) — START+ voice
server {
    listen 8443 ssl;
    listen [::]:8443 ssl;
    http2 on;
    server_name startdota.ru www.startdota.ru;
    client_max_body_size 4m;

    ssl_certificate /etc/letsencrypt/live/startdota.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/startdota.ru/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / {
        proxy_pass http://127.0.0.1:7880;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
"""
    sftp = c.open_sftp()
    with sftp.file("/etc/nginx/sites-available/livekit-voice", "w") as f:
        f.write(nginx_extra)
    sftp.close()
    run(
        c,
        "ln -sfn /etc/nginx/sites-available/livekit-voice /etc/nginx/sites-enabled/livekit-voice; "
        "nginx -t && systemctl reload nginx",
    )

    # Patch app .env
    run(
        c,
        f"""
set -e
ENV={REMOTE_APP}/.env
touch "$ENV"
for key in LIVEKIT_URL LIVEKIT_INTERNAL_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET NEXT_PUBLIC_LIVEKIT_URL; do
  grep -v "^${{key}}=" "$ENV" > /tmp/env.tmp || true
  mv /tmp/env.tmp "$ENV"
done
cat >> "$ENV" <<EOF
LIVEKIT_URL="wss://www.startdota.ru:8443"
LIVEKIT_INTERNAL_URL="http://127.0.0.1:7880"
LIVEKIT_API_KEY="{api_key}"
LIVEKIT_API_SECRET="{api_secret}"
NEXT_PUBLIC_LIVEKIT_URL="wss://www.startdota.ru:8443"
EOF
echo "--- livekit env ---"
grep '^LIVEKIT_\\|^NEXT_PUBLIC_LIVEKIT_' "$ENV" | sed 's/SECRET=.*/SECRET=***/;s/KEY=.*/KEY=***/'
""",
    )

    # Smoke: LiveKit HTTP
    run(c, "curl -sS -o /dev/null -w 'lk_local=%{http_code} time=%{time_total}\\n' --max-time 5 http://127.0.0.1:7880/ || true")

    print("\nLiveKit keys generated (also written to app .env). Redeploy/rebuild Next next.", flush=True)
    print(f"API_KEY={api_key}", flush=True)
    c.close()


if __name__ == "__main__":
    main()

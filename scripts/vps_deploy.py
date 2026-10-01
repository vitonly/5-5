#!/usr/bin/env python3
"""Deploy START+ to Timeweb VPS. Do not commit secrets."""
from __future__ import annotations

import base64
import io
import os
import sys
import tarfile
import time
from pathlib import Path
from urllib.parse import quote_plus

import paramiko

HOST = "201.34.159.109"
USER = "root"
PASSWORD = os.environ.get("VPS_ROOT_PASSWORD", "")
if not PASSWORD:
    raise SystemExit("Set VPS_ROOT_PASSWORD env var")
REMOTE_APP = "/var/www/startplus/app"
_PG_PASS = os.environ.get("VPS_PG_PASSWORD", "")
if not _PG_PASS:
    raise SystemExit("Set VPS_PG_PASSWORD env var")
PG_URL = f"postgresql://startplus:{quote_plus(_PG_PASS)}@127.0.0.1:5432/startplus"
ROOT = Path(__file__).resolve().parents[1]

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def connect() -> paramiko.SSHClient:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        HOST,
        username=USER,
        password=PASSWORD,
        timeout=60,
        banner_timeout=60,
        auth_timeout=60,
        allow_agent=False,
        look_for_keys=False,
    )
    t = client.get_transport()
    if t:
        t.set_keepalive(30)
    return client


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 1800) -> tuple[int, str]:
    print(f"\n$ {cmd[:180]}{'...' if len(cmd) > 180 else ''}", flush=True)
    try:
        _, stdout, stderr = client.exec_command(cmd, timeout=timeout, get_pty=True)
    except Exception as e:
        print(f"SSH error, reconnecting: {e}", flush=True)
        client.close()
        client = connect()
        _, stdout, stderr = client.exec_command(cmd, timeout=timeout, get_pty=True)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    text = out + (("\n" + err) if err.strip() else "")
    if text:
        safe = text[-5000:] if len(text) > 5000 else text
        print(safe.encode("ascii", "replace").decode("ascii"), flush=True)
    print(f"[exit {code}]", flush=True)
    return code, text


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def make_tarball() -> bytes:
    buf = io.BytesIO()
    exclude_dirs = {"node_modules", ".next", ".git", ".vercel", "scripts", "public/uploads"}
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for path in ROOT.rglob("*"):
            if not path.is_file():
                continue
            rel = path.relative_to(ROOT).as_posix()
            if any(rel == d or rel.startswith(d + "/") for d in exclude_dirs):
                continue
            if rel == ".env" or rel.startswith(".env."):
                continue
            tar.add(path, arcname=rel)
    return buf.getvalue()


def main():
    env = load_env()
    # Local .env may be sqlite; production Neon URL is Sensitive on Vercel.
    # Prefer optional .env.neon or ENV NEON_DATABASE_URL for migration.
    neon = (
        os.environ.get("NEON_DATABASE_URL")
        or ""
    ).strip()
    neon_file = ROOT / ".env.neon"
    if not neon and neon_file.exists():
        for line in neon_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("DATABASE_URL="):
                neon = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not neon:
        cand = env.get("DATABASE_URL", "").strip()
        if cand.startswith("postgres"):
            neon = cand

    print("Connecting...", flush=True)
    client = connect()
    sftp = client.open_sftp()

    print("Uploading code...", flush=True)
    tgz = make_tarball()
    with sftp.file("/tmp/startplus.tgz", "wb") as f:
        f.write(tgz)

    run(client, f"rm -rf {REMOTE_APP} && mkdir -p {REMOTE_APP} && tar -xzf /tmp/startplus.tgz -C {REMOTE_APP}")
    run(
        client,
        f"mkdir -p /var/www/startplus/uploads && rm -rf {REMOTE_APP}/public/uploads && "
        f"ln -s /var/www/startplus/uploads {REMOTE_APP}/public/uploads",
    )

    remote_env = {
        "DATABASE_URL": PG_URL,
        "JWT_SECRET": env.get("JWT_SECRET", "change-me"),
        "TELEGRAM_BOT_TOKEN": env.get("TELEGRAM_BOT_TOKEN", ""),
        "NEXT_PUBLIC_BOT_USERNAME": env.get("NEXT_PUBLIC_BOT_USERNAME", ""),
        "ADMIN_TELEGRAM_IDS": env.get("ADMIN_TELEGRAM_IDS", ""),
        "NEXT_PUBLIC_APP_URL": "https://www.startdota.ru",
        "CRON_SECRET": env.get("CRON_SECRET", "cron-secret-change-me-16chars"),
        "TWITCH_CLIENT_ID": env.get("TWITCH_CLIENT_ID", ""),
        "TWITCH_CLIENT_SECRET": env.get("TWITCH_CLIENT_SECRET", ""),
        "NODE_ENV": "production",
        "PORT": "3000",
    }
    body = "\n".join(f'{k}="{v}"' for k, v in remote_env.items()) + "\n"
    with sftp.file(f"{REMOTE_APP}/.env", "w") as f:
        f.write(body)

    print("npm ci...", flush=True)
    code, _ = run(client, f"cd {REMOTE_APP} && npm ci")
    if code != 0:
        run(client, f"cd {REMOTE_APP} && npm install")

    run(client, f"cd {REMOTE_APP} && npx prisma generate")

    if neon.startswith("postgres"):
        print("Dump Neon -> restore local PG...", flush=True)
        b64 = base64.b64encode(neon.encode("utf-8")).decode("ascii")
        run(client, f"echo {b64} | base64 -d > /tmp/neon_url.txt && wc -c /tmp/neon_url.txt")
        code, _ = run(
            client,
            "set -e; NEON=$(tr -d '\\r\\n' < /tmp/neon_url.txt); "
            "echo \"URL len=${#NEON}\"; "
            "pg_dump \"$NEON\" --no-owner --no-acl -F c -f /tmp/neon.dump; "
            "ls -lh /tmp/neon.dump; "
            "rm -f /tmp/neon_url.txt",
            timeout=1800,
        )
        if code == 0:
            run(
                client,
                f"pg_restore --clean --if-exists --no-owner --no-acl -d \"{PG_URL}\" /tmp/neon.dump; echo restore_done",
                timeout=1800,
            )
        else:
            print("Dump failed, schema-only push", flush=True)
    else:
        print("No Neon URL — schema-only for now", flush=True)

    # remove old neon_url block that was earlier - already removed by replacing dump section
    # Ensure the earlier duplicate base64 block is gone from file
    run(client, f"cd {REMOTE_APP} && npx prisma db push --accept-data-loss")

    print("Building...", flush=True)
    code, _ = run(client, f"cd {REMOTE_APP} && npm run build", timeout=1800)
    if code != 0:
        raise SystemExit("Build failed")

    run(client, "pm2 delete startplus || true")
    run(client, f"cd {REMOTE_APP} && pm2 start npm --name startplus -- start && pm2 save")
    run(client, "pm2 startup systemd -u root --hp /root 2>/dev/null | tail -n 1 | bash || true")

    # Keep HTTPS if cert exists; never wipe SSL on redeploy
    nginx = f"""
server {{
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name startdota.ru www.startdota.ru {HOST} _;
    client_max_body_size 12m;

    location /.well-known/acme-challenge/ {{
        root /var/www/html;
    }}

    location / {{
        return 301 https://$host$request_uri;
    }}
}}

server {{
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name startdota.ru www.startdota.ru;
    client_max_body_size 12m;

    ssl_certificate /etc/letsencrypt/live/startdota.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/startdota.ru/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location /uploads/ {{
        alias /var/www/startplus/uploads/;
        access_log off;
        expires 7d;
    }}

    location / {{
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_cache_bypass $http_upgrade;
    }}
}}
"""
    _, cert_check = run(
        client,
        "test -f /etc/letsencrypt/live/startdota.ru/fullchain.pem && echo HAS_CERT || echo NO_CERT",
    )
    if "HAS_CERT" in cert_check:
        with sftp.file("/etc/nginx/sites-available/startplus", "w") as f:
            f.write(nginx)
        run(
            client,
            "ln -sfn /etc/nginx/sites-available/startplus /etc/nginx/sites-enabled/startplus; "
            "rm -f /etc/nginx/sites-enabled/default; nginx -t && systemctl reload nginx",
        )
    else:
        print("No SSL cert yet — leaving nginx as-is", flush=True)

    time.sleep(3)
    run(
        client,
        "pm2 status; curl -sI -m 15 http://127.0.0.1:3000 | head -n 12; "
        "curl -skI -m 15 https://127.0.0.1/login | head -n 12",
    )

    sftp.close()
    client.close()
    print("\nDeploy finished.", flush=True)


if __name__ == "__main__":
    main()

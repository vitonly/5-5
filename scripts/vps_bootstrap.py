#!/usr/bin/env python3
"""Remote SSH helper for Timeweb VPS setup. Do not commit passwords."""
import os
import sys
import paramiko

HOST = "201.34.159.109"
USER = "root"
PASSWORD = os.environ.get("VPS_ROOT_PASSWORD", "")
if not PASSWORD:
    raise SystemExit("Set VPS_ROOT_PASSWORD env var")
PG_PASS = os.environ.get("VPS_PG_PASSWORD", "")
if not PG_PASS:
    raise SystemExit("Set VPS_PG_PASSWORD env var")

# Avoid Windows console Unicode crashes
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 900) -> int:
    print(f"\n$ {cmd}", flush=True)
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout, get_pty=True)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    text = (out or "") + (("\n" + err) if err.strip() else "")
    if text:
        safe = text[-5000:] if len(text) > 5000 else text
        print(safe.encode("ascii", "replace").decode("ascii"), flush=True)
    print(f"[exit {code}]", flush=True)
    return code


def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting to {HOST}...", flush=True)
    client.connect(
        HOST,
        username=USER,
        password=PASSWORD,
        timeout=60,
        allow_agent=False,
        look_for_keys=False,
    )
    print("Connected.", flush=True)

    # Escape single quotes for SQL string literal
    sql_pass = PG_PASS.replace("'", "''")

    cmds = [
        "export DEBIAN_FRONTEND=noninteractive; apt-get update -y",
        "export DEBIAN_FRONTEND=noninteractive; apt-get install -y curl ca-certificates gnupg ufw git nginx certbot python3-certbot-nginx postgresql postgresql-contrib build-essential",
        "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -",
        "export DEBIAN_FRONTEND=noninteractive; apt-get install -y nodejs",
        "node -v; npm -v",
        "npm install -g pm2",
        "ufw allow OpenSSH; ufw allow 'Nginx Full'; ufw --force enable; ufw status",
        "sudo -u postgres psql -c \"SELECT 1\" ",
        (
            "sudo -u postgres psql -c \"DO \\$\\$ BEGIN IF NOT EXISTS "
            "(SELECT FROM pg_roles WHERE rolname = 'startplus') THEN "
            f"CREATE ROLE startplus LOGIN PASSWORD '{sql_pass}'; END IF; END \\$\\$;\""
        ),
        "sudo -u postgres psql -c \"SELECT 1 FROM pg_database WHERE datname='startplus'\" | grep -q 1 || sudo -u postgres psql -c \"CREATE DATABASE startplus OWNER startplus;\"",
        "mkdir -p /var/www/startplus/uploads /var/www/startplus/app",
        "nginx -v; psql --version; node -v; pm2 -v",
    ]

    failed = []
    for c in cmds:
        code = run(client, c)
        if code != 0:
            failed.append((c[:60], code))

    client.close()
    print("\nBootstrap finished. Failed:", failed, flush=True)


if __name__ == "__main__":
    main()

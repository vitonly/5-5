#!/usr/bin/env python3
"""Migrate Neon DB -> VPS Postgres. Requires VPS_ROOT_PASSWORD."""
from __future__ import annotations

import base64
import os
import sys
from pathlib import Path
from urllib.parse import quote_plus

import paramiko

HOST = "201.34.159.109"
USER = "root"
PASSWORD = os.environ.get("VPS_ROOT_PASSWORD", "")
_PG_PASS = os.environ.get("VPS_PG_PASSWORD", "")
if not _PG_PASS:
    raise SystemExit("Set VPS_PG_PASSWORD")
PG_URL = f"postgresql://startplus:{quote_plus(_PG_PASS)}@127.0.0.1:5432/startplus"
ROOT = Path(__file__).resolve().parents[1]

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def load_neon() -> str:
    p = ROOT / ".env.neon"
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith("DATABASE_URL="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("No DATABASE_URL in .env.neon")


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 1800) -> int:
    print(f"\n$ {cmd[:160]}...", flush=True)
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout, get_pty=True)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    text = out + (("\n" + err) if err.strip() else "")
    if text:
        print(text[-4000:].encode("ascii", "replace").decode("ascii"), flush=True)
    print(f"[exit {code}]", flush=True)
    return code


def main():
    if not PASSWORD:
        raise SystemExit("Set VPS_ROOT_PASSWORD")
    neon = load_neon()
    # prefer direct host (no -pooler) for pg_dump
    neon = neon.replace("-pooler.", ".")
    neon = neon.replace("&channel_binding=require", "").replace("channel_binding=require&", "").replace("?channel_binding=require", "?")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=60, allow_agent=False, look_for_keys=False)
    t = client.get_transport()
    if t:
        t.set_keepalive(30)

    b64 = base64.b64encode(neon.encode()).decode("ascii")
    run(client, f"echo {b64} | base64 -d > /tmp/neon_url.txt && wc -c /tmp/neon_url.txt")
    code = run(
        client,
        "set -e; NEON=$(tr -d '\\r\\n' < /tmp/neon_url.txt); "
        "echo len=${#NEON}; "
        "pg_dump \"$NEON\" --no-owner --no-acl -F c -f /tmp/neon.dump; "
        "ls -lh /tmp/neon.dump; rm -f /tmp/neon_url.txt",
    )
    if code != 0:
        raise SystemExit("pg_dump failed")

    run(
        client,
        f"pg_restore --clean --if-exists --no-owner --no-acl -d \"{PG_URL}\" /tmp/neon.dump; echo RESTORE_DONE",
    )
    # ensure schema matches app
    run(client, "cd /var/www/startplus/app && npx prisma db push --accept-data-loss")
    run(client, "pm2 restart startplus && sleep 2 && curl -sI -m 10 http://127.0.0.1:3000 | head -n 8")
    # quick count
    run(
        client,
        f"psql \"{PG_URL}\" -c \"SELECT count(*) AS users FROM \\\"User\\\"; SELECT count(*) AS points FROM \\\"PointLog\\\";\"",
    )

    client.close()
    print("\nMigration finished.", flush=True)


if __name__ == "__main__":
    main()

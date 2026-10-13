#!/usr/bin/env python3
from __future__ import annotations

import os
import sys

import paramiko

PASSWORD = os.environ["VPS_ROOT_PASSWORD"]
PG = os.environ["VPS_PG_PASSWORD"]
sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 120) -> str:
    print(f"\n$ {cmd[:160]}", flush=True)
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout, get_pty=True)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    text = out + (("\n" + err) if err.strip() else "")
    print(text[-6000:].encode("ascii", "replace").decode("ascii"), flush=True)
    print(f"[exit {code}]", flush=True)
    return text


c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(
    "201.34.159.109",
    username="root",
    password=PASSWORD,
    timeout=30,
    allow_agent=False,
    look_for_keys=False,
)
t = c.get_transport()
if t:
    t.set_keepalive(15)

run(
    c,
    f"PGPASSWORD='{PG}' psql -h 127.0.0.1 -U startplus -d startplus -At "
    "-c \"SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename ILIKE '%eplay%';\"",
)
run(
    c,
    f"PGPASSWORD='{PG}' psql -h 127.0.0.1 -U startplus -d startplus -c "
    "'SELECT COUNT(*) FROM \"MatchReplay\";'",
)
run(
    c,
    f"PGPASSWORD='{PG}' psql -h 127.0.0.1 -U startplus -d startplus -c "
    "'SELECT id, \"gameNumber\", \"dotaMatchId\", \"durationSec\", \"createdAt\" "
    "FROM \"MatchReplay\" ORDER BY \"createdAt\" DESC LIMIT 5;'",
)
run(c, "journalctl -u startplus-parser -n 30 --no-pager")
c.close()

#!/usr/bin/env python3
from __future__ import annotations

import os
import sys

import paramiko

PASSWORD = os.environ.get("VPS_ROOT_PASSWORD", "")
if not PASSWORD:
    raise SystemExit("Set VPS_ROOT_PASSWORD")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

CMDS = [
    'grep -E "^(BLOB_|UPLOADS_)" /var/www/startplus/app/.env | sed "s/=.*/=***/"',
    "ls -la /var/www/startplus/uploads | head -8",
    "ls -la /var/www/startplus/app/public/uploads | head -8",
    "stat -c '%F %N' /var/www/startplus/app/public/uploads || true",
]


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
    for cmd in CMDS:
        print(f"\n===== {cmd[:100]} =====", flush=True)
        _, o, e = c.exec_command(cmd, timeout=30, get_pty=True)
        print((o.read() + e.read()).decode("utf-8", "replace")[-3000:], flush=True)
    c.close()


if __name__ == "__main__":
    main()

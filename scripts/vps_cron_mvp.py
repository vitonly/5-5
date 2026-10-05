#!/usr/bin/env python3
"""Restore hourly automation cron on VPS."""
from __future__ import annotations

import os
import sys

import paramiko

PASSWORD = os.environ.get("VPS_ROOT_PASSWORD", "")
if not PASSWORD:
    raise SystemExit("Set VPS_ROOT_PASSWORD")

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

LINE = (
    '15 * * * * curl -fsS -H "Authorization: Bearer dota5x5-cron-local-secret" '
    "https://www.startdota.ru/api/cron/automation >/dev/null 2>&1"
)


def main() -> None:
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
    sftp = c.open_sftp()
    with sftp.file("/tmp/startplus.cron", "w") as f:
        f.write(LINE + "\n")
    sftp.close()

    _, o, e = c.exec_command(
        "crontab /tmp/startplus.cron && crontab -l && echo OK",
        timeout=30,
        get_pty=True,
    )
    print(o.read().decode("utf-8", "replace"), flush=True)
    err = e.read().decode("utf-8", "replace")
    if err.strip():
        print(err, flush=True)
    c.close()


if __name__ == "__main__":
    main()

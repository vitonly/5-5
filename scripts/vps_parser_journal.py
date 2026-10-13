#!/usr/bin/env python3
from __future__ import annotations

import os
import sys

import paramiko

PASSWORD = os.environ["VPS_ROOT_PASSWORD"]
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

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
_, stdout, _ = c.exec_command(
    "journalctl -u startplus-parser --since '2026-10-13 04:50:00' --until '2026-10-13 04:56:00' --no-pager",
    timeout=60,
    get_pty=True,
)
print(stdout.read().decode("utf-8", errors="replace")[-10000:].encode("ascii", "replace").decode("ascii"))
_, stdout, _ = c.exec_command(
    "systemctl is-active startplus-parser; curl -sS http://127.0.0.1:5600/health; "
    "grep ExecStart /etc/systemd/system/startplus-parser.service",
    timeout=30,
    get_pty=True,
)
print(stdout.read().decode("utf-8", errors="replace"))
c.close()

#!/usr/bin/env python3
"""Restore LiveKit yaml keys from app .env and enable remote unmute."""
from __future__ import annotations

import os
import sys

import paramiko

PASSWORD = os.environ.get("VPS_ROOT_PASSWORD", "")
if not PASSWORD:
    raise SystemExit("Set VPS_ROOT_PASSWORD")

HOST = "201.34.159.109"
REMOTE_APP = "/var/www/startplus/app"
REMOTE_LK = "/var/www/startplus/livekit"

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

    _, o, _ = c.exec_command(
        f"grep -E '^LIVEKIT_API_(KEY|SECRET)=' {REMOTE_APP}/.env", timeout=30
    )
    env = o.read().decode("utf-8", "replace")
    key = ""
    secret = ""
    for line in env.splitlines():
        if line.startswith("LIVEKIT_API_KEY="):
            key = line.split("=", 1)[1].strip().strip('"').strip("'")
        if line.startswith("LIVEKIT_API_SECRET="):
            secret = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not key or not secret:
        raise SystemExit("LIVEKIT keys missing in app .env")

    yaml = f"""port: 7880
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
  {key}: {secret}

logging:
  level: info

room:
  empty_timeout: 3600
  max_participants: 5
  auto_create: true
  enable_remote_unmute: true
"""
    sftp = c.open_sftp()
    with sftp.file(f"{REMOTE_LK}/livekit.yaml", "w") as f:
        f.write(yaml)
    sftp.close()
    print("wrote livekit.yaml key_prefix=", key[:8], flush=True)

    _, o, e = c.exec_command(
        f"cd {REMOTE_LK} && docker compose up -d --force-recreate",
        timeout=300,
        get_pty=True,
    )
    print((o.read() + e.read()).decode("utf-8", "replace")[-2000:], flush=True)
    code = o.channel.recv_exit_status()
    _, o2, _ = c.exec_command(
        f"grep enable_remote_unmute {REMOTE_LK}/livekit.yaml; "
        f"grep -E '^  spk_|^  [a-zA-Z]' {REMOTE_LK}/livekit.yaml | head -3 | sed 's/: .*/: ***/'",
        timeout=30,
    )
    print(o2.read().decode("utf-8", "replace"), flush=True)
    c.close()
    if code != 0:
        raise SystemExit(code)
    print("ok", flush=True)


if __name__ == "__main__":
    main()

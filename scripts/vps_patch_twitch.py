#!/usr/bin/env python3
"""Upload twitch.ts fix, rebuild, restart PM2. Do not commit secrets."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko

PASSWORD = os.environ.get("VPS_ROOT_PASSWORD", "")
if not PASSWORD:
    raise SystemExit("Set VPS_ROOT_PASSWORD")

HOST = "201.34.159.109"
REMOTE_APP = "/var/www/startplus/app"
LOCAL = Path(__file__).resolve().parents[1] / "src" / "lib" / "twitch.ts"

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def main() -> None:
    if not LOCAL.is_file():
        raise SystemExit(f"Missing {LOCAL}")

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
    remote = f"{REMOTE_APP}/src/lib/twitch.ts"
    print(f"Upload {LOCAL} -> {remote}", flush=True)
    sftp.put(str(LOCAL), remote)
    sftp.close()

    cmds = [
        f"grep -n 'isDecapiLiveUptime\\|hasHelix\\|cache: \"no-store\"' {remote} | head -20",
        f"cd {REMOTE_APP} && npm run build",
        "pm2 restart startplus && sleep 2 && pm2 status",
    ]
    for cmd in cmds:
        print(f"\n$ {cmd[:160]}", flush=True)
        _, o, e = c.exec_command(cmd, timeout=1800, get_pty=True)
        text = o.read().decode("utf-8", "replace") + e.read().decode("utf-8", "replace")
        print(text[-6000:], flush=True)
        code = o.channel.recv_exit_status()
        print(f"[exit {code}]", flush=True)
        if code != 0:
            raise SystemExit(f"Command failed: {cmd}")

    c.close()
    print("\nPatch deployed.", flush=True)


if __name__ == "__main__":
    main()

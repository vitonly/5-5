#!/usr/bin/env python3
"""Upload screenshot-import scripts to VPS and run dry-run / --apply."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko

HOST = "201.34.159.109"
PASSWORD = os.environ.get("VPS_ROOT_PASSWORD", "")
REMOTE_APP = "/var/www/startplus/app"
ROOT = Path(__file__).resolve().parents[1]

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

if not PASSWORD:
    raise SystemExit("Set VPS_ROOT_PASSWORD")


def run(c: paramiko.SSHClient, cmd: str, timeout: int = 600) -> tuple[int, str]:
    print(f"\n$ {cmd}", flush=True)
    _, stdout, stderr = c.exec_command(cmd, timeout=timeout, get_pty=True)
    text = stdout.read().decode("utf-8", errors="replace") + stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    print(text, flush=True)
    print(f"[exit {code}]", flush=True)
    return code, text


def main() -> None:
    apply = "--apply" in sys.argv
    # default 26.09; override: python ... 2026-10-03 [--apply]
    date = "2026-09-26"
    for a in sys.argv[1:]:
        if a != "--apply" and not a.startswith("-"):
            date = a
            break
    json_rel = f"scripts/data/screenshot-replays-{date}.json"

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
    sftp = c.open_sftp()
    run(c, f"mkdir -p {REMOTE_APP}/scripts/data")
    for rel in (
        "scripts/import-screenshot-replays.ts",
        "scripts/purge-rating-achievements.ts",
        json_rel,
    ):
        local = ROOT / rel
        if not local.exists():
            print(f"skip missing {rel}", flush=True)
            continue
        remote = f"{REMOTE_APP}/{rel.replace(chr(92), '/')}"
        print(f"upload {rel} -> {remote}", flush=True)
        sftp.put(str(local), remote)
    sftp.close()

    run(c, f"cd {REMOTE_APP} && npx --yes tsx --version", timeout=120)

    flag = " --apply" if apply else ""
    code, _ = run(
        c,
        f"cd {REMOTE_APP} && npx --yes tsx scripts/import-screenshot-replays.ts {json_rel}{flag}",
        timeout=600,
    )
    c.close()
    raise SystemExit(code)


if __name__ == "__main__":
    main()

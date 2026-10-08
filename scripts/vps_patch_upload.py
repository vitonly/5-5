#!/usr/bin/env python3
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
ROOT = Path(__file__).resolve().parents[1]
FILES = [
    "src/lib/upload-client.ts",
    "src/app/api/upload/route.ts",
]

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
    t = c.get_transport()
    if t:
        t.set_keepalive(30)

    sftp = c.open_sftp()
    for rel in FILES:
        print(f"Upload {rel}", flush=True)
        sftp.put(str(ROOT / rel), f"{REMOTE_APP}/{rel}")
    sftp.close()

    def run(cmd: str, timeout: int = 1800) -> int:
        print(f"\n$ {cmd[:160]}", flush=True)
        _, o, e = c.exec_command(cmd, timeout=timeout, get_pty=True)
        print((o.read() + e.read()).decode("utf-8", "replace")[-7000:], flush=True)
        return o.channel.recv_exit_status()

    # Drop leftover Blob token if any
    run(
        f"grep -v '^BLOB_READ_WRITE_TOKEN=' {REMOTE_APP}/.env > /tmp/env.noblob && "
        f"mv /tmp/env.noblob {REMOTE_APP}/.env; "
        f"grep -E '^(UPLOADS_|BLOB_)' {REMOTE_APP}/.env | sed 's/=.*/=***/' || true"
    )

    run(
        f"mkdir -p /var/www/startplus/uploads && rm -rf {REMOTE_APP}/public/uploads && "
        f"mkdir -p {REMOTE_APP}/public/uploads"
    )
    if run(f"cd {REMOTE_APP} && npx next build", timeout=1800) != 0:
        run(f"rm -rf {REMOTE_APP}/.next")
        if run(f"cd {REMOTE_APP} && npx next build", timeout=1800) != 0:
            raise SystemExit("build failed")
    run(
        f"rm -rf {REMOTE_APP}/public/uploads && "
        f"ln -s /var/www/startplus/uploads {REMOTE_APP}/public/uploads"
    )
    run("pm2 restart startplus --update-env")
    c.close()
    print("\nUpload fix deployed.", flush=True)


if __name__ == "__main__":
    main()

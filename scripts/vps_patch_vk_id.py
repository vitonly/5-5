#!/usr/bin/env python3
"""Upload VK ID auth files, prisma db push, rebuild, restart."""
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
    "prisma/schema.prisma",
    "deploy/vk-id/README.md",
    "src/lib/vk-auth.ts",
    "src/lib/session.ts",
    "src/lib/telegram-bot.ts",
    "src/app/api/auth/vk/start/route.ts",
    "src/app/api/auth/vk/callback/route.ts",
    "src/app/api/profile/route.ts",
    "src/app/api/students/route.ts",
    "src/app/login/page.tsx",
    "src/components/TelegramConnect.tsx",
    "src/components/AdminStudentsClient.tsx",
    "scripts/vps_deploy.py",
]

VK_ENV_KEYS = (
    "VK_CLIENT_ID",
    "VK_CLIENT_SECRET",
    "VK_SERVICE_TOKEN",
    "NEXT_PUBLIC_VK_CLIENT_ID",
    "ADMIN_VK_IDS",
)

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def load_local_env() -> dict[str, str]:
    env: dict[str, str] = {}
    path = ROOT / ".env"
    if not path.is_file():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        if "=" not in line or line.strip().startswith("#"):
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def merge_remote_env(client: paramiko.SSHClient, sftp: paramiko.SFTPClient, local: dict[str, str]) -> None:
    remote_path = f"{REMOTE_APP}/.env"
    lines: list[str] = []
    try:
        with sftp.file(remote_path, "r") as ef:
            lines = ef.read().decode("utf-8", "replace").splitlines()
    except OSError:
        lines = []

    existing: dict[str, str] = {}
    order: list[str] = []
    for line in lines:
        if "=" not in line or line.strip().startswith("#"):
            continue
        k, v = line.split("=", 1)
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k not in existing:
            order.append(k)
        existing[k] = v

    for key in VK_ENV_KEYS:
        val = local.get(key) or existing.get(key, "")
        if key == "NEXT_PUBLIC_VK_CLIENT_ID" and not val:
            val = local.get("VK_CLIENT_ID") or existing.get("VK_CLIENT_ID", "")
        if key not in existing:
            order.append(key)
        existing[key] = val

    body = "\n".join(f'{k}="{existing[k]}"' for k in order) + "\n"
    with sftp.file(remote_path, "w") as f:
        f.write(body)
    print("Merged VK env keys into remote .env", flush=True)


def main() -> None:
    local_env = load_local_env()
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
        local = ROOT / rel
        remote = f"{REMOTE_APP}/{rel}"
        if not local.is_file():
            raise SystemExit(f"Missing {local}")
        remote_dir = "/".join(remote.split("/")[:-1])
        _, o, _ = c.exec_command(f"mkdir -p '{remote_dir}'", timeout=30)
        o.channel.recv_exit_status()
        print(f"Upload {rel}", flush=True)
        sftp.put(str(local), remote)

    merge_remote_env(c, sftp, local_env)
    sftp.close()

    def run(cmd: str, timeout: int = 1800) -> int:
        print(f"\n$ {cmd[:180]}", flush=True)
        _, o, e = c.exec_command(cmd, timeout=timeout, get_pty=True)
        text = o.read().decode("utf-8", "replace") + e.read().decode("utf-8", "replace")
        print(text[-7000:], flush=True)
        code = o.channel.recv_exit_status()
        print(f"[exit {code}]", flush=True)
        return code

    if run(f"cd {REMOTE_APP} && npx prisma generate && npx prisma db push --accept-data-loss", timeout=300) != 0:
        raise SystemExit("prisma failed")

    run(
        f"mkdir -p /var/www/startplus/uploads && rm -rf {REMOTE_APP}/public/uploads && "
        f"mkdir -p {REMOTE_APP}/public/uploads"
    )
    if run(f"cd {REMOTE_APP} && npx next build", timeout=1800) != 0:
        raise SystemExit("build failed")
    run(
        f"rm -rf {REMOTE_APP}/public/uploads && "
        f"ln -s /var/www/startplus/uploads {REMOTE_APP}/public/uploads"
    )
    run("pm2 restart startplus --update-env && sleep 2 && pm2 status")
    c.close()
    print("\nVK ID auth deployed.", flush=True)


if __name__ == "__main__":
    main()

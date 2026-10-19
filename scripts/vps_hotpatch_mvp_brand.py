#!/usr/bin/env python3
"""Hotpatch MVP tie UI, dota 2 branding, light PWA icons."""
from __future__ import annotations

import sys
from pathlib import Path

import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

KEY = Path.home() / ".ssh" / "id_ed25519_startdota"
ROOT = Path(__file__).resolve().parents[1]
REMOTE = "/var/www/startplus/app"

FILES = [
    "src/app/layout.tsx",
    "src/app/manifest.ts",
    "src/app/privacy/page.tsx",
    "src/app/(dashboard)/page.tsx",
    "src/components/Navbar.tsx",
    "src/components/home/LastMatchCard.tsx",
    "public/pwa/icon-192.png",
    "public/pwa/icon-512.png",
    "public/pwa/maskable-512.png",
    "public/pwa/apple-touch-icon.png",
    "public/brand/start-plus-icon.png",
]


def main() -> None:
    pkey = paramiko.Ed25519Key.from_private_key_file(str(KEY))
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(
        "201.34.159.109",
        username="root",
        pkey=pkey,
        allow_agent=False,
        look_for_keys=False,
        timeout=60,
    )
    t = c.get_transport()
    if t:
        t.set_keepalive(30)

    sftp = c.open_sftp()
    for rel in FILES:
        local = ROOT / rel
        print("upload", rel, flush=True)
        # ensure remote dirs
        remote_path = f"{REMOTE}/{rel}"
        parts = remote_path.rsplit("/", 1)[0]
        c.exec_command(f"mkdir -p {parts}")
        sftp.put(str(local), remote_path)
    sftp.close()

    _, o, e = c.exec_command(
        f"cd {REMOTE} && npm run build > /tmp/mvpbrand.log 2>&1; echo BUILD:$?; "
        "grep -n 'очень сильные пацаны' src/components/home/LastMatchCard.tsx | head -2; "
        "grep -n 'dota 2 education' src/components/Navbar.tsx | head -2; "
        "pm2 restart startplus && pm2 save",
        timeout=900,
        get_pty=True,
    )
    print((o.read() + e.read()).decode("utf-8", "replace")[-4000:], flush=True)
    c.close()


if __name__ == "__main__":
    main()

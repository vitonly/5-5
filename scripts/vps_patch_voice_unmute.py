#!/usr/bin/env python3
"""Enable LiveKit remote unmute + redeploy voice admin mute fix."""
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
REMOTE_LK = "/var/www/startplus/livekit"
ROOT = Path(__file__).resolve().parents[1]

FILES = [
    "src/lib/livekit.ts",
    "src/app/api/voice/admin/route.ts",
    "src/components/voice/VoiceDock.tsx",
    "scripts/vps_livekit_up.py",
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

    def run(cmd: str, timeout: int = 1800) -> int:
        print(f"\n$ {cmd[:180]}", flush=True)
        _, o, e = c.exec_command(cmd, timeout=timeout, get_pty=True)
        text = o.read().decode("utf-8", "replace") + e.read().decode("utf-8", "replace")
        print(text[-5000:], flush=True)
        code = o.channel.recv_exit_status()
        print(f"[exit {code}]", flush=True)
        return code

    # Patch livekit.yaml in place (keep keys)
    patch = r"""
python3 - <<'PY'
from pathlib import Path
import re
p = Path("/var/www/startplus/livekit/livekit.yaml")
text = p.read_text(encoding="utf-8")
if re.search(r"enable_remote_unmute\s*:", text):
    text = re.sub(r"enable_remote_unmute\s*:\s*\w+", "enable_remote_unmute: true", text)
elif "auto_create: true" in text:
    text = text.replace("auto_create: true", "auto_create: true\n  enable_remote_unmute: true")
elif "room:" in text:
    text = text.replace("room:", "room:\n  enable_remote_unmute: true", 1)
else:
    text += "\nroom:\n  enable_remote_unmute: true\n"
p.write_text(text, encoding="utf-8")
print(p.read_text(encoding="utf-8"))
PY
"""
    if run(patch, timeout=60) != 0:
        raise SystemExit("yaml patch failed")

    if run(f"cd {REMOTE_LK} && docker compose up -d --force-recreate", timeout=300) != 0:
        raise SystemExit("livekit recreate failed")

    sftp = c.open_sftp()
    for rel in FILES:
        local = ROOT / rel
        remote = f"{REMOTE_APP}/{rel}" if not rel.startswith("deploy/") and not rel.startswith("scripts/") else f"/var/www/startplus/{rel.replace('deploy/', '').replace('scripts/', 'app/scripts/') if False else ''}"
        # Always put app files under REMOTE_APP for src/*; deploy/livekit under REMOTE_LK parent
        if rel.startswith("src/") or rel.startswith("scripts/"):
            remote = f"{REMOTE_APP}/{rel}"
        elif rel.startswith("deploy/livekit/"):
            remote = f"{REMOTE_LK}/{Path(rel).name}"
        else:
            remote = f"{REMOTE_APP}/{rel}"
        remote_dir = "/".join(remote.split("/")[:-1])
        _, o, _ = c.exec_command(f"mkdir -p '{remote_dir}'", timeout=30)
        o.channel.recv_exit_status()
        print(f"Upload {rel} -> {remote}", flush=True)
        sftp.put(str(local), remote)
    sftp.close()

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
    run(f"cd {REMOTE_LK} && docker compose ps")
    c.close()
    print("\nRemote unmute enabled.", flush=True)


if __name__ == "__main__":
    main()

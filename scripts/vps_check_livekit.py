#!/usr/bin/env python3
from __future__ import annotations

import os
import sys

import paramiko

PASSWORD = os.environ.get("VPS_ROOT_PASSWORD", "")
if not PASSWORD:
    raise SystemExit("Set VPS_ROOT_PASSWORD")

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

CMD = r"""
set -e
echo '=== docker ==='
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null | head -20 || echo no_docker
echo '=== livekit dir ==='
ls -la /var/www/startplus/livekit 2>/dev/null || echo no_livekit_dir
echo '=== env ==='
grep -E '^LIVEKIT_|^NEXT_PUBLIC_LIVEKIT' /var/www/startplus/app/.env 2>/dev/null | sed 's/SECRET=.*/SECRET=***/;s/\(KEY=\).*/\1***/' || echo no_env
echo '=== ports ==='
ss -lntu | grep -E '7880|7881|8443|6379' || echo no_ports
echo '=== nginx ==='
test -f /etc/nginx/sites-enabled/livekit-voice && echo nginx_lk_ok || echo nginx_lk_missing
echo '=== app files ==='
test -f /var/www/startplus/app/src/components/voice/VoiceDock.tsx && echo voice_app_ok || echo voice_app_missing
test -f /var/www/startplus/app/src/lib/livekit.ts && echo livekit_lib_ok || echo livekit_lib_missing
"""


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
    _, o, e = c.exec_command(CMD, timeout=60, get_pty=True)
    print((o.read() + e.read()).decode("utf-8", "replace"), flush=True)
    c.close()


if __name__ == "__main__":
    main()

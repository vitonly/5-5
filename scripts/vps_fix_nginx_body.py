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
for f in /etc/nginx/sites-available/startplus /etc/nginx/sites-available/livekit-voice; do
  [ -f "$f" ] || continue
  python3 - <<'PY' "$f"
import re, sys
path = sys.argv[1]
text = open(path, encoding="utf-8").read()
text2 = re.sub(r"client_max_body_size\s*\d+[mM];+", "client_max_body_size 64m;", text)
open(path, "w", encoding="utf-8").write(text2)
print(path)
for i, line in enumerate(text2.splitlines(), 1):
    if "client_max_body_size" in line:
        print(f"  {i}: {line.strip()}")
PY
done
nginx -t && systemctl reload nginx && echo NGINX_OK
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
    code = o.channel.recv_exit_status()
    c.close()
    if code != 0:
        raise SystemExit(code)


if __name__ == "__main__":
    main()

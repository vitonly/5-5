#!/usr/bin/env python3
"""
Закрепить версию LiveKit на сервере: в /var/www/startplus/livekit/docker-compose.yml
вместо livekit/livekit-server:latest ставится конкретная версия (как в deploy/livekit/docker-compose.yml).

Сам сервер голоса НЕ перезапускается: меняется только файл настроек, и при следующем
`docker compose up -d` запустится именно эта версия, а не «самая новая» с непредсказуемыми изменениями.

Запуск:
  python scripts/vps_livekit_pin.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko

HOST = "201.34.159.109"
SSH_KEY = Path(os.environ.get("VPS_SSH_KEY", str(Path.home() / ".ssh" / "id_ed25519_startdota")))
VERSION = "v1.13.9"   # версия, которая сейчас работает на сервере
COMPOSE = "/var/www/startplus/livekit/docker-compose.yml"

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def main() -> None:
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", timeout=30, allow_agent=False, look_for_keys=False,
              pkey=paramiko.Ed25519Key.from_private_key_file(str(SSH_KEY)))
    cmd = (
        f"cp {COMPOSE} {COMPOSE}.bak && "
        f"sed -i 's#livekit/livekit-server:latest#livekit/livekit-server:{VERSION}#' {COMPOSE} && "
        f"grep -n 'livekit-server:' {COMPOSE} && "
        "docker exec livekit-livekit-1 /livekit-server --version"
    )
    _, o, e = c.exec_command(cmd, timeout=60)
    code = o.channel.recv_exit_status()
    print(o.read().decode("utf-8", "replace") + e.read().decode("utf-8", "replace"))
    c.close()
    if code != 0:
        raise SystemExit(f"Ошибка (код {code})")


if __name__ == "__main__":
    main()

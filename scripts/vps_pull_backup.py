#!/usr/bin/env python3
"""
Скачать самую свежую копию базы сайта с VPS к себе на компьютер.

Копия сохраняется в папку «Бэкапы СТАРТ+» в Документах (не в папку проекта —
в базе личные данные учеников, ей нечего делать рядом с кодом и в git).

Восстановить базу из копии (если случится беда) — только вместе с разработчиком:
  pg_restore --clean --if-exists --no-owner -d "<адрес базы>" файл.dump

Запуск:
  python scripts/vps_pull_backup.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko

HOST = "201.34.159.109"
SSH_KEY = Path(os.environ.get("VPS_SSH_KEY", str(Path.home() / ".ssh" / "id_ed25519_startdota")))
REMOTE_DIR = "/var/backups/startplus"
LOCAL_DIR = Path.home() / "Documents" / "Бэкапы СТАРТ+"

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def main() -> None:
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", timeout=30, allow_agent=False, look_for_keys=False,
              pkey=paramiko.Ed25519Key.from_private_key_file(str(SSH_KEY)))
    sftp = c.open_sftp()
    dumps = sorted(
        (a for a in sftp.listdir_attr(REMOTE_DIR) if a.filename.endswith(".dump")),
        key=lambda a: a.st_mtime,
    )
    if not dumps:
        raise SystemExit("На сервере ещё нет копий базы")
    latest = dumps[-1]
    LOCAL_DIR.mkdir(parents=True, exist_ok=True)
    target = LOCAL_DIR / latest.filename
    sftp.get(f"{REMOTE_DIR}/{latest.filename}", str(target))
    sftp.close()
    c.close()
    print(f"Скачано: {target} ({target.stat().st_size // 1024} КБ)")


if __name__ == "__main__":
    main()

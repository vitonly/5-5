#!/usr/bin/env python3
"""
Ежедневный бэкап базы сайта на VPS.

Ставит на сервер скрипт /usr/local/bin/startplus-backup.sh и задачу cron:
каждый день в 04:00 по Москве делается копия базы (pg_dump) в /var/backups/startplus/daily-<дата>.dump.
Хранятся копии за последние 14 дней — более старые ежедневные копии удаляются автоматически.

Копии лежат на том же сервере — от поломки самого сервера они не спасут.
Поэтому время от времени скачивайте свежую копию к себе: python scripts/vps_pull_backup.py

Запуск (с компьютера, где лежит SSH-ключ от VPS):
  python scripts/vps_backup_setup.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko

HOST = "201.34.159.109"
SSH_KEY = Path(os.environ.get("VPS_SSH_KEY", str(Path.home() / ".ssh" / "id_ed25519_startdota")))
RUNNER = "/usr/local/bin/startplus-backup.sh"

# Скрипт на сервере. Пароль базы берётся из .env сайта в момент запуска — в cron его нет.
RUNNER_SH = r"""#!/bin/sh
# Ежедневная копия базы сайта СТАРТ+ (храним 14 дней)
set -e
DIR=/var/backups/startplus
mkdir -p "$DIR" && chmod 700 "$DIR"
URL=$(grep '^DATABASE_URL=' /var/www/startplus/app/.env | cut -d= -f2- | tr -d '"')
FILE="$DIR/daily-$(date +%Y%m%d).dump"
pg_dump "$URL" -F c -f "$FILE.part"
mv "$FILE.part" "$FILE"
chmod 600 "$FILE"
# Удаляем только старые ежедневные копии (копии перед изменением схемы не трогаем)
find "$DIR" -name 'daily-*.dump' -mtime +14 -delete
"""

# Сервер живёт по UTC: 01:00 UTC = 04:00 по Москве
CRON_LINE = f"0 1 * * * {RUNNER} >/var/log/startplus-backup.log 2>&1"

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def main() -> None:
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", timeout=30, allow_agent=False, look_for_keys=False,
              pkey=paramiko.Ed25519Key.from_private_key_file(str(SSH_KEY)))
    sftp = c.open_sftp()
    with sftp.file(RUNNER, "w") as f:
        f.write(RUNNER_SH)
    sftp.close()
    cmd = (
        f"chmod 700 {RUNNER} && "
        f"(crontab -l 2>/dev/null | grep -v 'startplus-backup.sh'; echo '{CRON_LINE}') | crontab - && "
        "crontab -l && "
        f"{RUNNER} && ls -lh /var/backups/startplus && echo 'Проверочная копия: OK'"
    )
    _, o, e = c.exec_command(cmd, timeout=300)
    code = o.channel.recv_exit_status()
    print(o.read().decode("utf-8", "replace") + e.read().decode("utf-8", "replace"))
    c.close()
    if code != 0:
        raise SystemExit(f"Ошибка (код {code})")


if __name__ == "__main__":
    main()

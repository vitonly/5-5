#!/usr/bin/env python3
"""
Ставит на VPS ежечасный запуск автоматизации сайта (/api/cron/automation).

Секрет CRON_SECRET в этом файле и в crontab НЕ хранится: cron запускает маленький
скрипт /usr/local/bin/startplus-automation.sh, а тот читает секрет из .env сайта.
Поэтому после смены CRON_SECRET в .env ничего больше править не нужно.

Запуск (с компьютера, где лежит SSH-ключ от VPS):
  python scripts/vps_cron_mvp.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko

HOST = "201.34.159.109"
SSH_KEY = Path(os.environ.get("VPS_SSH_KEY", str(Path.home() / ".ssh" / "id_ed25519_startdota")))
RUNNER = "/usr/local/bin/startplus-automation.sh"

# Скрипт, который запускает cron. Секрет берётся из .env в момент запуска.
RUNNER_SH = """#!/bin/sh
# Раз в час запускает автоматизацию сайта СТАРТ+ (просрочки домашек, сезоны и т. д.)
SECRET=$(grep '^CRON_SECRET=' /var/www/startplus/app/.env | cut -d= -f2- | tr -d '"')
curl -fsS -m 120 -H "Authorization: Bearer $SECRET" https://www.startdota.ru/api/cron/automation >/dev/null
"""

CRON_LINE = f"15 * * * * {RUNNER} >/dev/null 2>&1"

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

    # Старые строки с /api/cron/automation убираем (в них секрет был прямо в тексте),
    # остальные задачи crontab не трогаем
    cmd = (
        f"chmod 700 {RUNNER} && "
        "(crontab -l 2>/dev/null | grep -v '/api/cron/automation' | grep -v 'startplus-automation.sh'; "
        f"echo '{CRON_LINE}') | crontab - && crontab -l && "
        f"{RUNNER} && echo 'Проверочный запуск: OK'"
    )
    _, o, e = c.exec_command(cmd, timeout=180)
    code = o.channel.recv_exit_status()
    print(o.read().decode("utf-8", "replace") + e.read().decode("utf-8", "replace"), flush=True)
    c.close()
    if code != 0:
        raise SystemExit(f"Ошибка (код {code})")


if __name__ == "__main__":
    main()

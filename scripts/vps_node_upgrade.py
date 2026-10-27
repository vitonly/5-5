#!/usr/bin/env python3
"""
Обновить Node.js на VPS с 20 до 24.

Зачем: у Node.js 20 закончилась поддержка (апрель 2026) — исправлений безопасности больше нет.
Node 24 — действующая версия с долгой поддержкой. Сайт локально уже собирается и работает на 24.

Что делает (осторожно, с откатом):
  1. Запоминает текущую версию Node и сохраняет список процессов pm2.
  2. Переключает репозиторий NodeSource с ветки 20.x на 24.x и ставит Node 24.
  3. Перезапускает pm2 уже на новом Node (pm2 kill + pm2 resurrect) — сайт недоступен несколько секунд.
  4. Проверяет, что сайт отвечает. Не отвечает или что-то упало — возвращает Node 20 как было.

Модули сайта, привязанные к системе (sharp, prisma, next-swc и др.), сделаны на N-API —
им всё равно, какая версия Node, пересобирать не нужно.

Запуск:
  python scripts/vps_node_upgrade.py           — только показать, что будет сделано
  python scripts/vps_node_upgrade.py --apply   — обновить (лучше, когда нет занятия)
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko

HOST = "201.34.159.109"
SSH_KEY = Path(os.environ.get("VPS_SSH_KEY", str(Path.home() / ".ssh" / "id_ed25519_startdota")))
SOURCES = "/etc/apt/sources.list.d/nodesource.sources"
BACKUP = "/root/nodesource.sources.node20"
TARGET_MAJOR = 24

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def connect() -> paramiko.SSHClient:
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", timeout=30, allow_agent=False, look_for_keys=False,
              pkey=paramiko.Ed25519Key.from_private_key_file(str(SSH_KEY)))
    return c


def run(c: paramiko.SSHClient, cmd: str, timeout: int = 600) -> tuple[int, str]:
    print(f"$ {cmd}", flush=True)
    _, o, e = c.exec_command(cmd, timeout=timeout)
    code = o.channel.recv_exit_status()
    out = (o.read().decode("utf-8", "replace") + e.read().decode("utf-8", "replace")).strip()
    if out:
        print(out[-1500:], flush=True)
    return code, out


# Перезапуск pm2 на установленном сейчас Node: остановить его целиком и поднять сохранённые процессы.
# (Первая попытка 27.10.2026 делала «pm2 update» — на Node 24 он сразу же останавливал
#  только что запущенный pm2, и сайт оставался выключен; скрипт тогда сам откатился на Node 20.)
PM2_RESTART = "pm2 kill; pm2 resurrect && sleep 3 && pm2 save"

# Сайт отвечает? (до 60 секунд ждём, пока pm2 поднимет его)
HEALTH = ("for i in $(seq 1 30); do s=$(curl -s -o /dev/null -w '%{http_code}' -m 10 http://127.0.0.1:3000/login); "
          "[ \"$s\" = 200 ] && echo OK && exit 0; sleep 2; done; echo FAIL; exit 1")


def main() -> None:
    apply = "--apply" in sys.argv
    c = connect()
    _, old_version = run(c, "dpkg-query -W -f='${Version}' nodejs")
    _, node_v = run(c, "node -v")
    if node_v.startswith(f"v{TARGET_MAJOR}."):
        print(f"Уже стоит Node {node_v} — ничего делать не нужно")
        return
    print(f"\nСейчас: Node {node_v} (пакет {old_version}). Будет: Node {TARGET_MAJOR}.x из NodeSource.")
    if not apply:
        print("Это предпросмотр — ничего не изменено (запустите с --apply)")
        return

    # 1. Запоминаем, что запущено в pm2, и сохраняем настройки репозитория
    run(c, "pm2 save")
    run(c, f"cp -a {SOURCES} {BACKUP}")

    def rollback(reason: str) -> None:
        print(f"\n!!! {reason} — возвращаю Node 20")
        run(c, f"cp -a {BACKUP} {SOURCES} && apt-get update -qq")
        run(c, f"DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --allow-downgrades nodejs={old_version}")
        run(c, PM2_RESTART)
        code, _ = run(c, HEALTH, timeout=120)
        raise SystemExit("Откат выполнен, сайт отвечает" if code == 0 else "Откат выполнен, но сайт НЕ отвечает — нужна ручная проверка")

    # 2. Переключаем репозиторий на 24.x и ставим новый Node
    code, _ = run(c, f"sed -i 's#node_20.x#node_{TARGET_MAJOR}.x#' {SOURCES} && apt-get update -qq")
    if code != 0:
        rollback("apt-get update не прошёл")
    code, _ = run(c, "DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs")
    if code != 0:
        rollback("Установка Node не прошла")
    _, new_v = run(c, "node -v")
    if not new_v.startswith(f"v{TARGET_MAJOR}."):
        rollback(f"После установки Node {new_v}, а не {TARGET_MAJOR}")
    # Сайт pm2 запускает через /usr/bin/npm («npm start») — он должен быть на месте
    code, _ = run(c, "test -x /usr/bin/npm && npm -v")
    if code != 0:
        rollback("После установки нет /usr/bin/npm")

    # 3. pm2 перезапускается на новом Node и поднимает сохранённые процессы
    run(c, PM2_RESTART)
    code, _ = run(c, HEALTH, timeout=120)
    if code != 0:
        rollback("Сайт не отвечает на новом Node")

    run(c, "pm2 jlist | python3 -c 'import json,sys; [print(p[\"name\"], p[\"pm2_env\"][\"status\"], p[\"pm2_env\"].get(\"node_version\")) for p in json.load(sys.stdin)]'")
    print(f"\nГотово: Node {new_v}, сайт отвечает. Копия старых настроек репозитория: {BACKUP}")
    c.close()


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Точечное обновление сайта — без полной перевыкладки.

Полный vps_deploy.py пересоздаёт .env на сервере и требует VPS_PG_PASSWORD.
Здесь этого не нужно: заливаем только изменённые файлы (список FILES),
удаляем ненужные (список REMOVED), пересобираем и перезапускаем.
.env, база и загрузки на сервере не трогаются.

Сейчас (исправления безопасности):
  src/app/api/telegram/webhook/route.ts  — вебхук бота только с секретом Telegram
  src/lib/telegram-bot.ts                — вход через бота только после кнопки «Да, это я»
  удаляется src/app/api/auth/bootstrap/route.ts — «чёрный ход» с логином 1 / паролем 1

Если сборка не удалась — возвращаем прежние файлы и прежнюю сборку (.next).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko

HOST = "201.34.159.109"
USER = "root"
PASSWORD = os.environ.get("VPS_ROOT_PASSWORD", "")
SSH_KEY = Path(os.environ.get("VPS_SSH_KEY", str(Path.home() / ".ssh" / "id_ed25519_startdota")))
ROOT = Path(__file__).resolve().parents[1]
APP = "/var/www/startplus/app"
UPLOADS = "/var/www/startplus/uploads"
FILES = [
    "src/app/api/telegram/webhook/route.ts",
    "src/lib/telegram-bot.ts",
]
# Файлы, которые нужно удалить с сервера
REMOVED = [
    "src/app/api/auth/bootstrap/route.ts",
]

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def connect() -> paramiko.SSHClient:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    kw: dict = dict(hostname=HOST, username=USER, timeout=60, banner_timeout=60,
                    auth_timeout=60, allow_agent=False, look_for_keys=False)
    if SSH_KEY.exists():
        kw["pkey"] = paramiko.Ed25519Key.from_private_key_file(str(SSH_KEY))
    elif PASSWORD:
        kw["password"] = PASSWORD
    else:
        raise SystemExit(f"Нет SSH-ключа {SSH_KEY} и не задан VPS_ROOT_PASSWORD")
    client.connect(**kw)
    t = client.get_transport()
    if t:
        t.set_keepalive(30)
    return client


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 1800) -> tuple[int, str]:
    print(f"\n$ {cmd}", flush=True)
    _, out, err = client.exec_command(cmd, timeout=timeout, get_pty=True)
    text = out.read().decode("utf-8", "replace") + err.read().decode("utf-8", "replace")
    code = out.channel.recv_exit_status()
    if text.strip():
        print(text[-6000:].rstrip(), flush=True)
    print(f"[exit {code}]", flush=True)
    return code, text


def main() -> None:
    client = connect()
    sftp = client.open_sftp()

    # 1. Резервная копия: старые версии файлов и текущая сборка
    run(client, f"rm -rf /tmp/igra_site_bak && mkdir -p /tmp/igra_site_bak && "
                f"cd {APP} && tar -czf /tmp/igra_site_bak/files.tgz --ignore-failed-read {' '.join(FILES + REMOVED)} 2>/dev/null; "
                f"rm -rf {APP}/.next.bak && cp -a {APP}/.next {APP}/.next.bak")

    # 2. Заливаем новые файлы
    for rel in FILES:
        remote = f"{APP}/{rel}"
        run(client, f"mkdir -p {os.path.dirname(remote)}")
        sftp.put(str(ROOT / rel), remote)
        print(f"uploaded {rel}", flush=True)

    # 2б. Удаляем ненужные файлы (и папку, если она опустела)
    for rel in REMOVED:
        run(client, f"rm -f {APP}/{rel}; rmdir {os.path.dirname(f'{APP}/{rel}')} 2>/dev/null; true")
        print(f"removed {rel}", flush=True)

    # 3. Сборка (как в vps_deploy.py: на время сборки uploads — пустая папка, не ссылка)
    run(client, f"rm -rf {APP}/public/uploads && mkdir -p {APP}/public/uploads")
    code, _ = run(client, f"cd {APP} && npx next build --webpack", timeout=1800)
    run(client, f"rm -rf {APP}/public/uploads && ln -s {UPLOADS} {APP}/public/uploads")

    if code != 0:
        print("\nСБОРКА НЕ УДАЛАСЬ — возвращаю прежнюю версию сайта", flush=True)
        run(client, f"cd {APP} && rm -f {' '.join(FILES)} && tar -xzf /tmp/igra_site_bak/files.tgz 2>/dev/null; "
                    f"rm -rf {APP}/.next && mv {APP}/.next.bak {APP}/.next && pm2 restart startplus")
        raise SystemExit(1)

    # 4. Перезапуск сайта и проверка
    run(client, f"pm2 restart startplus && rm -rf {APP}/.next.bak")
    run(client, "sleep 6; curl -s -o /dev/null -w 'site %{http_code}\\n' -m 20 http://127.0.0.1:3000/login; "
                "curl -s -o /dev/null -w 'bootstrap %{http_code}\\n' -m 20 -X POST http://127.0.0.1:3000/api/auth/bootstrap")
    print("\nСайт обновлён.", flush=True)
    client.close()


if __name__ == "__main__":
    main()

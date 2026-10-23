#!/usr/bin/env python3
"""
Отключить вход по паролю в SSH на VPS — только по ключу.

Сейчас root и так пускают только по ключу, но для остальных учётных записей вход
по паролю включён, а подобрать пароль пытаются тысячи раз в сутки.

Что делает (осторожно, чтобы не потерять доступ к серверу):
  1. Пишет файл /etc/ssh/sshd_config.d/00-startplus-keys-only.conf
     (PasswordAuthentication no, KbdInteractiveAuthentication no).
  2. Проверяет настройки командой `sshd -t`. Ошибка — файл удаляется, ничего не меняется.
  3. Перечитывает настройки SSH (reload — текущие подключения не рвутся).
  4. Открывает НОВОЕ подключение по ключу. Не вышло — возвращает всё как было.

Запуск (с компьютера, где лежит SSH-ключ от VPS):
  python scripts/vps_ssh_harden.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko

HOST = "201.34.159.109"
SSH_KEY = Path(os.environ.get("VPS_SSH_KEY", str(Path.home() / ".ssh" / "id_ed25519_startdota")))
CONF = "/etc/ssh/sshd_config.d/00-startplus-keys-only.conf"
CONF_TEXT = (
    "# СТАРТ+: вход только по SSH-ключу (scripts/vps_ssh_harden.py)\n"
    "PasswordAuthentication no\n"
    "KbdInteractiveAuthentication no\n"
)

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def connect() -> paramiko.SSHClient:
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", timeout=30, allow_agent=False, look_for_keys=False,
              pkey=paramiko.Ed25519Key.from_private_key_file(str(SSH_KEY)))
    return c


def run(c: paramiko.SSHClient, cmd: str) -> tuple[int, str]:
    _, o, e = c.exec_command(cmd, timeout=60)
    code = o.channel.recv_exit_status()
    return code, o.read().decode("utf-8", "replace") + e.read().decode("utf-8", "replace")


def main() -> None:
    c = connect()   # это подключение держим открытым, пока не убедимся, что новое работает
    # Файлы из sshd_config.d должны подключаться (в Ubuntu — строка Include в начале sshd_config)
    code, out = run(c, "grep -qE '^Include /etc/ssh/sshd_config.d/\\*\\.conf' /etc/ssh/sshd_config && echo YES")
    if "YES" not in out:
        raise SystemExit("В sshd_config нет Include sshd_config.d — ничего не меняю, нужна ручная настройка")

    sftp = c.open_sftp()
    with sftp.file(CONF, "w") as f:
        f.write(CONF_TEXT)
    sftp.close()

    code, out = run(c, "sshd -t")
    if code != 0:
        run(c, f"rm -f {CONF}")
        raise SystemExit("sshd -t нашёл ошибку — файл удалён, всё как было:\n" + out)

    run(c, "systemctl reload ssh 2>/dev/null || systemctl reload sshd")

    # Проверяем НОВЫМ подключением по ключу
    try:
        c2 = connect()
        code, out = run(c2, "sshd -T | grep -E '^(passwordauthentication|kbdinteractiveauthentication|permitrootlogin) '")
        c2.close()
        print("Новое подключение по ключу работает.\n" + out)
    except Exception as e:
        run(c, f"rm -f {CONF} && (systemctl reload ssh 2>/dev/null || systemctl reload sshd)")
        raise SystemExit(f"Новое подключение не удалось ({e}) — настройки возвращены")
    finally:
        c.close()


if __name__ == "__main__":
    main()

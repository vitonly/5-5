#!/usr/bin/env python3
"""
Смена секретов сайта на VPS: CRON_SECRET (старый утёк в git) и новый TELEGRAM_WEBHOOK_SECRET.

Как работает:
  1. Делает копию .env сервера: .env.bak-<дата-время>.
  2. Новые секреты создаются ПРЯМО НА СЕРВЕРЕ (python3 secrets) — значения
     не попадают ни на этот компьютер, ни в вывод, ни в git.
  3. В .env меняются только эти две строки, остальные не трогаются.
  4. Печатаются только длины секретов.

После этого нужно перезапустить сайт (vps_igra_site_patch.py это делает)
и заново выставить webhook бота: python scripts/vps_rotate_secrets.py --webhook

Запуск:
  python scripts/vps_rotate_secrets.py            — сменить секреты в .env
  python scripts/vps_rotate_secrets.py --webhook  — выставить webhook с новым секретом и проверить его
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko

HOST = "201.34.159.109"
SSH_KEY = Path(os.environ.get("VPS_SSH_KEY", str(Path.home() / ".ssh" / "id_ed25519_startdota")))
APP = "/var/www/startplus/app"

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Выполняется на сервере. Секреты генерируются там же и никуда не печатаются.
ROTATE = r'''
import os, re, secrets, shutil, time
path = "/var/www/startplus/app/.env"
backup = path + ".bak-" + time.strftime("%Y%m%d-%H%M%S")
shutil.copy2(path, backup)
os.chmod(backup, 0o600)
text = open(path, encoding="utf-8").read()
new = {
    "CRON_SECRET": secrets.token_urlsafe(36),
    # Только латиница, цифры, _ и - — такие символы принимает Telegram
    "TELEGRAM_WEBHOOK_SECRET": secrets.token_urlsafe(36),
}
for key, value in new.items():
    line = f'{key}="{value}"'
    if re.search(rf"^{key}=.*$", text, flags=re.M):
        text = re.sub(rf"^{key}=.*$", lambda m: line, text, count=1, flags=re.M)
    else:
        text = text.rstrip("\n") + "\n" + line + "\n"
open(path, "w", encoding="utf-8").write(text)
print("копия .env:", backup)
for key, value in new.items():
    print(f"{key}: новый, длина {len(value)}")
'''

# Выставить webhook (через маршрут сайта) и спросить у Telegram его состояние.
# Секреты читаются из .env на сервере; в вывод попадают только ответы без секретов.
WEBHOOK = r'''
cd /var/www/startplus/app
get() { grep "^$1=" .env | head -1 | cut -d= -f2- | tr -d '"'; }
echo "--- setWebhook"
curl -s -m 30 -X POST -H "Authorization: Bearer $(get CRON_SECRET)" http://127.0.0.1:3000/api/telegram/setup-webhook \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok:', d.get('ok'), '| через прокси:', d.get('viaProxy'), '|', d.get('error') or d.get('telegram',{}).get('description',''))"
echo "--- getWebhookInfo"
curl -s -m 30 -H "X-Telegram-Proxy-Secret: $(get TELEGRAM_PROXY_SECRET)" "$(get TELEGRAM_API_BASE)/bot$(get TELEGRAM_BOT_TOKEN)/getWebhookInfo" \
  | python3 -c "import sys,json; r=json.load(sys.stdin).get('result',{}); print('ждут доставки:', r.get('pending_update_count'), '| последняя ошибка:', r.get('last_error_message','нет'))"
echo "--- вебхук без секрета (ждём 401)"
curl -s -o /dev/null -w '%{http_code}\n' -m 15 -X POST -H 'Content-Type: application/json' -d '{}' https://startdota.ru/api/telegram/webhook
'''


def main() -> None:
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", timeout=30, allow_agent=False, look_for_keys=False,
              pkey=paramiko.Ed25519Key.from_private_key_file(str(SSH_KEY)))
    if "--webhook" in sys.argv:
        cmd = "bash -s"
        script = WEBHOOK
    else:
        cmd = "python3 -"
        script = ROTATE
    stdin, out, err = c.exec_command(cmd, timeout=120)
    stdin.write(script)
    stdin.channel.shutdown_write()
    code = out.channel.recv_exit_status()
    print(out.read().decode("utf-8", "replace") + err.read().decode("utf-8", "replace"))
    c.close()
    if code != 0:
        raise SystemExit(f"Ошибка (код {code})")


if __name__ == "__main__":
    main()

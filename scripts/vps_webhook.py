#!/usr/bin/env python3
import os, sys
import paramiko

PASSWORD = os.environ["VPS_ROOT_PASSWORD"]
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

def run(c, cmd, t=45):
    print("$", cmd[:100], flush=True)
    _, o, e = c.exec_command(cmd, timeout=t, get_pty=True)
    out = o.read().decode("utf-8", errors="replace")
    err = e.read().decode("utf-8", errors="replace")
    code = o.channel.recv_exit_status()
    print((out + err)[-2000:].encode("ascii", "replace").decode(), flush=True)
    print("[exit", code, "]", flush=True)

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("201.34.159.109", username="root", password=PASSWORD, timeout=30, allow_agent=False, look_for_keys=False)
tr = c.get_transport()
if tr:
    tr.set_keepalive(15)

run(c, "cd /var/www/startplus/app && CRON=$(grep ^CRON_SECRET= .env | cut -d= -f2- | tr -d '\"') && curl -sS -m 20 -X POST -H \"Authorization: Bearer $CRON\" http://127.0.0.1:3000/api/telegram/setup-webhook")
run(c, "cd /var/www/startplus/app && TOKEN=$(grep ^TELEGRAM_BOT_TOKEN= .env | cut -d= -f2- | tr -d '\"') && curl -sS -m 20 \"https://api.telegram.org/bot${TOKEN}/setWebhook\" -H 'Content-Type: application/json' -d '{\"url\":\"https://www.startdota.ru/api/telegram/webhook\"}'")
run(c, "cd /var/www/startplus/app && TOKEN=$(grep ^TELEGRAM_BOT_TOKEN= .env | cut -d= -f2- | tr -d '\"') && curl -sS -m 20 \"https://api.telegram.org/bot${TOKEN}/getWebhookInfo\"")
c.close()

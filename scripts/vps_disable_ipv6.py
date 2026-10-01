#!/usr/bin/env python3
import os, sys
import paramiko

PASSWORD = os.environ["VPS_ROOT_PASSWORD"]
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

def run(c, cmd, t=45):
    print("$", cmd[:160], flush=True)
    _, o, e = c.exec_command(cmd, timeout=t, get_pty=True)
    text = (o.read() + e.read()).decode("utf-8", errors="replace")
    print(text[-2000:].encode("ascii", "replace").decode(), flush=True)

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("201.34.159.109", username="root", password=PASSWORD, timeout=30, allow_agent=False, look_for_keys=False)

# Disable IPv6 so Telegram works over IPv4
run(c, "sysctl -w net.ipv6.conf.all.disable_ipv6=1; sysctl -w net.ipv6.conf.default.disable_ipv6=1")
run(c, "grep -q disable_ipv6 /etc/sysctl.d/99-no-ipv6.conf 2>/dev/null || printf 'net.ipv6.conf.all.disable_ipv6=1\\nnet.ipv6.conf.default.disable_ipv6=1\\n' > /etc/sysctl.d/99-no-ipv6.conf")
run(c, "curl -sS -m 12 -o /dev/null -w 'tg:%{http_code}\\n' https://api.telegram.org")
run(c, "cd /var/www/startplus/app && TOKEN=$(grep ^TELEGRAM_BOT_TOKEN= .env | cut -d= -f2- | tr -d '\"') && curl -sS -m 15 \"https://api.telegram.org/bot${TOKEN}/getMe\"")
run(c, "cd /var/www/startplus/app && TOKEN=$(grep ^TELEGRAM_BOT_TOKEN= .env | cut -d= -f2- | tr -d '\"') && curl -sS -m 15 -X POST \"https://api.telegram.org/bot${TOKEN}/setWebhook\" -H 'Content-Type: application/json' -d '{\"url\":\"https://www.startdota.ru/api/telegram/webhook\"}'")
run(c, "pm2 restart startplus --update-env")
run(c, "sleep 2; curl -sS -m 10 -X POST http://127.0.0.1:3000/api/auth/telegram/ticket -H 'Content-Type: application/json' -d '{\"pdConsent\":true}'")
c.close()

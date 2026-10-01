#!/usr/bin/env python3
import os, sys, time
import paramiko

HOST = "201.34.159.109"
PASSWORD = os.environ.get("VPS_ROOT_PASSWORD", "")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

def run(c, cmd, t=120):
    print(f"\n$ {cmd}", flush=True)
    _, out, err = c.exec_command(cmd, timeout=t, get_pty=True)
    text = out.read().decode("utf-8", errors="replace") + err.read().decode("utf-8", errors="replace")
    code = out.channel.recv_exit_status()
    print(text[-3000:].encode("ascii", "replace").decode("ascii"), flush=True)
    print(f"[exit {code}]", flush=True)
    return code, text

def main():
    if not PASSWORD:
        raise SystemExit("VPS_ROOT_PASSWORD required")
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", password=PASSWORD, timeout=60, allow_agent=False, look_for_keys=False)

    run(c, "dig +short startdota.ru A @8.8.8.8; dig +short www.startdota.ru A @8.8.8.8; dig +short startdota.ru A @1.1.1.1")

    # wait up to ~3 min for DNS
    ok = False
    for i in range(6):
        code, text = run(c, "dig +short startdota.ru A @8.8.8.8; dig +short www.startdota.ru A @8.8.8.8")
        if "201.34.159.109" in text and text.count("201.34.159.109") >= 1:
            # www might still be CNAME propagating
            if "201.34.159.109" in text.splitlines()[0] or "201.34.159.109" in text:
                ok = True
                # prefer both
                lines = [l.strip() for l in text.splitlines() if l.strip()]
                print("DNS lines:", lines, flush=True)
                if any("201.34.159.109" == l for l in lines):
                    break
        print(f"waiting DNS... {i+1}/6", flush=True)
        time.sleep(30)

    # certbot even if only apex ready; include both names
    code, _ = run(
        c,
        "certbot --nginx -d startdota.ru -d www.startdota.ru --non-interactive --agree-tos --register-unsafely-without-email --redirect",
        t=180,
    )
    if code != 0:
        run(
            c,
            "certbot --nginx -d startdota.ru --non-interactive --agree-tos --register-unsafely-without-email --redirect",
            t=180,
        )

    # cron
    run(
        c,
        "CRON=$(grep ^CRON_SECRET= /var/www/startplus/app/.env | cut -d= -f2- | tr -d '\"'); "
        "(crontab -l 2>/dev/null | grep -v automation; "
        "echo \"15 5 * * * curl -fsS -H \\\"Authorization: Bearer $CRON\\\" https://www.startdota.ru/api/cron/automation >/dev/null 2>&1\") "
        "| crontab -; crontab -l",
    )

    # telegram webhook
    run(
        c,
        "cd /var/www/startplus/app && "
        "CRON=$(grep ^CRON_SECRET= .env | cut -d= -f2- | tr -d '\"'); "
        "curl -fsS -X POST -H \"Authorization: Bearer $CRON\" https://startdota.ru/api/telegram/setup-webhook || "
        "curl -fsS -X POST -H \"Authorization: Bearer $CRON\" http://127.0.0.1/api/telegram/setup-webhook",
        t=60,
    )

    run(c, "curl -sI -m 15 https://startdota.ru | head -n 15; curl -sI -m 15 https://www.startdota.ru | head -n 15")
    c.close()

if __name__ == "__main__":
    main()

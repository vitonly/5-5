#!/usr/bin/env python3
"""Restore nginx SSL for startdota.ru using existing Let's Encrypt cert."""
import os, sys
import paramiko

PASSWORD = os.environ["VPS_ROOT_PASSWORD"]
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

NGINX_CONF = r"""
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name startdota.ru www.startdota.ru 201.34.159.109 _;
    client_max_body_size 12m;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name startdota.ru www.startdota.ru;
    client_max_body_size 12m;

    ssl_certificate /etc/letsencrypt/live/startdota.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/startdota.ru/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location /uploads/ {
        alias /var/www/startplus/uploads/;
        access_log off;
        expires 7d;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_cache_bypass $http_upgrade;
    }
}
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("201.34.159.109", username="root", password=PASSWORD, timeout=30, allow_agent=False, look_for_keys=False)
t = c.get_transport()
if t:
    t.set_keepalive(15)

def run(cmd, timeout=90):
    print(f"\n$ {cmd[:160]}", flush=True)
    _, o, e = c.exec_command(cmd, timeout=timeout, get_pty=True)
    out = o.read().decode("utf-8", "replace") + e.read().decode("utf-8", "replace")
    code = o.channel.recv_exit_status()
    print(out[-3000:].encode("ascii", "replace").decode(), flush=True)
    print(f"[exit {code}]", flush=True)
    return code, out

# ensure ssl helper files exist
run("ls /etc/letsencrypt/options-ssl-nginx.conf /etc/letsencrypt/ssl-dhparams.pem /etc/letsencrypt/live/startdota.ru/fullchain.pem")

# write config via sftp
sftp = c.open_sftp()
with sftp.file("/etc/nginx/sites-available/startplus", "w") as f:
    f.write(NGINX_CONF)
sftp.close()
print("Wrote nginx config", flush=True)

code, _ = run("nginx -t && systemctl reload nginx")
if code != 0:
    # fallback: certbot install
    run("certbot --nginx -d startdota.ru -d www.startdota.ru --non-interactive --agree-tos --redirect --reinstall 2>&1 || certbot install --cert-name startdota.ru --nginx --non-interactive 2>&1", timeout=180)
    run("nginx -t && systemctl reload nginx")

run("ufw allow 443/tcp 2>/dev/null; ufw status | head -n 20")
run("ss -lntup | grep -E ':80|:443' || true")
run("curl -sI -m 8 https://127.0.0.1/login -k | head -n 12")
run("curl -sI -m 8 -H 'Host: www.startdota.ru' https://127.0.0.1/login -k | head -n 12")

c.close()
print("\nSSL restore done.", flush=True)

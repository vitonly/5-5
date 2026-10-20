#!/usr/bin/env python3
"""
Выкладка «Своей игры» на VPS (startdota.ru/igra/). Секреты не коммитить.

Что делает:
  1. Заливает папку igra/ в /var/www/startplus/igra (паки и кэш на сервере не трогает).
  2. Ставит Python-окружение (venv) и библиотеку aiohttp.
  3. Берёт JWT_SECRET из .env сайта и пишет его в igra.env (только для чтения root).
  4. Создаёт/обновляет службу systemd «svoya-igra» на порту 8090 и перезапускает её.
  5. Если в nginx ещё нет location /igra/ — добавляет и перезагружает nginx.
  6. Проверяет, что https://startdota.ru/igra/config.json отвечает.

Запуск (с компьютера, где лежит SSH-ключ от VPS):
  python scripts/vps_igra_deploy.py
"""
from __future__ import annotations

import io
import os
import sys
import tarfile
from pathlib import Path

import paramiko

HOST = "201.34.159.109"
USER = "root"
PASSWORD = os.environ.get("VPS_ROOT_PASSWORD", "")
SSH_KEY = Path(os.environ.get("VPS_SSH_KEY", str(Path.home() / ".ssh" / "id_ed25519_startdota")))
ROOT = Path(__file__).resolve().parents[1]
LOCAL_IGRA = ROOT / "igra"
REMOTE_IGRA = "/var/www/startplus/igra"
SITE_ENV = "/var/www/startplus/app/.env"
NGINX_SITE = "/etc/nginx/sites-available/startplus"
PORT = 8090

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

SERVICE = f"""[Unit]
Description=Svoya Igra (startdota.ru/igra)
After=network.target

[Service]
WorkingDirectory={REMOTE_IGRA}
EnvironmentFile={REMOTE_IGRA}/igra.env
Environment=SVOYA_SITE_URL=http://127.0.0.1:3000
Environment=SVOYA_PUBLIC_URL=https://startdota.ru/igra/
Environment=SVOYA_PUBLIC_SITE=/
Environment=PYTHONUNBUFFERED=1
ExecStart={REMOTE_IGRA}/venv/bin/python server.py {PORT} --local-only
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
"""

NGINX_BLOCK = f"""
    # «Своя игра»: отдельная служба на порту {PORT} (см. igra/ и scripts/vps_igra_deploy.py)
    location = /igra {{
        return 301 /igra/;
    }}

    location /igra/ {{
        proxy_pass http://127.0.0.1:{PORT}/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        client_max_body_size 1024m;
        proxy_request_buffering off;
        proxy_buffering off;
    }}
"""


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
    return client


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 600) -> tuple[int, str]:
    print(f"$ {cmd}", flush=True)
    _, out, err = client.exec_command(cmd, timeout=timeout)
    text = out.read().decode("utf-8", "replace") + err.read().decode("utf-8", "replace")
    code = out.channel.recv_exit_status()
    if text.strip():
        print(text.rstrip(), flush=True)
    return code, text


def make_tarball() -> bytes:
    """Папка igra/ без паков, черновиков редактора, кэша и файлов сборки exe."""
    skip = {"packs", "drafts", ".cache", "__pycache__", "build", "dist", "venv"}
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for path in LOCAL_IGRA.rglob("*"):
            rel = path.relative_to(LOCAL_IGRA)
            if rel.parts and rel.parts[0] in skip:
                continue
            if path.is_file() and (path.suffix in (".exe", ".spec") or path.name in ("igra.env", "settings.json")):
                continue
            tar.add(path, arcname=str(rel).replace("\\", "/"), recursive=False)
    return buf.getvalue()


def main() -> None:
    client = connect()
    sftp = client.open_sftp()

    # 1. Код игры
    run(client, f"mkdir -p {REMOTE_IGRA}/packs")
    with sftp.file("/tmp/igra.tgz", "wb") as f:
        f.write(make_tarball())
    run(client, f"tar -xzf /tmp/igra.tgz -C {REMOTE_IGRA} && rm /tmp/igra.tgz")

    # 2. Python-окружение
    run(client, "command -v python3 >/dev/null || (apt-get update -qq && apt-get install -y -qq python3)")
    # Для venv в Debian/Ubuntu нужен пакет pythonX.Y-venv под точную версию Python
    run(client, "PYV=$(python3 -c 'import sys; print(f\"{sys.version_info[0]}.{sys.version_info[1]}\")'); "
                "python3 -c 'import ensurepip' 2>/dev/null || "
                "(apt-get update -qq; DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python$PYV-venv "
                "|| DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3-venv)", timeout=900)
    # Недоделанный venv (без pip) пересоздаём
    code, _ = run(client, f"test -x {REMOTE_IGRA}/venv/bin/pip || (rm -rf {REMOTE_IGRA}/venv && python3 -m venv {REMOTE_IGRA}/venv)")
    if code != 0:
        raise SystemExit("Не удалось создать Python-окружение на сервере")
    code, _ = run(client, f"{REMOTE_IGRA}/venv/bin/pip install -q --upgrade -r {REMOTE_IGRA}/requirements.txt", timeout=900)
    if code != 0:
        raise SystemExit("Не удалось установить aiohttp")

    # 3. Секрет сайта для проверки начисления очков
    secret = ""
    with sftp.file(SITE_ENV, "r") as ef:
        for line in ef.read().decode("utf-8", "replace").splitlines():
            if line.startswith("JWT_SECRET="):
                secret = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not secret:
        raise SystemExit(f"В {SITE_ENV} нет JWT_SECRET")
    with sftp.file(f"{REMOTE_IGRA}/igra.env", "w") as f:
        f.write(f"JWT_SECRET={secret}\n")
    run(client, f"chmod 600 {REMOTE_IGRA}/igra.env")

    # 4. Служба systemd
    with sftp.file("/etc/systemd/system/svoya-igra.service", "w") as f:
        f.write(SERVICE)
    run(client, "systemctl daemon-reload && systemctl enable svoya-igra && systemctl restart svoya-igra")

    # 5. nginx: добавляем /igra/, если ещё нет (vps_deploy.py тоже содержит этот блок)
    with sftp.file(NGINX_SITE, "r") as f:
        conf = f.read().decode("utf-8")
    if "location /igra/" not in conf:
        marker = "    location / {\n        proxy_pass http://127.0.0.1:3000;"
        if marker not in conf:
            raise SystemExit("Не нашёл в nginx блок location / сайта — добавьте /igra/ вручную (igra/deploy/nginx-igra.conf)")
        run(client, f"cp {NGINX_SITE} {NGINX_SITE}.bak-igra")
        conf = conf.replace(marker, NGINX_BLOCK.lstrip("\n") + "\n" + marker, 1)
        with sftp.file(NGINX_SITE, "w") as f:
            f.write(conf)
        code, _ = run(client, "nginx -t && systemctl reload nginx")
        if code != 0:
            run(client, f"cp {NGINX_SITE}.bak-igra {NGINX_SITE} && systemctl reload nginx")
            raise SystemExit("nginx не принял настройки — вернул старые")

    # 6. Проверка
    run(client, "sleep 2; systemctl --no-pager --lines=5 status svoya-igra | head -n 12")
    run(client, f"curl -s -m 10 http://127.0.0.1:{PORT}/config.json; echo; "
                "curl -s -m 10 https://startdota.ru/igra/config.json; echo")
    print("\nГотово: https://startdota.ru/igra/  (пульт: https://startdota.ru/igra/host)")
    client.close()


if __name__ == "__main__":
    main()

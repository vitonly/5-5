#!/usr/bin/env python3
"""Install START+ Dota demo parser on Timeweb VPS. Requires VPS_ROOT_PASSWORD."""
from __future__ import annotations

import io
import os
import sys
import tarfile
import time
from pathlib import Path

import paramiko

HOST = "201.34.159.109"
USER = "root"
PASSWORD = os.environ.get("VPS_ROOT_PASSWORD", "")
if not PASSWORD:
    raise SystemExit("Set VPS_ROOT_PASSWORD env var")

REMOTE_PARSER = "/var/www/startplus/parser"
REMOTE_APP = "/var/www/startplus/app"
ROOT = Path(__file__).resolve().parents[1]

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

SERVICE = f"""[Unit]
Description=START+ Dota 2 replay parser (clarity)
After=network.target

[Service]
Type=simple
WorkingDirectory={REMOTE_PARSER}
ExecStart=/usr/bin/java -Xmx1g -jar {REMOTE_PARSER}/target/startplus-parser.jar --serve 5600
Restart=on-failure
RestartSec=5
User=www-data
Group=www-data
Environment=PARSER_HOST=127.0.0.1

[Install]
WantedBy=multi-user.target
"""


def connect() -> paramiko.SSHClient:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        HOST,
        username=USER,
        password=PASSWORD,
        timeout=60,
        banner_timeout=60,
        auth_timeout=60,
        allow_agent=False,
        look_for_keys=False,
    )
    t = client.get_transport()
    if t:
        t.set_keepalive(30)
    return client


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 1800) -> tuple[int, str]:
    print(f"\n$ {cmd[:200]}{'...' if len(cmd) > 200 else ''}", flush=True)
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout, get_pty=True)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    text = out + (("\n" + err) if err.strip() else "")
    if text:
        safe = text[-8000:] if len(text) > 8000 else text
        print(safe.encode("ascii", "replace").decode("ascii"), flush=True)
    print(f"[exit {code}]", flush=True)
    return code, text


def make_parser_tarball() -> bytes:
    buf = io.BytesIO()
    src = ROOT / "parser"
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for path in src.rglob("*"):
            if not path.is_file():
                continue
            rel = path.relative_to(src).as_posix()
            if rel.startswith("target/") or "/target/" in rel:
                continue
            tar.add(path, arcname=rel)
    return buf.getvalue()


def patch_env_parser_url(sftp: paramiko.SFTPClient) -> None:
    path = f"{REMOTE_APP}/.env"
    try:
        with sftp.file(path, "r") as f:
            raw = f.read().decode("utf-8", "replace")
    except OSError as e:
        raise SystemExit(f"Cannot read {path}: {e}") from e

    lines = raw.splitlines()
    found = False
    out: list[str] = []
    for line in lines:
        if line.startswith("PARSER_URL="):
            out.append('PARSER_URL="http://127.0.0.1:5600"')
            found = True
        else:
            out.append(line)
    if not found:
        out.append('PARSER_URL="http://127.0.0.1:5600"')
    body = "\n".join(out) + "\n"
    with sftp.file(path, "w") as f:
        f.write(body)
    print("PARSER_URL set in app .env", flush=True)


def patch_nginx(sftp: paramiko.SFTPClient, client: paramiko.SSHClient) -> None:
    path = "/etc/nginx/sites-available/startplus"
    try:
        with sftp.file(path, "r") as f:
            conf = f.read().decode("utf-8", "replace")
    except OSError as e:
        raise SystemExit(f"Cannot read nginx config: {e}") from e

    # bump body size everywhere
    conf = conf.replace("client_max_body_size 64m;", "client_max_body_size 300m;")
    if "client_max_body_size 300m;" not in conf:
        # insert into each server block after server_name line if missing
        conf = conf.replace(
            "server_name startdota.ru www.startdota.ru;",
            "server_name startdota.ru www.startdota.ru;\n    client_max_body_size 300m;",
            1,
        )

    # proxy tweaks inside location / { that proxies to 3000
    if "proxy_request_buffering off;" not in conf:
        conf = conf.replace(
            "proxy_pass http://127.0.0.1:3000;",
            "proxy_pass http://127.0.0.1:3000;\n"
            "        proxy_request_buffering off;\n"
            "        proxy_read_timeout 300s;",
        )
    elif "proxy_read_timeout 300s;" not in conf:
        conf = conf.replace(
            "proxy_request_buffering off;",
            "proxy_request_buffering off;\n        proxy_read_timeout 300s;",
        )

    with sftp.file(path, "w") as f:
        f.write(conf)

    code, _ = run(client, "nginx -t && systemctl reload nginx")
    if code != 0:
        raise SystemExit("nginx -t / reload failed")


def main() -> None:
    print("Connecting...", flush=True)
    client = connect()
    sftp = client.open_sftp()

    print("1) Install Java 17 + Maven...", flush=True)
    code, _ = run(
        client,
        "export DEBIAN_FRONTEND=noninteractive; apt-get update -qq && "
        "apt-get install -y openjdk-17-jdk-headless maven",
        timeout=900,
    )
    if code != 0:
        raise SystemExit("apt install Java/Maven failed — see output above")

    print("2) Upload parser sources + mvn package...", flush=True)
    run(client, f"rm -rf {REMOTE_PARSER} && mkdir -p {REMOTE_PARSER}")
    tgz = make_parser_tarball()
    with sftp.file("/tmp/startplus-parser.tgz", "wb") as f:
        f.write(tgz)
    run(client, f"tar -xzf /tmp/startplus-parser.tgz -C {REMOTE_PARSER}")
    code, build_out = run(client, f"cd {REMOTE_PARSER} && mvn -q package", timeout=1800)
    if code != 0:
        print("\n=== mvn package FAILED — full output above ===", flush=True)
        raise SystemExit(f"mvn package failed with exit {code}")

    code, jar_check = run(
        client,
        f"test -f {REMOTE_PARSER}/target/startplus-parser.jar && "
        f"ls -lh {REMOTE_PARSER}/target/startplus-parser.jar",
    )
    if code != 0:
        raise SystemExit("JAR missing after build")

    run(client, f"chown -R www-data:www-data {REMOTE_PARSER}")

    print("3) Install systemd unit...", flush=True)
    with sftp.file("/etc/systemd/system/startplus-parser.service", "w") as f:
        f.write(SERVICE)
    code, _ = run(
        client,
        "systemctl daemon-reload && systemctl enable --now startplus-parser && "
        "systemctl restart startplus-parser",
    )
    if code != 0:
        run(client, "journalctl -u startplus-parser -n 80 --no-pager")
        raise SystemExit("systemctl enable/start failed")

    time.sleep(2)
    print("4) Health check...", flush=True)
    code, health = run(client, "curl -sS -m 10 http://127.0.0.1:5600/health")
    if code != 0 or '{"ok":true}' not in health.replace(" ", ""):
        run(client, "systemctl status startplus-parser --no-pager -l; "
            "journalctl -u startplus-parser -n 80 --no-pager")
        print("\n=== health check FAILED — full output above ===", flush=True)
        raise SystemExit(f"health check failed: {health!r}")

    print("5) PARSER_URL in app .env + pm2 restart...", flush=True)
    patch_env_parser_url(sftp)
    run(client, "pm2 restart startplus --update-env && pm2 save")

    print("6) nginx upload limits...", flush=True)
    patch_nginx(sftp, client)

    run(
        client,
        "systemctl is-active startplus-parser; "
        "curl -sS http://127.0.0.1:5600/health; echo; "
        "grep PARSER_URL /var/www/startplus/app/.env; "
        "grep -E 'client_max_body_size|proxy_request_buffering|proxy_read_timeout' "
        "/etc/nginx/sites-available/startplus | head -n 20",
    )

    sftp.close()
    client.close()
    print("\nParser setup finished.", flush=True)


if __name__ == "__main__":
    main()

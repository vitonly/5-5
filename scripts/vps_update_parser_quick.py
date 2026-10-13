#!/usr/bin/env python3
"""Upload parser sources, rebuild with Java 21, restart service."""
from __future__ import annotations

import io
import os
import sys
import tarfile
import time
from pathlib import Path

import paramiko

PASSWORD = os.environ.get("VPS_ROOT_PASSWORD", "")
if not PASSWORD:
    raise SystemExit("Set VPS_ROOT_PASSWORD")

REMOTE = "/var/www/startplus/parser"
JAVA21 = "/usr/lib/jvm/java-21-openjdk-amd64"
ROOT = Path(__file__).resolve().parents[1]

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def run(c: paramiko.SSHClient, cmd: str, timeout: int = 1800) -> tuple[int, str]:
    print(f"\n$ {cmd[:200]}", flush=True)
    _, out, err = c.exec_command(cmd, timeout=timeout, get_pty=True)
    text = out.read().decode("utf-8", errors="replace") + err.read().decode("utf-8", errors="replace")
    code = out.channel.recv_exit_status()
    if text:
        print(text[-8000:].encode("ascii", "replace").decode("ascii"), flush=True)
    print(f"[exit {code}]", flush=True)
    return code, text


def main() -> None:
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(
        "201.34.159.109",
        username="root",
        password=PASSWORD,
        timeout=60,
        allow_agent=False,
        look_for_keys=False,
    )
    t = c.get_transport()
    if t:
        t.set_keepalive(30)
    sftp = c.open_sftp()

    print("1) Upload parser/...", flush=True)
    buf = io.BytesIO()
    src = ROOT / "parser"
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for path in src.rglob("*"):
            if not path.is_file():
                continue
            rel = path.relative_to(src).as_posix()
            if rel.startswith("target/"):
                continue
            tar.add(path, arcname=rel)
    run(c, f"mkdir -p {REMOTE} && find {REMOTE} -mindepth 1 -maxdepth 1 ! -name target -exec rm -rf {{}} +")
    with sftp.file("/tmp/startplus-parser.tgz", "wb") as f:
        f.write(buf.getvalue())
    run(c, f"tar -xzf /tmp/startplus-parser.tgz -C {REMOTE}")

    print("2) mvn clean package...", flush=True)
    code, _ = run(c, f"cd {REMOTE} && JAVA_HOME={JAVA21} mvn -q clean package", timeout=1800)
    if code != 0:
        raise SystemExit("mvn failed")
    run(c, f"ls -lh {REMOTE}/target/startplus-parser.jar && chown -R www-data:www-data {REMOTE}")

    print("3) restart + health...", flush=True)
    run(c, "systemctl restart startplus-parser")
    time.sleep(2)
    code, health = run(c, "curl -sS -m 10 http://127.0.0.1:5600/health")
    if code != 0 or "ok" not in health:
        run(c, "journalctl -u startplus-parser -n 40 --no-pager")
        raise SystemExit(f"health failed: {health!r}")

    sftp.close()
    c.close()
    print("\nParser updated.", flush=True)


if __name__ == "__main__":
    main()

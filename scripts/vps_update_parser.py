#!/usr/bin/env python3
"""Update START+ demo parser on VPS (clarity 4 / Java 21). Requires VPS_ROOT_PASSWORD."""
from __future__ import annotations

import io
import os
import sys
import tarfile
import time
from pathlib import Path

import paramiko

HOST = "201.34.159.109"
PASSWORD = os.environ.get("VPS_ROOT_PASSWORD", "")
if not PASSWORD:
    raise SystemExit("Set VPS_ROOT_PASSWORD env var")

REMOTE_PARSER = "/var/www/startplus/parser"
JAVA21 = "/usr/lib/jvm/java-21-openjdk-amd64"
JAVA_BIN = f"{JAVA21}/bin/java"
ROOT = Path(__file__).resolve().parents[1]

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

SERVICE = f"""[Unit]
Description=START+ Dota 2 replay parser (clarity)
After=network.target

[Service]
Type=simple
WorkingDirectory={REMOTE_PARSER}
ExecStart={JAVA_BIN} -Xmx1g -jar {REMOTE_PARSER}/target/startplus-parser.jar --serve 5600
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
        username="root",
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
    print(f"\n$ {cmd[:220]}{'...' if len(cmd) > 220 else ''}", flush=True)
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout, get_pty=True)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    text = out + (("\n" + err) if err.strip() else "")
    if text:
        safe = text[-12000:] if len(text) > 12000 else text
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


def main() -> None:
    print("Connecting...", flush=True)
    client = connect()
    sftp = client.open_sftp()

    print("1) Install Java 21...", flush=True)
    code, _ = run(
        client,
        "export DEBIAN_FRONTEND=noninteractive; apt-get update -qq && "
        "apt-get install -y openjdk-21-jdk-headless",
        timeout=900,
    )
    if code != 0:
        raise SystemExit("apt install openjdk-21 failed")

    code, _ = run(client, f"test -x {JAVA_BIN} && {JAVA_BIN} -version")
    if code != 0:
        raise SystemExit("Java 21 binary missing")

    print("2) Upload updated parser sources...", flush=True)
    # keep target out; wipe sources but leave dir
    run(
        client,
        f"mkdir -p {REMOTE_PARSER} && "
        f"find {REMOTE_PARSER} -mindepth 1 -maxdepth 1 ! -name target -exec rm -rf {{}} +",
    )
    tgz = make_parser_tarball()
    with sftp.file("/tmp/startplus-parser.tgz", "wb") as f:
        f.write(tgz)
    run(client, f"tar -xzf /tmp/startplus-parser.tgz -C {REMOTE_PARSER}")

    print("3) mvn clean package with Java 21...", flush=True)
    code, _ = run(
        client,
        f"cd {REMOTE_PARSER} && JAVA_HOME={JAVA21} mvn -q clean package",
        timeout=1800,
    )
    if code != 0:
        raise SystemExit("mvn clean package failed — see output above")

    code, _ = run(
        client,
        f"test -f {REMOTE_PARSER}/target/startplus-parser.jar && "
        f"ls -lh {REMOTE_PARSER}/target/startplus-parser.jar",
    )
    if code != 0:
        raise SystemExit("JAR missing after build")

    run(client, f"chown -R www-data:www-data {REMOTE_PARSER}")

    print("4) Update systemd unit (Java 21 path)...", flush=True)
    with sftp.file("/etc/systemd/system/startplus-parser.service", "w") as f:
        f.write(SERVICE)

    print("5) Restart + health...", flush=True)
    code, _ = run(
        client,
        "systemctl daemon-reload && systemctl restart startplus-parser",
    )
    if code != 0:
        run(client, "journalctl -u startplus-parser -n 80 --no-pager")
        raise SystemExit("restart failed")

    time.sleep(2)
    code, health = run(client, "curl -sS -m 10 http://127.0.0.1:5600/health")
    if code != 0 or "ok" not in health:
        run(client, "journalctl -u startplus-parser -n 80 --no-pager")
        raise SystemExit(f"health failed: {health!r}")

    print("6) Find uploaded .dem and parse...", flush=True)
    # Look for demos in uploads / tmp / parser workdirs
    _, find_out = run(
        client,
        "find /var/www/startplus /tmp -type f \\( -name '*.dem' -o -name '*.DEM' \\) "
        "2>/dev/null | head -n 40; "
        "ls -lt /var/www/startplus/uploads 2>/dev/null | head -n 30; "
        "ls -lt /tmp/*.dem 2>/dev/null | head -n 20",
    )

    # Prefer newest .dem under startplus
    code, dem_path = run(
        client,
        "DEM=$(find /var/www/startplus /tmp -type f \\( -name '*.dem' -o -name '*.DEM' \\) "
        "2>/dev/null | xargs -r ls -t 2>/dev/null | head -n 1); "
        "if [ -z \"$DEM\" ]; then echo NO_DEM; exit 2; fi; "
        "echo \"$DEM\"; ls -lh \"$DEM\"",
    )
    if code != 0 or "NO_DEM" in dem_path:
        print(
            "\n=== No .dem file found on server (uploads may only keep JSON in DB). "
            "Step 6 skipped. ===",
            flush=True,
        )
    else:
        # extract first line that looks like a path
        dem = ""
        for line in dem_path.splitlines():
            line = line.strip()
            if line.endswith(".dem") or line.endswith(".DEM"):
                # ls -lh line or bare path
                if line.startswith("/") and " " not in line:
                    dem = line
                    break
                parts = line.split()
                for p in parts:
                    if p.endswith(".dem") or p.endswith(".DEM"):
                        dem = p
                        break
            if dem:
                break
        if not dem:
            # fallback: first absolute path token
            for line in dem_path.splitlines():
                if "/var/" in line or "/tmp/" in line:
                    for tok in line.split():
                        if tok.startswith("/") and (".dem" in tok.lower()):
                            dem = tok
                            break
                if dem:
                    break

        print(f"\nUsing demo: {dem!r}", flush=True)
        print("\n=== STEP 6 OUTPUT (first 3000 bytes) ===", flush=True)
        code, parse_out = run(
            client,
            f"cd {REMOTE_PARSER} && {JAVA_BIN} -jar target/startplus-parser.jar "
            f"{dem!r} 2>&1 | head -c 3000; echo; echo EXIT:${{PIPESTATUS[0]}}",
            timeout=600,
        )
        # Also write to a file for clean capture
        run(
            client,
            f"cd {REMOTE_PARSER} && {JAVA_BIN} -jar target/startplus-parser.jar "
            f"{dem!r} > /tmp/parser-test-out.json 2> /tmp/parser-test-err.txt; "
            f"echo EXIT:$?; "
            f"head -c 3000 /tmp/parser-test-out.json; echo; "
            f"echo '--- stderr ---'; head -c 2000 /tmp/parser-test-err.txt",
            timeout=600,
        )

    sftp.close()
    client.close()
    print("\nParser update finished.", flush=True)


if __name__ == "__main__":
    main()

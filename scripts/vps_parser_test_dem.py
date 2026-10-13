#!/usr/bin/env python3
"""Find last uploaded replay matchId on VPS DB, download .dem, run parser test."""
from __future__ import annotations

import os
import sys

import paramiko

HOST = "201.34.159.109"
PASSWORD = os.environ.get("VPS_ROOT_PASSWORD", "")
PG = os.environ.get("VPS_PG_PASSWORD", "")
if not PASSWORD:
    raise SystemExit("Set VPS_ROOT_PASSWORD")
if not PG:
    raise SystemExit("Set VPS_PG_PASSWORD")

JAVA = "/usr/lib/jvm/java-21-openjdk-amd64/bin/java"
PARSER = "/var/www/startplus/parser"

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def main() -> None:
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(
        HOST,
        username="root",
        password=PASSWORD,
        timeout=60,
        allow_agent=False,
        look_for_keys=False,
    )
    # MatchReplay table — get latest with dotaMatchId
    sql = (
        "SELECT id, \\\"sessionId\\\", \\\"gameNumber\\\", \\\"dotaMatchId\\\", "
        "\\\"durationSec\\\", \\\"createdAt\\\" "
        "FROM \\\"MatchReplay\\\" ORDER BY \\\"createdAt\\\" DESC LIMIT 5;"
    )
    cmd = (
        f"PGPASSWORD={PG!r} psql -h 127.0.0.1 -U startplus -d startplus -At -F '|' "
        f"-c {sql!r}"
    )
    # avoid nested quoting hell — write sql file
    _, out, err = c.exec_command(
        f"PGPASSWORD='{PG}' psql -h 127.0.0.1 -U startplus -d startplus -At -F '|' "
        "-c \"SELECT id, \\\"sessionId\\\", \\\"gameNumber\\\", \\\"dotaMatchId\\\", "
        "\\\"durationSec\\\", \\\"createdAt\\\" FROM \\\"MatchReplay\\\" "
        "ORDER BY \\\"createdAt\\\" DESC LIMIT 5;\"",
        timeout=60,
        get_pty=True,
    )
    text = out.read().decode("utf-8", errors="replace")
    print("MatchReplay rows:\n", text, flush=True)
    print(err.read().decode("utf-8", errors="replace"), flush=True)

    match_id = None
    for line in text.splitlines():
        parts = line.strip().split("|")
        if len(parts) >= 4 and parts[3] and parts[3] not in ("", "null"):
            match_id = parts[3].strip()
            break

    if not match_id:
        print("NO_MATCH_ID — cannot download dem. Step 6 impossible without file.", flush=True)
        c.close()
        return

    print(f"Using dotaMatchId={match_id}", flush=True)
    dem = f"/tmp/test-{match_id}.dem"
    # OpenDota blob / Valve replay via opendota
    dl = (
        f"set -e; "
        f"if [ ! -s {dem} ]; then "
        f"  curl -fsSL -o {dem}.gz "
        f"    'https://api.opendota.com/api/replays?match_id={match_id}' || true; "
        # better: get cluster/replay salt then download from valve CDN
        f"  META=$(curl -fsSL 'https://api.opendota.com/api/matches/{match_id}'); "
        f"  echo \"$META\" | head -c 500; echo; "
        f"  CLUSTER=$(python3 -c \"import json,sys; d=json.load(sys.stdin); print(d.get('cluster') or '')\" <<< \"$META\"); "
        f"  SALT=$(python3 -c \"import json,sys; d=json.load(sys.stdin); print(d.get('replay_salt') or '')\" <<< \"$META\"); "
        f"  echo cluster=$CLUSTER salt=$SALT; "
        f"  if [ -n \"$CLUSTER\" ] && [ -n \"$SALT\" ]; then "
        f"    curl -fL --retry 3 -o {dem}.bz2 "
        f"      \"http://replay{CLUSTER}.valve.net/570/{match_id}_{SALT}.dem.bz2\"; "
        f"    bunzip2 -f {dem}.bz2; "
        f"  else "
        f"    echo FAIL_NO_REPLAY_META; exit 3; "
        f"  fi; "
        f"fi; "
        f"ls -lh {dem}"
    )
    _, o, e = c.exec_command(dl, timeout=600, get_pty=True)
    print(o.read().decode("utf-8", errors="replace")[-4000:], flush=True)
    print(e.read().decode("utf-8", errors="replace")[-2000:], flush=True)

    parse = (
        f"cd {PARSER} && {JAVA} -jar target/startplus-parser.jar {dem} "
        f"> /tmp/parser-test-out.json 2> /tmp/parser-test-err.txt; "
        f"echo EXIT:$?; "
        f"echo '=== stdout first 3000 ==='; "
        f"head -c 3000 /tmp/parser-test-out.json; echo; "
        f"echo '=== stderr first 2000 ==='; "
        f"head -c 2000 /tmp/parser-test-err.txt; echo"
    )
    _, o, e = c.exec_command(parse, timeout=600, get_pty=True)
    print(o.read().decode("utf-8", errors="replace"), flush=True)
    print(e.read().decode("utf-8", errors="replace"), flush=True)
    c.close()


if __name__ == "__main__":
    main()

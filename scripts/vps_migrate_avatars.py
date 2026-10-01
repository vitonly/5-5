#!/usr/bin/env python3
"""Download Vercel Blob avatars to VPS disk and rewrite User.photoUrl."""
from __future__ import annotations

import os
import re
import sys
from urllib.parse import urlparse

import paramiko

PASSWORD = os.environ["VPS_ROOT_PASSWORD"]
PG = os.environ["VPS_PG_PASSWORD"]
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

REMOTE_PY = r'''
import json, os, re, urllib.request
import subprocess

pg = os.environ["PGPASSWORD"]
env = os.environ.copy()

def psql(sql: str) -> str:
    p = subprocess.run(
        ["psql", "-h", "127.0.0.1", "-U", "startplus", "-d", "startplus", "-t", "-A", "-F", "\t", "-c", sql],
        env=env, capture_output=True, text=True,
    )
    if p.returncode != 0:
        raise SystemExit(p.stderr or p.stdout or "psql failed")
    return p.stdout

rows = []
for line in psql('SELECT id, "photoUrl" FROM "User" WHERE "photoUrl" LIKE \'https://%blob.vercel-storage.com/%\';').splitlines():
    line = line.strip()
    if not line:
        continue
    uid, url = line.split("\t", 1)
    rows.append((uid, url))

print(f"found {len(rows)} blob avatars", flush=True)
os.makedirs("/var/www/startplus/uploads", exist_ok=True)
ok = 0
fail = 0
for uid, url in rows:
    name = url.rstrip("/").split("/")[-1]
    name = re.sub(r"[^a-zA-Z0-9._-]", "_", name)
    if not name:
        name = f"{uid}.jpg"
    dest = f"/var/www/startplus/uploads/{name}"
    local_url = f"/uploads/{name}"
    try:
        urllib.request.urlretrieve(url, dest)
        # escape single quotes for SQL
        esc_uid = uid.replace("'", "''")
        esc_local = local_url.replace("'", "''")
        psql(f'UPDATE "User" SET "photoUrl" = \'{esc_local}\' WHERE id = \'{esc_uid}\';')
        print(f"OK {uid} -> {local_url}", flush=True)
        ok += 1
    except Exception as e:
        print(f"FAIL {uid}: {e}", flush=True)
        fail += 1

print(f"done ok={ok} fail={fail}", flush=True)
'''

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("201.34.159.109", username="root", password=PASSWORD, timeout=30, allow_agent=False, look_for_keys=False)
t = c.get_transport()
if t:
    t.set_keepalive(20)

sftp = c.open_sftp()
with sftp.file("/tmp/migrate_avatars.py", "w") as f:
    f.write(REMOTE_PY)
sftp.close()

pg_esc = PG.replace("'", "'\\''")
cmd = f"export PGPASSWORD='{pg_esc}'; python3 /tmp/migrate_avatars.py"
print("$ migrate avatars", flush=True)
_, o, e = c.exec_command(cmd, timeout=180, get_pty=True)
print(o.read().decode("utf-8", "replace"))
err = e.read().decode("utf-8", "replace")
if err.strip():
    print(err, file=sys.stderr)

# verify
verify = (
    f"export PGPASSWORD='{pg_esc}'; "
    "psql -h 127.0.0.1 -U startplus -d startplus -c "
    "'SELECT \"firstName\", \"photoUrl\" FROM \"User\" WHERE \"photoUrl\" IS NOT NULL AND \"photoUrl\" <> \\'\\' ORDER BY \"firstName\";'"
)
_, o, e = c.exec_command(verify, timeout=30, get_pty=True)
print(o.read().decode("utf-8", "replace"))
c.close()

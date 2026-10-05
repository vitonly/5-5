#!/usr/bin/env python3
import os, sys
import paramiko

PASSWORD = os.environ["VPS_ROOT_PASSWORD"]
PG = os.environ.get("VPS_PG_PASSWORD", "")
if not PG:
    raise SystemExit("VPS_PG_PASSWORD required")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

pg_esc = PG.replace("'", "'\\''")
remote_sh = (
    "#!/bin/bash\n"
    f"export PGPASSWORD='{pg_esc}'\n"
    "psql -h 127.0.0.1 -U startplus -d startplus <<'SQL'\n"
    'SELECT COUNT(*) FILTER (WHERE "photoUrl" IS NOT NULL AND "photoUrl" <> \'\') AS with_photo,\n'
    "       COUNT(*) AS total\n"
    'FROM "User";\n'
    'SELECT id, "firstName",\n'
    "       LEFT(COALESCE(\"photoUrl\",''), 160) AS photo\n"
    'FROM "User"\n'
    'WHERE "photoUrl" IS NOT NULL AND "photoUrl" <> \'\'\n'
    'ORDER BY "firstName";\n'
    "SQL\n"
)

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("201.34.159.109", username="root", password=PASSWORD, timeout=30, allow_agent=False, look_for_keys=False)
sftp = c.open_sftp()
with sftp.file("/tmp/inspect_photos.sh", "w") as f:
    f.write(remote_sh)
sftp.close()
_, o, e = c.exec_command("bash /tmp/inspect_photos.sh", timeout=30)
print(o.read().decode("utf-8", "replace"))
err = e.read().decode("utf-8", "replace")
if err.strip():
    print(err, file=sys.stderr)
c.close()

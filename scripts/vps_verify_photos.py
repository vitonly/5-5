#!/usr/bin/env python3
import os, sys
import paramiko

PASSWORD = os.environ["VPS_ROOT_PASSWORD"]
PG = os.environ["VPS_PG_PASSWORD"]
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

pg_esc = PG.replace("'", "'\\''")
sh = (
    "#!/bin/bash\n"
    f"export PGPASSWORD='{pg_esc}'\n"
    "psql -h 127.0.0.1 -U startplus -d startplus <<'SQL'\n"
    'SELECT "firstName", "photoUrl" FROM "User" WHERE "photoUrl" IS NOT NULL AND "photoUrl" <> \'\' ORDER BY "firstName";\n'
    "SQL\n"
    "ls /var/www/startplus/uploads/avatar-* | wc -l\n"
)

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("201.34.159.109", username="root", password=PASSWORD, timeout=30, allow_agent=False, look_for_keys=False)
sftp = c.open_sftp()
with sftp.file("/tmp/verify_photos.sh", "w") as f:
    f.write(sh)
sftp.close()
_, o, _ = c.exec_command("bash /tmp/verify_photos.sh", timeout=30)
print(o.read().decode("utf-8", "replace"))
c.close()

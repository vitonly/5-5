#!/usr/bin/env python3
from __future__ import annotations
import os, sys
import paramiko

PASSWORD = os.environ["VPS_ROOT_PASSWORD"]
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SQL = r"""
SELECT id, "firstName", coalesce("lastName",'') AS ln, coalesce(username,'') AS un, coalesce("telegramId",'') AS tg
FROM "User"
WHERE lower(coalesce(username,'')) LIKE '%cat%'
   OR lower(coalesce(username,'')) LIKE '%63%'
   OR lower("firstName") LIKE '%рома%'
   OR lower(coalesce("lastName",'')) LIKE '%рома%'
   OR lower(coalesce("lastName",'')) LIKE '%cat%'
ORDER BY "firstName";

SELECT COUNT(*) AS mvp_votes FROM "MatchDayMvpVote";

SELECT s.date::date, voter."firstName", coalesce(voter.username,''), nominee."firstName", coalesce(nominee.username,''), s."mvpResolved"
FROM "MatchDayMvpVote" v
JOIN "MatchSession" s ON s.id = v."sessionId"
JOIN "User" voter ON voter.id = v."voterId"
JOIN "User" nominee ON nominee.id = v."nomineeId"
ORDER BY s.date DESC, v."createdAt" DESC
LIMIT 25;
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("201.34.159.109", username="root", password=PASSWORD, timeout=60, allow_agent=False, look_for_keys=False)
sftp = c.open_sftp()
with sftp.file("/tmp/find_roman.sql", "w") as f:
    f.write(SQL)
sftp.close()
_, o, _ = c.exec_command(
    "sudo -u postgres psql -d startplus -f /tmp/find_roman.sql > /tmp/find_roman.out 2>&1; echo EXIT:$?; cat /tmp/find_roman.out",
    timeout=120,
)
print(o.read().decode("utf-8", "replace"))
c.close()

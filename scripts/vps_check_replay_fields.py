#!/usr/bin/env python3
"""Inspect MatchReplay.data player fields on VPS. Do not commit secrets."""
import os
import sys

import paramiko

PASSWORD = os.environ.get("VPS_ROOT_PASSWORD", "")
if not PASSWORD:
    raise SystemExit("Set VPS_ROOT_PASSWORD")

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

sql = r"""
SELECT jsonb_agg(jsonb_build_object(
  'name', p->>'name',
  'heroDamage', p->>'heroDamage',
  'obsPlaced', p->>'obsPlaced',
  'campsStacked', p->>'campsStacked',
  'nwTimelineLen', jsonb_array_length(COALESCE(p->'nwTimeline', '[]'::jsonb)),
  'nwTimelineHead', (p->'nwTimeline')->0,
  'kills', p->>'kills',
  'netWorth', p->>'netWorth'
))
FROM "MatchReplay" r,
LATERAL jsonb_array_elements(r.data->'players') p
WHERE r.id = (SELECT id FROM "MatchReplay" ORDER BY "createdAt" DESC LIMIT 1);
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("201.34.159.109", username="root", password=PASSWORD, timeout=60, allow_agent=False, look_for_keys=False)
b64 = __import__("base64").b64encode(sql.encode()).decode()
cmd = f"echo {b64} | base64 -d > /tmp/q.sql && sudo -u postgres psql -d startplus -t -A -f /tmp/q.sql"
_, o, e = c.exec_command(cmd, timeout=60, get_pty=True)
out = (o.read() + e.read()).decode("utf-8", "replace")
print(out[-12000:])
c.close()

#!/usr/bin/env python3
"""Move Cat62ok MVP vote to Free4EE and fix winner/points if needed."""
from __future__ import annotations

import os
import sys

import paramiko

PASSWORD = os.environ.get("VPS_ROOT_PASSWORD", "")
if not PASSWORD:
    raise SystemExit("Set VPS_ROOT_PASSWORD")
APPLY = "--apply" in sys.argv
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SQL_PRE = r"""
SELECT s.id, s."mvpResolved", s."mvpWinnerId", w.username AS winner_u, w."firstName" AS winner_fn
FROM "MatchSession" s
LEFT JOIN "User" w ON w.id = s."mvpWinnerId"
WHERE s.date::date = DATE '2026-10-03'
ORDER BY s.date DESC LIMIT 3;

SELECT pl.id, pl."userId", u.username, pl.delta, pl.reason, pl."sourceId"
FROM "PointLog" pl
JOIN "User" u ON u.id = pl."userId"
WHERE pl."sourceType" = 'MATCH_MVP'
ORDER BY pl."createdAt" DESC LIMIT 10;

SELECT nominee.username, nominee."firstName", COUNT(*) AS votes
FROM "MatchDayMvpVote" v
JOIN "User" nominee ON nominee.id = v."nomineeId"
JOIN "MatchSession" s ON s.id = v."sessionId"
WHERE s.date::date = DATE '2026-10-03'
GROUP BY nominee.username, nominee."firstName"
ORDER BY votes DESC;
"""

SQL_APPLY = r"""
BEGIN;

-- 1) Move Cat62ok vote -> Free4EE
UPDATE "MatchDayMvpVote" v
SET "nomineeId" = (SELECT id FROM "User" WHERE lower(username) = 'free4ee' LIMIT 1)
WHERE v."voterId" = (SELECT id FROM "User" WHERE lower(username) = 'cat62ok' LIMIT 1)
  AND v."sessionId" = (
    SELECT s.id FROM "MatchSession" s
    WHERE s.date::date = DATE '2026-10-03'
    ORDER BY s.date DESC LIMIT 1
  );

-- 2) Recompute winner for that session
WITH sess AS (
  SELECT id FROM "MatchSession"
  WHERE date::date = DATE '2026-10-03'
  ORDER BY date DESC LIMIT 1
),
counts AS (
  SELECT "nomineeId", COUNT(*)::int AS c
  FROM "MatchDayMvpVote"
  WHERE "sessionId" = (SELECT id FROM sess)
  GROUP BY "nomineeId"
),
mx AS (SELECT MAX(c) AS m FROM counts),
winners AS (
  SELECT "nomineeId" FROM counts, mx WHERE c = m
),
new_winner AS (
  SELECT CASE WHEN (SELECT COUNT(*) FROM winners) = 1
    THEN (SELECT "nomineeId" FROM winners)
    ELSE NULL END AS id
)
UPDATE "MatchSession" s
SET "mvpWinnerId" = (SELECT id FROM new_winner)
WHERE s.id = (SELECT id FROM sess);

-- 3) Fix points: remove old MATCH_MVP for this session, add to new winner if any
WITH sess AS (
  SELECT id, "mvpWinnerId" FROM "MatchSession"
  WHERE date::date = DATE '2026-10-03'
  ORDER BY date DESC LIMIT 1
),
old_logs AS (
  SELECT pl.id, pl."userId", pl.delta
  FROM "PointLog" pl
  WHERE pl."sourceType" = 'MATCH_MVP'
    AND pl."sourceId" = (SELECT id FROM sess)
)
UPDATE "PlayerProfile" pp
SET "totalPoints" = "totalPoints" - ol.delta
FROM old_logs ol
WHERE pp."userId" = ol."userId";

DELETE FROM "PointLog"
WHERE "sourceType" = 'MATCH_MVP'
  AND "sourceId" = (
    SELECT id FROM "MatchSession"
    WHERE date::date = DATE '2026-10-03'
    ORDER BY date DESC LIMIT 1
  );

-- Insert new MVP points if unique winner
WITH sess AS (
  SELECT id, "mvpWinnerId" FROM "MatchSession"
  WHERE date::date = DATE '2026-10-03'
  ORDER BY date DESC LIMIT 1
),
season AS (
  SELECT id FROM "RatingSeason" WHERE "isActive" = true ORDER BY "createdAt" DESC LIMIT 1
)
INSERT INTO "PointLog" (id, "userId", delta, reason, "seasonId", "sourceType", "sourceId", "createdAt")
SELECT
  md5(random()::text || clock_timestamp()::text),
  s."mvpWinnerId",
  0.5,
  'MVP игрового дня 5v5',
  (SELECT id FROM season),
  'MATCH_MVP',
  s.id,
  NOW()
FROM sess s
WHERE s."mvpWinnerId" IS NOT NULL;

UPDATE "PlayerProfile" pp
SET "totalPoints" = "totalPoints" + 0.5
WHERE pp."userId" = (
  SELECT "mvpWinnerId" FROM "MatchSession"
  WHERE date::date = DATE '2026-10-03'
  ORDER BY date DESC LIMIT 1
)
AND (
  SELECT "mvpWinnerId" FROM "MatchSession"
  WHERE date::date = DATE '2026-10-03'
  ORDER BY date DESC LIMIT 1
) IS NOT NULL;

-- Verify
SELECT 'VOTE' AS k, voter.username, nominee.username, nominee."firstName"
FROM "MatchDayMvpVote" v
JOIN "User" voter ON voter.id = v."voterId"
JOIN "User" nominee ON nominee.id = v."nomineeId"
WHERE lower(voter.username) = 'cat62ok';

SELECT 'TALLY' AS k, nominee.username, nominee."firstName", COUNT(*)::text
FROM "MatchDayMvpVote" v
JOIN "User" nominee ON nominee.id = v."nomineeId"
JOIN "MatchSession" s ON s.id = v."sessionId"
WHERE s.date::date = DATE '2026-10-03'
GROUP BY nominee.username, nominee."firstName"
ORDER BY COUNT(*) DESC;

SELECT 'WINNER' AS k, s."mvpWinnerId", u.username, u."firstName"
FROM "MatchSession" s
LEFT JOIN "User" u ON u.id = s."mvpWinnerId"
WHERE s.date::date = DATE '2026-10-03';

SELECT 'POINTS' AS k, u.username, pl.delta::text, pl.reason
FROM "PointLog" pl
JOIN "User" u ON u.id = pl."userId"
WHERE pl."sourceType" = 'MATCH_MVP'
ORDER BY pl."createdAt" DESC LIMIT 5;

COMMIT;
"""


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
    sftp = c.open_sftp()
    body = SQL_PRE + ("\n" + SQL_APPLY if APPLY else "\nSELECT 'DRY_RUN' AS k;\n")
    with sftp.file("/tmp/mvp_fix.sql", "w") as f:
        f.write(body)
    sftp.close()

    cmd = (
        "sudo -u postgres psql -d startplus -v ON_ERROR_STOP=1 "
        "-f /tmp/mvp_fix.sql > /tmp/mvp_fix.out 2>&1; "
        "echo EXIT:$?; cat /tmp/mvp_fix.out"
    )
    print(f"$ {cmd}", flush=True)
    _, o, _ = c.exec_command(cmd, timeout=120)
    print(o.read().decode("utf-8", "replace"), flush=True)
    c.close()
    if not APPLY:
        print("Dry-run done. Re-run with --apply", flush=True)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Inspect latest match session winners vs game2 assignments."""
from __future__ import annotations

import os
import sys

import paramiko

HOST = "201.34.159.109"
PASSWORD = os.environ.get("VPS_ROOT_PASSWORD", "")
if not PASSWORD:
    raise SystemExit("Set VPS_ROOT_PASSWORD")

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

REMOTE_JS = r"""
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  const s=await p.matchSession.findFirst({
    orderBy:{date:'desc'},
    include:{games:{orderBy:{gameNumber:'asc'}, include:{participants:true}}}
  });
  if(!s){ console.log('none'); await p.$disconnect(); return; }
  const g1=JSON.parse(s.teamAssignments||'{}');
  const g2=JSON.parse(s.teamAssignmentsGame2||'{}');
  const radiant=JSON.parse(s.radiantPlayerIds||'[]');
  const dire=JSON.parse(s.direPlayerIds||'[]');
  const g2r=Object.entries(g2).filter(([,a])=>a.team==='RADIANT').map(([id])=>id);
  const g2d=Object.entries(g2).filter(([,a])=>a.team==='DIRE').map(([id])=>id);
  const out={
    date:s.date,
    status:s.status,
    sideScore:{
      radiant:s.games.filter(g=>g.winnerTeam==='RADIANT').length,
      dire:s.games.filter(g=>g.winnerTeam==='DIRE').length,
    },
    games:s.games.map(g=>({
      n:g.gameNumber,
      winner:g.winnerTeam,
      winners:g.participants.filter(x=>x.won).map(x=>x.userId),
    })),
    g1:{radiant, dire},
    g2:{radiant:g2r, dire:g2d, size:Object.keys(g2).length},
  };
  // continuity score vs g1 rosters
  let left=0,right=0;
  for (const g of s.games) {
    if (g.winnerTeam!=='RADIANT' && g.winnerTeam!=='DIRE') continue;
    const assign = g.gameNumber>=2 && Object.keys(g2).length ? g2 : g1;
    const winnerIds=Object.entries(assign).filter(([,a])=>a.team===g.winnerTeam).map(([id])=>id);
    const oR=winnerIds.filter(id=>radiant.includes(id)).length;
    const oD=winnerIds.filter(id=>dire.includes(id)).length;
    if (oR>oD) left++; else if (oD>oR) right++; else if (g.winnerTeam==='RADIANT') left++; else right++;
  }
  out.continuityScore={left,right};
  console.log(JSON.stringify(out,null,2));
  await p.$disconnect();
})().catch(e=>{ console.error(e); process.exit(1); });
"""


def main() -> None:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        HOST,
        username="root",
        password=PASSWORD,
        timeout=60,
        allow_agent=False,
        look_for_keys=False,
    )
    sftp = client.open_sftp()
    with sftp.file("/var/www/startplus/app/_check_match_score.js", "w") as f:
        f.write(REMOTE_JS)
    sftp.close()
    _, stdout, stderr = client.exec_command(
        "cd /var/www/startplus/app && node _check_match_score.js; rm -f _check_match_score.js",
        timeout=60,
        get_pty=True,
    )
    text = stdout.read().decode("utf-8", "replace") + stderr.read().decode("utf-8", "replace")
    print(text[-6000:])
    client.close()


if __name__ == "__main__":
    main()

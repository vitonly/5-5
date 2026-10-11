#!/usr/bin/env python3
"""Smoke admin mute/kick/move against LiveKit RoomService via Next API."""
from __future__ import annotations

import os
import sys

import paramiko

PASSWORD = os.environ.get("VPS_ROOT_PASSWORD", "")
if not PASSWORD:
    raise SystemExit("Set VPS_ROOT_PASSWORD")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

CMD = r"""
set -e
cd /var/www/startplus/app
node <<'NODE'
const fs = require('fs');
const { SignJWT } = require('jose');
const { AccessToken, RoomServiceClient, TrackSource } = require('livekit-server-sdk');
const { PrismaClient } = require('@prisma/client');

function loadEnv() {
  return Object.fromEntries(
    fs.readFileSync('.env','utf8').split('\n')
      .map(l => l.trim()).filter(l => l && !l.startsWith('#') && l.includes('='))
      .map(l => { const i=l.indexOf('='); return [l.slice(0,i), l.slice(i+1).replace(/^"|"$/g,'')]; })
  );
}

(async () => {
  const env = loadEnv();
  const prisma = new PrismaClient();
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, firstName: true } });
  const student = await prisma.user.findFirst({
    where: { role: 'STUDENT' },
    select: { id: true, firstName: true },
  });
  if (!admin || !student) throw new Error('need admin+student');

  const cookieTok = await new SignJWT({ userId: admin.id })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode(env.JWT_SECRET));

  // Mint a fake participant join for student into voice-1 via RoomService create+...
  // Actually join requires WebRTC. We only test admin API error paths + list.
  // Create room and simulate participant via token mint + RoomService isn't enough without connect.
  // Test admin endpoints respond correctly for missing participant.
  async function post(body) {
    const res = await fetch('http://127.0.0.1:3000/api/voice/admin', {
      method: 'POST',
      headers: { Cookie: `dota_session=${cookieTok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text: text.slice(0, 300) };
  }

  console.log('mute missing', await post({ action: 'mute', roomId: 'voice-1', identity: 'nobody', muted: true }));
  console.log('kick missing', await post({ action: 'kick', roomId: 'voice-1', identity: 'nobody' }));
  console.log('move missing', await post({ action: 'move', fromRoomId: 'voice-1', toRoomId: 'voice-2', identity: 'nobody' }));

  // Direct RoomService: create rooms, mint token for student (capacity check)
  const client = new RoomServiceClient(env.LIVEKIT_INTERNAL_URL, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
  for (const name of ['voice-1', 'voice-2']) {
    try {
      await client.createRoom({ name, emptyTimeout: 3600, maxParticipants: 5 });
    } catch {}
  }
  const rooms = await client.listRooms();
  console.log('lk rooms', rooms.map(r => r.name));

  // Capacity: mint 5 tokens shouldn't fail at mint time without participants; listParticipants empty
  const parts = await client.listParticipants('voice-1').catch(() => []);
  console.log('participants voice-1', parts.length);

  // Verify moveParticipant exists
  console.log('hasMove', typeof client.moveParticipant === 'function');

  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
NODE
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
    _, o, e = c.exec_command(CMD, timeout=120, get_pty=True)
    print((o.read() + e.read()).decode("utf-8", "replace"), flush=True)
    c.close()


if __name__ == "__main__":
    main()

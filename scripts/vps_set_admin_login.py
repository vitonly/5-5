#!/usr/bin/env python3
"""Set ADMIN user login/password on VPS (creds from env, not committed)."""
from __future__ import annotations

import os
import sys

import paramiko

PASSWORD = os.environ.get("VPS_ROOT_PASSWORD", "")
ADMIN_LOGIN = os.environ.get("ADMIN_SITE_LOGIN", "admin")
ADMIN_PASS = os.environ.get("ADMIN_SITE_PASSWORD", "")

if not PASSWORD:
    raise SystemExit("Set VPS_ROOT_PASSWORD")
if not ADMIN_PASS:
    raise SystemExit("Set ADMIN_SITE_PASSWORD")

HOST = "201.34.159.109"
REMOTE_APP = "/var/www/startplus/app"

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

    # Pass via env on remote shell — not echoed into repo files
    cmd = (
        f"cd {REMOTE_APP} && "
        f"ADMIN_SITE_LOGIN={repr(ADMIN_LOGIN)} ADMIN_SITE_PASSWORD={repr(ADMIN_PASS)} "
        "node <<'NODE'\n"
        "const { PrismaClient } = require('@prisma/client');\n"
        "const crypto = require('crypto');\n"
        "function hashPassword(password) {\n"
        "  const salt = crypto.randomBytes(16).toString('hex');\n"
        "  const hash = crypto.scryptSync(password, salt, 64).toString('hex');\n"
        "  return `${salt}:${hash}`;\n"
        "}\n"
        "const login = process.env.ADMIN_SITE_LOGIN;\n"
        "const password = process.env.ADMIN_SITE_PASSWORD;\n"
        "const p = new PrismaClient();\n"
        "(async () => {\n"
        "  const conflict = await p.user.findFirst({ where: { login, role: { not: 'ADMIN' } } });\n"
        "  if (conflict) throw new Error('login taken by non-admin');\n"
        "  let admin = await p.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' } });\n"
        "  if (!admin) {\n"
        "    admin = await p.user.create({\n"
        "      data: {\n"
        "        firstName: 'Admin',\n"
        "        role: 'ADMIN',\n"
        "        login,\n"
        "        passwordHash: hashPassword(password),\n"
        "        profile: { create: {} },\n"
        "      },\n"
        "    });\n"
        "    console.log('created', admin.id);\n"
        "  } else {\n"
        "    await p.user.update({\n"
        "      where: { id: admin.id },\n"
        "      data: { login, passwordHash: hashPassword(password) },\n"
        "    });\n"
        "    console.log('updated', admin.id);\n"
        "  }\n"
        "  await p.$disconnect();\n"
        "})().catch((e) => { console.error(e); process.exit(1); });\n"
        "NODE"
    )

    print("Setting admin login on VPS…", flush=True)
    _, o, e = c.exec_command(cmd, timeout=60, get_pty=True)
    out = o.read().decode("utf-8", "replace") + e.read().decode("utf-8", "replace")
    code = o.channel.recv_exit_status()
    # never print password; show only result lines
    for line in out.splitlines():
        if "password" in line.lower() and "hash" not in line.lower():
            continue
        print(line)
    c.close()
    if code != 0:
        raise SystemExit(code)
    print("ok login=", ADMIN_LOGIN, flush=True)


if __name__ == "__main__":
    main()

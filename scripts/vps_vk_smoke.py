#!/usr/bin/env python3
"""Smoke-check VK ID auth endpoints on production."""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

import paramiko

PASSWORD = os.environ.get("VPS_ROOT_PASSWORD", "")
HOST = "201.34.159.109"
BASE = "https://www.startdota.ru"
REMOTE_APP = "/var/www/startplus/app"

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        return None


def http_no_follow(url: str) -> tuple[int, str]:
    opener = urllib.request.build_opener(NoRedirect)
    req = urllib.request.Request(url, method="GET")
    try:
        with opener.open(req, timeout=20) as res:
            return res.status, res.geturl()
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("Location", "")
    except Exception as e:
        return 0, str(e)


def main() -> None:
    code, loc = http_no_follow(f"{BASE}/api/auth/vk/start")
    print("start no pd:", code, loc)
    ok_pd = "pd_required" in loc

    code2, loc2 = http_no_follow(f"{BASE}/api/auth/vk/start?pd=1")
    print("start pd=1:", code2, loc2[:220])
    configured = "id.vk.ru" in loc2
    not_cfg = "vk_not_configured" in loc2

    opener = urllib.request.build_opener()
    with opener.open(f"{BASE}/login", timeout=20) as res:
        body = res.read().decode("utf-8", "replace")
        login_status = res.status
    # Client component text lives in JS chunks, not the shell HTML.
    has_vk_ui = ("VK ID" in body) or ("auth/vk/start" in body) or ("0077FF" in body)
    if not has_vk_ui:
        import re

        for path in re.findall(r"/_next/static/chunks/[^\"']+\.js", body)[:40]:
            try:
                with opener.open(BASE + path, timeout=20) as cres:
                    js = cres.read().decode("utf-8", "replace")
            except Exception:
                continue
            if "VK ID" in js or "auth/vk/start" in js or "0077FF" in js:
                has_vk_ui = True
                break
    print("login page:", login_status, "vk_ui" if has_vk_ui else "missing_vk_ui")

    env_set = {}
    cols_ok = False
    if PASSWORD:
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
        remote = r"""
python3 - <<'PY'
from pathlib import Path
keys = ("VK_CLIENT_ID","VK_CLIENT_SECRET","VK_SERVICE_TOKEN","NEXT_PUBLIC_VK_CLIENT_ID","ADMIN_VK_IDS")
vals = {}
for line in Path("/var/www/startplus/app/.env").read_text(encoding="utf-8", errors="replace").splitlines():
    if "=" not in line or line.strip().startswith("#"):
        continue
    k,v = line.split("=",1)
    k = k.strip()
    if k in keys:
        vals[k] = bool(v.strip().strip('"').strip("'"))
for k in keys:
    print(f"{k}={'set' if vals.get(k) else 'empty'}")
PY
"""
        _, o, _ = c.exec_command(remote, timeout=30)
        env_out = o.read().decode("utf-8", "replace")
        print("env status:\n" + env_out)
        for line in env_out.splitlines():
            if "=" in line:
                k, st = line.strip().split("=", 1)
                env_set[k] = st == "set"

        _, o2, _ = c.exec_command(
            "cd /var/www/startplus/app && node -e \""
            "const {PrismaClient}=require('@prisma/client');"
            "const p=new PrismaClient();"
            "p.\\$queryRawUnsafe(\\\"SELECT column_name FROM information_schema.columns "
            "WHERE table_name='User' AND column_name IN ('vkId','vkScreenName')\\\")"
            ".then(r=>{console.log(JSON.stringify(r));return p.\\$disconnect();})"
            ".catch(e=>{console.error(String(e));process.exit(1);});"
            "\"",
            timeout=60,
        )
        cols = o2.read().decode("utf-8", "replace")
        print("db columns:", cols.strip()[-400:])
        cols_ok = "vkId" in cols and "vkScreenName" in cols
        c.close()

    summary = {
        "pd_gate": ok_pd,
        "oauth_or_pending_app": configured or not_cfg,
        "login_ok": login_status == 200 and has_vk_ui,
        "schema_ok": cols_ok if PASSWORD else True,
        "vk_app_ready": configured,
        "secrets_present": bool(env_set.get("VK_CLIENT_ID")),
    }
    print("summary", json.dumps(summary, ensure_ascii=False))
    if not (
        summary["pd_gate"]
        and summary["oauth_or_pending_app"]
        and summary["login_ok"]
        and summary["schema_ok"]
    ):
        raise SystemExit(1)
    print("ok")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Перенос файлов домашек из старого хранилища Vercel Blob (за границей) на наш сервер.

Старые сдачи домашек ссылаются на https://….public.blob.vercel-storage.com/… .
Скрипт на сервере:
  1. делает копию базы (pg_dump) в /var/backups/startplus;
  2. скачивает каждый такой файл в /var/www/startplus/uploads (имя — как у обычной загрузки);
  3. меняет ссылку в сдаче на /uploads/… — только если файл скачался целиком;
  4. сохраняет таблицу «старая ссылка → новая» в /var/backups/startplus/blob-migration-<время>.json.
Сами файлы в Vercel скрипт НЕ удаляет — это делается вручную в панели Vercel после проверки.

Запуск:
  python scripts/vps_migrate_blob_files.py           — только показать, что будет перенесено
  python scripts/vps_migrate_blob_files.py --apply   — перенести
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko

HOST = "201.34.159.109"
SSH_KEY = Path(os.environ.get("VPS_SSH_KEY", str(Path.home() / ".ssh" / "id_ed25519_startdota")))

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Программа, которая выполняется на сервере (python3 + psql уже есть)
REMOTE = r'''
import json, os, re, subprocess, sys, time, urllib.parse, urllib.request
APPLY = sys.argv[1] == "apply"
ENV = "/var/www/startplus/app/.env"
UPLOADS = "/var/www/startplus/uploads"
BACKUPS = "/var/backups/startplus"
ALLOWED = {"png","jpg","jpeg","webp","gif","bmp","heic","heif","avif","tif","tiff","mp4","mov","webm",
           "pdf","txt","doc","docx","ppt","pptx","odt","odp","dem"}
url = next(l.split("=",1)[1].strip().strip('"') for l in open(ENV) if l.startswith("DATABASE_URL="))

def psql(sql):
    return subprocess.run(["psql", url, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], capture_output=True, text=True, check=True).stdout

rows = [l.split("|", 1) for l in psql(
    "select id, \"fileUrls\" from \"HomeworkSubmission\" where \"fileUrls\" like '%vercel-storage.com%'").splitlines() if l]
total = sum(1 for _, f in rows for u in json.loads(f) if "vercel-storage.com" in u)
print(f"сдач со старыми файлами: {len(rows)}, файлов: {total}")
if not APPLY:
    print("это предпросмотр — ничего не изменено (запустите с --apply)")
    sys.exit(0)

os.makedirs(BACKUPS, exist_ok=True)
stamp = time.strftime("%Y%m%d-%H%M%S")
subprocess.run(["pg_dump", url, "-F", "c", "-f", f"{BACKUPS}/before-blob-migration-{stamp}.dump"], check=True)
os.chmod(f"{BACKUPS}/before-blob-migration-{stamp}.dump", 0o600)
print("копия базы сделана")

mapping, moved, failed = {}, 0, 0
for sub_id, files_json in rows:
    files = json.loads(files_json)
    new_files = []
    for u in files:
        if "vercel-storage.com" not in u:
            new_files.append(u); continue
        # Имя файла — как у обычной загрузки на сайте: время-имя.расширение, только безопасные символы
        name = urllib.parse.unquote(u.rsplit("/", 1)[-1].split("?")[0])
        base, _, ext = name.rpartition(".")
        ext = ext.lower()
        if not base or ext not in ALLOWED:
            print("  пропущен (неизвестный тип файла)"); failed += 1; new_files.append(u); continue
        safe = re.sub(r"[^A-Za-z0-9._-]", "_", base).replace(".", "_")[:80] or "file"
        target = f"{int(time.time() * 1000)}-{safe}.{ext}"
        time.sleep(0.002)   # чтобы время в имени не совпало у двух файлов
        try:
            with urllib.request.urlopen(u, timeout=60) as r:
                data = r.read()
            if not data:
                raise ValueError("пустой файл")
            with open(f"{UPLOADS}/{target}", "wb") as f:
                f.write(data)
            os.chmod(f"{UPLOADS}/{target}", 0o644)
            mapping[u] = f"/uploads/{target}"
            new_files.append(f"/uploads/{target}")
            moved += 1
        except Exception as e:
            print(f"  не скачался: {e}"); failed += 1; new_files.append(u)
    if new_files != files:
        value = json.dumps(new_files, ensure_ascii=False)
        psql(f"update \"HomeworkSubmission\" set \"fileUrls\" = $j${value}$j$ where id = $i${sub_id}$i$")

with open(f"{BACKUPS}/blob-migration-{stamp}.json", "w", encoding="utf-8") as f:
    json.dump(mapping, f, ensure_ascii=False, indent=1)
os.chmod(f"{BACKUPS}/blob-migration-{stamp}.json", 0o600)
left = psql("select count(*) from \"HomeworkSubmission\" where \"fileUrls\" like '%vercel-storage.com%'").strip()
print(f"перенесено файлов: {moved}, не удалось: {failed}; сдач со старыми ссылками осталось: {left}")
print(f"таблица соответствия: {BACKUPS}/blob-migration-{stamp}.json")
'''


def main() -> None:
    mode = "apply" if "--apply" in sys.argv else "dry"
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", timeout=30, allow_agent=False, look_for_keys=False,
              pkey=paramiko.Ed25519Key.from_private_key_file(str(SSH_KEY)))
    stdin, out, err = c.exec_command(f"python3 - {mode}", timeout=900)
    stdin.write(REMOTE)
    stdin.channel.shutdown_write()
    code = out.channel.recv_exit_status()
    print(out.read().decode("utf-8", "replace") + err.read().decode("utf-8", "replace")[-2000:])
    c.close()
    if code != 0:
        raise SystemExit(f"Ошибка (код {code})")


if __name__ == "__main__":
    main()

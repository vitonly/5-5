#!/usr/bin/env python3
"""
Выкладка сайта СТАРТ+ «релизами» — без падения сайта во время сборки.

Как устроено на сервере (/var/www/startplus):
  releases/<дата-время>/  — полная копия сайта для каждой выкладки (храним 3 последние)
  shared/.env             — один общий .env, в каждом релизе на него ссылка
  app -> releases/...     — ссылка на текущий релиз (pm2 запускает сайт из app)
  uploads/                — загрузки учеников, общие для всех релизов

Что делает обычная выкладка:
  1. Смотрит, какой коммит выложен сейчас (файл .deployed-commit в текущем релизе),
     и берёт из git всё, что изменилось с тех пор до HEAD (src/, prisma/, public/, package*.json …).
  2. Копирует текущий релиз в новую папку и кладёт туда изменённые файлы. Работающий сайт не трогаем.
  3. Если изменились package.json / package-lock.json — npm ci.
     Если изменилась схема базы — копия базы (pg_dump) и prisma db push БЕЗ --accept-data-loss.
  4. Собирает новый релиз. Не собрался — новая папка удаляется, сайт работает как работал.
  5. Переключает ссылку app на новый релиз и перезапускает сайт (пара секунд).
     Сайт не ответил — ссылка возвращается на прежний релиз.

Запуск (с компьютера, где лежит SSH-ключ от VPS; рабочая папка git — чистая):
  python scripts/vps_release.py --dry-run         — только показать, что поедет на сервер
  python scripts/vps_release.py                   — выложить HEAD
  python scripts/vps_release.py --since <коммит>  — если на сервере ещё нет .deployed-commit
  python scripts/vps_release.py --migrate         — один раз: перевести сервер на релизы
  python scripts/vps_release.py --rollback        — вернуть предыдущий релиз
"""
from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

import paramiko

HOST = "201.34.159.109"
SSH_KEY = Path(os.environ.get("VPS_SSH_KEY", str(Path.home() / ".ssh" / "id_ed25519_startdota")))
ROOT = Path(__file__).resolve().parents[1]
BASE = "/var/www/startplus"
APP = f"{BASE}/app"
RELEASES = f"{BASE}/releases"
SHARED_ENV = f"{BASE}/shared/.env"
UPLOADS = f"{BASE}/uploads"
KEEP = 3   # сколько релизов хранить

# Что из репозитория относится к сайту (scripts/, igra/, docs/ на сайт не едут)
SITE_PATHS = ["src", "prisma", "public", "package.json", "package-lock.json",
              "next.config.ts", "tsconfig.json", "postcss.config.mjs", "eslint.config.mjs"]

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


# ---------- Помощники ----------

def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True,
                          encoding="utf-8", check=True).stdout.strip()


def connect() -> paramiko.SSHClient:
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", timeout=60, banner_timeout=60, auth_timeout=60,
              allow_agent=False, look_for_keys=False,
              pkey=paramiko.Ed25519Key.from_private_key_file(str(SSH_KEY)))
    t = c.get_transport()
    if t:
        t.set_keepalive(30)
    return c


def run(c: paramiko.SSHClient, cmd: str, timeout: int = 1800, quiet: bool = False) -> tuple[int, str]:
    print(f"\n$ {cmd if len(cmd) < 220 else cmd[:220] + '…'}", flush=True)
    _, out, err = c.exec_command(cmd, timeout=timeout)
    text = out.read().decode("utf-8", "replace") + err.read().decode("utf-8", "replace")
    code = out.channel.recv_exit_status()
    if text.strip() and not quiet:
        print(text[-4000:].rstrip(), flush=True)
    print(f"[exit {code}]", flush=True)
    return code, text


def site_ok(c: paramiko.SSHClient) -> bool:
    """Сайт отвечает: ждём до 60 секунд, пока страница входа не вернёт 200."""
    code, _ = run(c, "for i in $(seq 1 30); do "
                     "s=$(curl -s -o /dev/null -w '%{http_code}' -m 10 http://127.0.0.1:3000/login); "
                     "[ \"$s\" = 200 ] && echo OK && exit 0; sleep 2; done; echo FAIL; exit 1")
    return code == 0


def current_release(c: paramiko.SSHClient) -> str:
    _, out = run(c, f"readlink -f {APP}", quiet=True)
    return out.strip()


# ---------- Один раз: перевести сервер на релизы ----------

def migrate(c: paramiko.SSHClient, since: str) -> None:
    code, out = run(c, f"test -L {APP} && echo LINK || echo DIR", quiet=True)
    if "LINK" in out:
        raise SystemExit("Сервер уже работает на релизах")
    ts = time.strftime("%Y%m%d-%H%M%S")
    rel = f"{RELEASES}/{ts}"
    steps = [
        f"mkdir -p {RELEASES} {BASE}/shared && chmod 700 {BASE}/shared",
        f"cp -a {APP}/.env {SHARED_ENV} && chmod 600 {SHARED_ENV}",
        # Полная копия работающего сайта (вместе с node_modules и сборкой)
        f"rsync -a {APP}/ {rel}/",
        f"cd {rel} && rm -f .env && ln -s {SHARED_ENV} .env && echo {since} > .deployed-commit",
    ]
    for s in steps:
        if run(c, s)[0] != 0:
            raise SystemExit("Миграция остановлена — работающий сайт не тронут")
    # Подмена: старую папку оставляем рядом как резервную копию
    run(c, f"mv {APP} {BASE}/app.pre-releases && ln -s {rel} {APP} && pm2 restart startplus")
    if not site_ok(c):
        print("\nСайт не ответил — возвращаю как было", flush=True)
        run(c, f"rm -f {APP} && mv {BASE}/app.pre-releases {APP} && pm2 restart startplus")
        raise SystemExit(1)
    print(f"\nГотово: сайт работает из {rel}. Старая папка — {BASE}/app.pre-releases (можно удалить позже).")


# ---------- Откат на предыдущий релиз ----------

def rollback(c: paramiko.SSHClient) -> None:
    cur = current_release(c)
    _, out = run(c, f"ls -1d {RELEASES}/*/ | sed 's:/$::' | sort", quiet=True)
    rels = [r for r in out.split() if r]
    older = [r for r in rels if r < cur]
    if not older:
        raise SystemExit("Предыдущего релиза нет")
    prev = older[-1]
    run(c, f"ln -sfn {prev} {APP}.new && mv -Tf {APP}.new {APP} && pm2 restart startplus")
    print("\nОткатились на " + prev if site_ok(c) else "\nВНИМАНИЕ: сайт не отвечает после отката")


# ---------- Обычная выкладка ----------

def changed_files(since: str) -> tuple[list[str], list[str]]:
    """Изменённые и удалённые файлы сайта между выложенным коммитом и HEAD."""
    out = git("diff", "--name-status", "--no-renames", f"{since}..HEAD", "--", *SITE_PATHS)
    upload, remove = [], []
    for line in out.splitlines():
        status, path = line.split("\t", 1)
        if path.startswith("public/uploads/"):
            continue
        (remove if status == "D" else upload).append(path)
    return upload, remove


def deploy(c: paramiko.SSHClient, since_arg: str | None, dry: bool) -> None:
    # Выкладываем ровно коммит: незакоммиченных правок в файлах сайта быть не должно
    dirty = git("status", "--porcelain", "--", *SITE_PATHS)
    if dirty:
        raise SystemExit("Есть незакоммиченные изменения в файлах сайта — сначала закоммитьте:\n" + dirty)
    head = git("rev-parse", "HEAD")

    cur = current_release(c)
    on_releases = cur.startswith(RELEASES)
    if not on_releases and not (dry and since_arg):
        raise SystemExit("Сервер ещё не на релизах — сначала: python scripts/vps_release.py --migrate --since <коммит>")
    out = run(c, f"cat {cur}/.deployed-commit 2>/dev/null", quiet=True)[1] if on_releases else ""
    since = since_arg or out.strip()
    if not since:
        raise SystemExit("Неизвестно, какой коммит выложен. Укажите --since <коммит>")
    upload, remove = changed_files(since)
    print(f"\nВыложено сейчас: {since[:8]} → выкладываем {head[:8]}")
    print(f"Файлов загрузить: {len(upload)}, удалить: {len(remove)}")
    for p in upload:
        print("  +", p)
    for p in remove:
        print("  -", p)
    if not upload and not remove:
        print("Изменений в файлах сайта нет — выкладывать нечего")
        return
    if dry:
        return

    ts = time.strftime("%Y%m%d-%H%M%S")
    rel = f"{RELEASES}/{ts}"

    def abort(msg: str) -> None:
        run(c, f"rm -rf {rel}")
        raise SystemExit(msg + " — новый релиз удалён, работающий сайт не тронут")

    # 1. Копия текущего релиза (без старой сборки)
    if run(c, f"rsync -a --exclude .next {cur}/ {rel}/")[0] != 0:
        abort("Не удалось скопировать релиз")

    # 2. Изменённые файлы
    sftp = c.open_sftp()
    for p in upload:
        run(c, f"mkdir -p {os.path.dirname(f'{rel}/{p}')}", quiet=True)
        sftp.put(str(ROOT / p), f"{rel}/{p}")
        print(f"uploaded {p}", flush=True)
    sftp.close()
    if remove:
        run(c, f"cd {rel} && rm -f " + " ".join(f"'{p}'" for p in remove))

    # 3. Зависимости и схема базы
    if any(p in ("package.json", "package-lock.json") for p in upload):
        if run(c, f"cd {rel} && npm ci", timeout=1800)[0] != 0:
            abort("npm ci не прошёл")
    if "prisma/schema.prisma" in upload:
        code, _ = run(c, f"mkdir -p /var/backups/startplus && cd {rel} && "
                         "U=$(grep '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '\"') && "
                         "pg_dump \"$U\" -F c -f /var/backups/startplus/before-schema-$(date +%Y%m%d-%H%M%S).dump")
        if code != 0:
            abort("Не удалось сделать копию базы — схему не меняю")
        # Без --accept-data-loss: если изменение грозит потерей данных, Prisma откажется
        if run(c, f"cd {rel} && npx prisma db push --skip-generate")[0] != 0:
            abort("prisma db push не прошёл (возможно, изменение стёрло бы данные)")
    if run(c, f"cd {rel} && npx prisma generate", quiet=True)[0] != 0:
        abort("prisma generate не прошёл")

    # 4. Сборка (на время сборки uploads — пустая папка, а не ссылка: так требует сборщик)
    run(c, f"rm -rf {rel}/public/uploads && mkdir -p {rel}/public/uploads", quiet=True)
    code, _ = run(c, f"cd {rel} && npx next build --webpack 2>&1 | tail -n 40", timeout=1800)
    _, built = run(c, f"test -f {rel}/.next/BUILD_ID && echo BUILT", quiet=True)
    run(c, f"rm -rf {rel}/public/uploads && ln -s {UPLOADS} {rel}/public/uploads", quiet=True)
    if "BUILT" not in built:
        abort("Сборка не удалась")
    run(c, f"echo {head} > {rel}/.deployed-commit", quiet=True)

    # 5. Переключение и проверка
    run(c, f"ln -sfn {rel} {APP}.new && mv -Tf {APP}.new {APP} && pm2 restart startplus")
    if not site_ok(c):
        print("\nНовый релиз не ответил — возвращаю прежний", flush=True)
        run(c, f"ln -sfn {cur} {APP}.new && mv -Tf {APP}.new {APP} && pm2 restart startplus")
        site_ok(c)
        raise SystemExit(1)

    # 6. Старые релизы: оставляем KEEP последних
    run(c, f"cd {RELEASES} && ls -1d */ | sed 's:/$::' | sort | head -n -{KEEP} | xargs -r rm -rf")
    print(f"\nСайт обновлён: релиз {ts}, коммит {head[:8]}.")


def main() -> None:
    args = sys.argv[1:]
    since = args[args.index("--since") + 1] if "--since" in args else None
    c = connect()
    try:
        if "--migrate" in args:
            if not since:
                raise SystemExit("Для --migrate укажите --since <коммит, который сейчас на сервере>")
            migrate(c, git("rev-parse", since))
        elif "--rollback" in args:
            rollback(c)
        else:
            deploy(c, git("rev-parse", since) if since else None, "--dry-run" in args)
    finally:
        c.close()


if __name__ == "__main__":
    main()

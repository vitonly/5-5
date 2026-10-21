@AGENTS.md

# СТАРТ+ (startdota.ru) — памятка для Claude

Платформа обучения Dota 2 для школы: ученики, домашки, FIFA-карточки, субботние 5v5,
очки школы, материалы, Telegram-бот, голос (LiveKit), парсер реплеев, «Своя игра».
Подробности по доменной логике — `HANDOFF.md` (README частично устарел), дизайн — `docs/design-system.md`.

## Стек

- Next.js **16.2.10** (App Router, не классический — см. `AGENTS.md`), React 19, TypeScript, Tailwind 4.
- Prisma 6 + **PostgreSQL** (`prisma/schema.prisma`). Миграций нет — схема накатывается `prisma db push`.
- Логика очков: `src/lib/points.ts`; рейтинг карточки: `src/lib/rating.ts`; баланс 5v5: `src/lib/team-balance.ts`.
- Рядом живут отдельные сервисы:
  - `parser/` — Java 21 парсер реплеев (systemd `startplus-parser`, порт 5600);
  - `igra/` — «Своя игра» на Python/aiohttp (systemd `svoya-igra`, порт 8090, URL `/igra/`);
  - `workers/telegram-proxy/` — Cloudflare-прокси для Telegram API;
  - `deploy/` — конфиги LiveKit, парсера, VK ID.

## Локальный запуск

```bash
npm install          # postinstall сам делает prisma generate
npm run dev          # http://localhost:3000
```

- Нужна Postgres-база в `DATABASE_URL` (в локальном `.env` сейчас SQLite-строка `file:` — со схемой postgresql она не работает).
- **Проверочная сборка:** `npm run build` (это `prisma generate` + `next build`, базу не трогает) и `npm run lint`.
- Windows: перед `prisma generate` останавливать dev-сервер (иначе EPERM).

## Сервер и деплой

VPS Timeweb, вход по SSH-ключу `~/.ssh/id_ed25519_startdota` (root). pm2-процесс `startplus` на порту 3000,
nginx (`/etc/nginx/sites-available/startplus`) + Let's Encrypt.

Сайт выкладывается **релизами** (`/var/www/startplus`):
- `releases/<дата-время>/` — полная копия сайта на каждую выкладку (хранятся 3 последние);
- `app` → ссылка на текущий релиз (pm2 запускает сайт из `app`);
- `shared/.env` — один общий `.env` (в каждом релизе ссылка на него);
- `uploads/` — загрузки учеников (ссылка в `public/uploads` каждого релиза);
- в релизе файл `.deployed-commit` — какой коммит выложен.

| Скрипт | Что делает | Опасность |
|--------|------------|-----------|
| `scripts/vps_release.py` | **Основной способ выкладки.** Берёт из git всё, что изменилось с выложенного коммита до HEAD, собирает новый релиз рядом с работающим, переключает ссылку и перезапускает (пара секунд). Не собралось — сайт не тронут; не ответил — откат. Сам делает `npm ci` и (с копией базы) `prisma db push` без `--accept-data-loss`. `--dry-run` — показать список, `--rollback` — вернуть прошлый релиз | Безопасный. `.env` не трогает. Изменение схемы — только с моего «да» |
| `scripts/vps_igra_deploy.py` | Выкладка `igra/` → `/var/www/startplus/igra`, venv, служба `svoya-igra`, блок `/igra/` в nginx | Безопасный |
| `scripts/vps_backup_setup.py` | Ежедневная копия базы в 04:00 МСК → `/var/backups/startplus/daily-*.dump`, 14 дней | Безопасный |
| `scripts/vps_pull_backup.py` | Скачать свежую копию базы в «Документы/Бэкапы СТАРТ+» | Безопасный (в копии личные данные — не класть в проект) |
| `scripts/vps_rotate_secrets.py` | Смена `CRON_SECRET` и `TELEGRAM_WEBHOOK_SECRET` прямо на сервере; `--webhook` — выставить webhook | Меняет `.env` — только с моего «да» |
| `scripts/vps_cron_mvp.py` | Ежечасная автоматизация (cron → `/usr/local/bin/startplus-automation.sh`) | Безопасный |
| `scripts/vps_deploy.py` | Старая полная выкладка: **перезаписывает `.env`**, `db push --accept-data-loss`. На сервере с релизами не запускается | **Опасный, устаревший** |
| прочие `scripts/vps_*.py` | Настройка сервера, парсера, LiveKit, Telegram-прокси, SSL | Перед запуском читать код целиком |

Разовые проверки и хотпатчи больше не храним в `scripts/` — архив: `C:\Users\viton\Desktop\5х5-scripts-archive`.

## Логи на сервере

- Сайт: `pm2 logs startplus --lines 100 --nostream`, `pm2 status`
- Бэкап базы: `/var/log/startplus-backup.log`, копии в `/var/backups/startplus`
- «Своя игра»: `journalctl -u svoya-igra -n 100 --no-pager`
- Парсер: `journalctl -u startplus-parser -n 80 --no-pager`
- nginx: `/var/log/nginx/error.log`, `/var/log/nginx/access.log`

## Правила работы

- Перед любым деплоем: собрать проект локально (см. выше), показать план — какие файлы, каким скриптом, что изменится на сервере — и дождаться «да».
- Никогда не перезаписывать `.env` на сервере и не запускать `prisma db push --accept-data-loss` (в том числе через `vps_deploy.py`) без моего явного «да».
- Секреты (`.env*`, пароли, токены, ключи) не коммитить и не выводить в чат. Проверять env-файлы только так, чтобы значения не печатались.
- Каждая задача — в отдельной ветке от `master`; коммиты с понятным описанием на русском.
- Комментарии в коде — на русском, простые и понятные (я преподаю программирование детям).
- Объяснять сделанное коротко и простыми словами.
- Интерфейс сайта — на русском; стили — только через токены из `src/app/globals.css` (см. `docs/design-system.md`).

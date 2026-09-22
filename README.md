# Dota 5x5 — Платформа обучения

Веб-платформа для обучения Dota: вход через Telegram, домашние задания, FIFA-карточки игроков, сезонные оценки, субботние 5v5 с автобалансом команд, система очков и штрафов.

## Быстрый старт (локально)

1. Создайте бесплатную БД на [Neon](https://neon.tech) и скопируйте connection string.
2. Установите зависимости и настройте env:

```bash
npm install
cp .env.example .env
# Впишите DATABASE_URL (Postgres), JWT_SECRET, Telegram и т.д.
npx prisma db push
npm run dev
```

Сайт: [http://localhost:3000](http://localhost:3000).

Для файлов локально `BLOB_READ_WRITE_TOKEN` не нужен — файлы пишутся в `public/uploads`.

### Telegram-бот

1. [@BotFather](https://t.me/BotFather) → `/newbot`
2. Токен и username в `.env`
3. Свой Telegram ID в `ADMIN_TELEGRAM_IDS` ([@userinfobot](https://t.me/userinfobot))

## Переменные окружения

| Переменная | Описание |
|-----------|----------|
| `DATABASE_URL` | PostgreSQL (Neon), с `?sslmode=require` |
| `JWT_SECRET` | Случайная строка для сессий |
| `TELEGRAM_BOT_TOKEN` | Токен бота |
| `NEXT_PUBLIC_BOT_USERNAME` | Username бота без @ |
| `ADMIN_TELEGRAM_IDS` | Telegram ID админов через запятую |
| `NEXT_PUBLIC_APP_URL` | URL сайта |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (обязателен на Vercel) |
| `CRON_SECRET` | Опционально для cron |
| `TWITCH_*` | Опционально |

## Деплой на Vercel + Neon

1. **Neon** — [neon.tech](https://neon.tech) → Create project → скопировать `DATABASE_URL`.
2. **Vercel** — [vercel.com](https://vercel.com) → Add New → Project → Import `vitonly/5-5` (GitHub).
3. **Environment Variables** (Production):

| Variable | Value |
|----------|--------|
| `DATABASE_URL` | строка из Neon |
| `JWT_SECRET` | длинная случайная строка |
| `TELEGRAM_BOT_TOKEN` | из BotFather |
| `NEXT_PUBLIC_BOT_USERNAME` | без @ |
| `ADMIN_TELEGRAM_IDS` | ваш Telegram ID |
| `NEXT_PUBLIC_APP_URL` | `https://<проект>.vercel.app` (после первого деплоя можно уточнить) |
| `BLOB_READ_WRITE_TOKEN` | Vercel → Storage → Create Blob Store → токен |

4. Deploy. Сборка сама выполнит `prisma db push`.
5. BotFather: `/setdomain` → домен Vercel; webhook (если нужен): `https://<url>/api/telegram/webhook`.

Прод-БД сначала пустая — ученики и админ появляются после первого Telegram-логина (`ADMIN_TELEGRAM_IDS` делает админом).

## Скрипты

```bash
npm run dev        # Разработка
npm run build      # Сборка (+ prisma generate && db push)
npm run db:push    # Накатить схему
```

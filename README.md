# Dota 5x5 — Платформа обучения

Веб-платформа для обучения Dota: вход через Telegram, домашние задания, FIFA-карточки игроков, сезонные оценки, субботние 5v5 с автобалансом команд, система очков и штрафов.

## Возможности

- **Вход через Telegram** — один клик для учеников
- **FIFA-карточка** — игровой рейтинг, коэффициент сезона, итоговый рейтинг 1–100
- **Домашки** — выдача, отправка с файлами, проверка и оценка
- **Сезонная оценка** — осень/зима/лето, открытые оценки, автозакрытие
- **5v5** — автобаланс команд по рейтингу, учёт побед/поражений и стриков
- **Очки и штрафы** — публичная таблица лидеров

## Быстрый старт

### 1. Установка

```bash
npm install
cp .env.example .env
npx prisma db push
npm run dev
```

Сайт откроется на [http://localhost:3000](http://localhost:3000).

### 2. Настройка Telegram-бота

1. Создайте бота через [@BotFather](https://t.me/BotFather) (`/newbot`)
2. Привяжите домен: `/setdomain` → выберите бота → `localhost` (для разработки)
3. Скопируйте токен в `.env`:
   ```
   TELEGRAM_BOT_TOKEN=ваш_токен
   NEXT_PUBLIC_BOT_USERNAME=имя_бота_без_@
   ```
4. Укажите свой Telegram ID в `ADMIN_TELEGRAM_IDS` (узнать можно у [@userinfobot](https://t.me/userinfobot))

### 3. Переменные окружения

| Переменная | Описание |
|-----------|----------|
| `DATABASE_URL` | SQLite: `file:./dev.db` (для продакшена — PostgreSQL) |
| `TELEGRAM_BOT_TOKEN` | Токен бота от BotFather |
| `NEXT_PUBLIC_BOT_USERNAME` | Username бота без @ |
| `JWT_SECRET` | Случайная строка для сессий |
| `ADMIN_TELEGRAM_IDS` | Telegram ID админов через запятую |
| `NEXT_PUBLIC_APP_URL` | URL сайта |

## Деплой

1. **Vercel** — задеплойте репозиторий
2. **База данных** — [Neon](https://neon.tech) или [Supabase](https://supabase.com) (PostgreSQL)
3. Обновите `DATABASE_URL` на PostgreSQL connection string
4. В BotFather укажите домен Vercel через `/setdomain`

## Формула рейтинга

```
Итоговый рейтинг = Игровой рейтинг × Коэффициент сезона
```

- **Игровой рейтинг** — указывает ученик, корректирует админ (1–100)
- **Коэффициент сезона** — среднее всех оценок от других игроков ÷ 5

## Структура

```
src/
├── app/           # Страницы и API
├── components/    # UI-компоненты
└── lib/           # Бизнес-логика
prisma/
└── schema.prisma  # Схема БД
```

## Скрипты

```bash
npm run dev        # Разработка
npm run build      # Сборка
npm run db:push    # Применить схему БД
```

# Dota 5x5 — Handoff для продолжения разработки

Документ для переноса проекта в другой аккаунт Cursor. Читай его первым после открытия проекта.

---

## Что это за проект

**Dota 5x5** — платформа обучения Dota для школы/группы: ученики, домашки, FIFA-карточки, субботние 5v5, очки школы, материалы, Telegram-бот.

| Параметр | Значение |
|----------|----------|
| Путь | `C:\Users\viton\Desktop\5х5` |
| Стек | Next.js **16.2.10**, React **19**, Prisma **6**, SQLite |
| Dev | `npm run dev` → http://localhost:3000 |
| Язык UI | Русский |

> **Важно:** это не «классический» Next.js из документации — перед изменениями смотри `node_modules/next/dist/docs/` (см. `AGENTS.md`).

---

## Быстрый старт на новом ПК

```bash
cd путь/к/проекту
npm install
cp .env.example .env   # заполни переменные
npx prisma db push
npx prisma generate
npm run dev
```

### После изменений schema.prisma (Windows)

1. Останови dev-сервер (иначе EPERM при generate)
2. `npx prisma db push --accept-data-loss` (если нужно)
3. `npx prisma generate`
4. `npm run dev`

---

## Две системы рейтинга (не путать!)

### 1. Рейтинг карточки (`finalRating`)

- Поле: `PlayerProfile.finalRating`
- Формула: медаль OpenDota × `seasonCoefficient` (голосование за механику/макро/команду)
- Используется: FIFA-карточка, **балансировка 5v5**, визуал tier карточки
- Меняется каждый сезон после peer voting

### 2. Очки школы (`totalPoints` + `PointLog`)

- Поле: `PlayerProfile.totalPoints` (Float)
- Журнал: `PointLog` с `delta` (Float), `reason`, `seasonId`
- Используется: **главная (топ-3)**, `/stats`, история в профиле
- **Не** показывается на карточке как главный рейтинг

---

## Система очков (текущие правила)

| Событие | Очки |
|---------|------|
| Домашка принята | +0.5 |
| Домашка «очень хорошо» (галочка админа) | +1.0 |
| Домашка не сдана к дедлайну | −0.5 |
| Победа 5v5 | +1 |
| 2 победы подряд в сессии | +3 |
| Ничья 5v5 | +1 всем |
| Апсет (слабая команда победила) | +1.1 / +1.2 / +1.3 |
| Игра не на своей роли | +0.1 к победе |
| Штраф от тренера | настраиваемый (по умолчанию −0.5) |

Логика: `src/lib/points.ts`  
Домашки: очки при **принятии** (PATCH), не при сдаче.

---

## Страницы и маршруты

### Ученик / общие

| URL | Описание |
|-----|----------|
| `/` | Главная: топ-3 по **очкам** (пустые слоты если 0), материалы |
| `/profile` | Редактирование профиля, история очков справа |
| `/player/[id]` | Публичный профиль: карточка, статистика, история очков |
| `/homework` | Домашки ученика |
| `/materials` | Материалы (видео → `/materials/videos`) |
| `/materials/videos` | Все видео по позициям и уровню |
| `/stats` | Только таблица лидеров: Место, Игрок, Очки, Приз (TBA) |
| `/match` | Субботние 5v5 |
| `/match/vote` | Голосование за игроков |
| `/match/seasons` | Очки по сезонам |

### Админ

| URL | Описание |
|-----|----------|
| `/admin` | Дашборд |
| `/admin/students` | Ученики |
| `/admin/homework` | Домашки: «Выдать» / «Проверить» (по ученикам) |
| `/admin/materials` | Материалы |
| `/admin/matches` | 5v5 сессии |
| `/admin/seasons` | Сезоны голосования |
| `/admin/penalties` | Штрафы |

---

## Домашние задания

### Статусы (`HomeworkStatus`)

`ASSIGNED` → `SUBMITTED` → `GRADED` | `REVISION` | `OVERDUE`

### Админка (`AdminHomeworkClient.tsx`)

- **Выдать задание** — создание, кнопка «Все» для всех учеников
- **Проверить работы** — список учеников → клик → проверка работ
- Блоки: «Задание» / «Ответ ученика» / «Проверка»
- Принять: галочка «Очень хорошо выполнена» (+1 vs +0.5)
- Отправить на доработку: комментарий + дедлайн доработки

### Ученик (`StudentHomeworkList.tsx`)

- Кнопка «Прикрепить файл» вместо native file input
- При REVISION: комментарий тренера, дедлайн, «Отправить доработку»

### API

- `POST /api/homework` — создать
- `PUT /api/homework` — сдать
- `PATCH /api/homework` — принять / доработка (`action: "revision"`)

---

## 5v5 матчи

- Автобаланс 10 игроков по `finalRating`: `src/lib/team-balance.ts`
- Позиции 1–5 назначаются при балансе, сохраняются в `MatchSession.teamAssignments` (JSON)
- API: `src/app/api/matches/route.ts`
- UI: `AdminMatchesClient.tsx` — Radiant / Dire / **Ничья**

---

## Материалы

### Типы

`VIDEO`, `STREAM`, `ARTICLE`

### Поля видео

- `positions` — JSON массив DotaRole
- `skillLevels` — JSON: `BEGINNER`, `INTERMEDIATE`, `ADVANCED`

### UI

- `/materials`: эфир → статьи → **офлайн трансляции внизу**
- Видео младше 5 дней — плашка «Новое»
- Вкладка «Видео» → `/materials/videos`

---

## Профиль

- `RatingBreakdown` — **сворачивается**, открывается только по ▼
- Домашки **не** в `/profile` (только `/homework`)
- История очков справа; зелёный/красный **только** в истории очков
- `PointHistory.tsx` — переиспользуется в profile и player

---

## Ключевые файлы

```
prisma/schema.prisma          # Схема БД
src/lib/points.ts             # Очки школы
src/lib/rating.ts             # Рейтинг карточки
src/lib/team-balance.ts       # Баланс 5v5
src/lib/seasons.ts            # Закрытие сезона
src/lib/automation.ts         # Просрочки домашек, автозакрытие сезонов
src/lib/materials.ts          # Сортировка видео, isNewMaterial
src/lib/card-design.ts        # Дизайн FIFA-карточки
src/lib/twitch.ts             # Twitch API + decapi fallback
src/components/AdminHomeworkClient.tsx
src/components/StudentHomeworkList.tsx
src/components/MaterialsClient.tsx
src/components/VideosClient.tsx
src/app/(dashboard)/page.tsx  # Главная, топ-3
```

---

## Переменные окружения

См. `.env.example`. Обязательные для dev:

- `DATABASE_URL`
- `JWT_SECRET`
- `TELEGRAM_BOT_TOKEN`, `NEXT_PUBLIC_BOT_USERNAME` (или dev-login)
- `ADMIN_TELEGRAM_IDS`

Опционально: `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `CRON_SECRET`

---

## Скрипты

```bash
npm run dev          # Разработка
npm run build        # prisma generate + next build
npm run db:push      # prisma db push
npm run automation   # Просрочки + закрытие сезонов
npm run telegram:poll
```

---

## Известные проблемы / нюансы

1. **Prisma на Windows** — после schema всегда stop server → generate
2. **Telegram** — уведомления только если ученик привязал бота
3. **`totalPoints` lifetime** — сезонные суммы через `PointLog.seasonId`
4. **Призы в /stats** — колонка TBA, логики призов нет
5. **Git** — проект может быть без git; коммиты только по просьбе пользователя
6. **README.md** — частично устарел (формула рейтинга описана старее); ориентируйся на этот HANDOFF

---

## Что можно делать дальше (идеи)

- [ ] Призы в таблице лидеров (вместо TBA)
- [ ] Сброс/сезонные очки отдельно от lifetime `totalPoints`
- [ ] История матчей в профиле игрока
- [ ] Показ позиций из `teamAssignments` в админке матчей
- [ ] PostgreSQL для продакшена
- [ ] Git + деплой на Vercel

---

## История изменений (кратко, последние сессии)

- Админка домашек: вкладки, проверка по ученикам, доработка
- Система очков 0.5/1/−0.5, дробные Float
- Главная: топ-3 только по очкам, без 4-й карточки
- Профиль: collapsible рейтинг, история справа
- /stats: только лидерборд
- Материалы: видео-страница, skill levels, «Новое», офлайн стримы внизу

---

*Сгенерировано для handoff. Обновляй этот файл при крупных изменениях.*

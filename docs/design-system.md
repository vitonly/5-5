# Дизайн-система СТАРТ+ («Бирюза Pro»)

Полная версия с превью компонентов — в артефакте Claude «СТАРТ+» (Design System).
Здесь — короткая шпаргалка для работы с кодом. Все значения живут в `src/app/globals.css`.

## Цвет

- Фон страницы `--bg`, карточки `--surface`, вложенные блоки `--surface-muted`.
- Текст: `--text` (основной), `--text-2` (подписи), `--text-3` (метаданные). `--text-4` — только плейсхолдеры.
- `--points` (бирюза) — очки школы, primary-кнопка, ссылки, активная вкладка. Одна primary-кнопка на экран.
- `--power` (синий) — только рейтинг силы / FIFA-карточка / баланс команд.
- Статусы: `--success`, `--warning`, `--danger`; `--admin` — только в админке (`.admin-scope`).
- **Текст на тинте `*-bg` — всегда цветом `*-ink`**: `--points-ink` на `--points-bg`, `--power-ink` на `--power-bg` и т. д.
- Никаких HEX в компонентах (исключение — тиры FIFA-карточки в `src/lib/card-design.ts`).

## Типографика

- Заголовки — Unbounded (`font-display`, теги `h1`–`h3` стилизованы глобально, утилиты Tailwind их перекрывают).
- Текст — IBM Plex Sans. Цифры — JetBrains Mono через `.font-mono-num` (tabular-nums).
- Надзаголовки и шапки таблиц — класс `.eyebrow` (11px, капс, разрядка).

## Форма и глубина

- Скругления: `--radius-sm` 6 · `--radius-control` 10 · `--radius-card` 16 · `--radius-frame` 20 · `--radius-pill`.
- Тени: `--shadow-xs` (кнопки, поля), `--shadow-card` (карточки), `--shadow-raised` (hover), `--shadow-popover` (меню, диалоги).
- Карточка без `<Card>` — класс `.surface-card`.
- Не делать цветную полосу слева у карточек и рамку внутри рамки.

## Движение (скиллы Эмиля Ковальски в `.claude/skills`)

- Короче 300 мс, только `transform` / `opacity` / цвета; кривая `--ease-out`.
- Нажатие — `.press` или `active:scale-[0.97]`; кликабельная карточка — `.hover-lift`.
- `hover:` в Tailwind срабатывает только на устройствах с мышью (custom-variant в `globals.css`).
- Шторки и диалоги — `--ease-drawer`; появление контента — `.rise-in`.
- Всё уважает `prefers-reduced-motion`.

## Мобильная версия

- `100dvh`, `env(safe-area-inset-bottom)` у таббара, поля ввода 16px (без зума iOS), зоны нажатия ≥ 44px.

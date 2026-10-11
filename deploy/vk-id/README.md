# VK ID login (START+)

Вход на сайт только через VK ID. Telegram остаётся для уведомлений (привязка в профиле).

## Создать приложение

1. Откройте [id.vk.ru](https://id.vk.ru) → создайте приложение для сайта `startdota.ru`.
2. Trusted Redirect URL (точно, без лишнего `/` в конце):
   - `https://www.startdota.ru/api/auth/vk/callback`
   - `https://startdota.ru/api/auth/vk/callback` (если apex открыт)
3. Scope: минимум `vkid.personal_info`.

## Env на VPS (`/var/www/startplus/app/.env`)

Не коммитить секреты.

| Variable | Назначение |
|----------|------------|
| `VK_CLIENT_ID` | App ID |
| `VK_CLIENT_SECRET` | Защищённый ключ (backend exchange, если выдан) |
| `VK_SERVICE_TOKEN` | Service token для `users.get` (резолв ника → id в админке) |
| `NEXT_PUBLIC_VK_CLIENT_ID` | Тот же App ID (кнопка на `/login`) |
| `ADMIN_VK_IDS` | Числовые VK ID админов через запятую |
| `NEXT_PUBLIC_APP_URL` | `https://www.startdota.ru` (уже есть) |

`vps_deploy.py` / `vps_patch_vk_id.py` подхватывают эти ключи из локального `.env` и сохраняют предыдущие значения на сервере.

После создания приложения добавьте секреты в локальный `.env`, затем:

```bash
python scripts/vps_patch_vk_id.py   # зальёт env + rebuild
python scripts/vps_vk_smoke.py      # vk_app_ready=true когда secrets есть
```

## Smoke после деплоя

```bash
# без pd → /login?error=pd_required
# с pd, без secrets → /login?error=vk_not_configured
# с secrets → Location: https://id.vk.ru/authorize?...
python scripts/vps_vk_smoke.py
```

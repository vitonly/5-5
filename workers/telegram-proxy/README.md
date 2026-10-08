# START+ Telegram proxy (Cloudflare Worker)

Мост между Timeweb VPS и Telegram Bot API.

## Один раз у себя на ПК

1. Зарегистрируйся на https://dash.cloudflare.com (бесплатно).
2. В папке проекта:

```bash
cd workers/telegram-proxy
npm install
npx wrangler login
```

Откроется браузер — подтверди вход в Cloudflare.

3. Секрет прокси (придумай длинную строку):

```bash
npx wrangler secret put PROXY_SECRET
```

4. Деплой:

```bash
npm run deploy
```

В конце wrangler покажет URL вида:

`https://startplus-tg-proxy.<твой-сабаккаунт>.workers.dev`

Пришли этот URL (или скажи «задеплоил») — пропишем его на VPS вместе с тем же `PROXY_SECRET` и переключим webhook.

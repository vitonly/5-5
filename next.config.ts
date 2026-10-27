import type { NextConfig } from "next";

/**
 * Политика безопасности страниц (CSP): откуда браузеру можно загружать скрипты, картинки и т. д.
 * Главное — скрипты только с нашего сайта и виджета входа Telegram: даже если кто-то
 * сумеет вставить на страницу ссылку на чужой скрипт, браузер его не загрузит.
 */
const isDev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  // 'unsafe-inline' нужен Next.js для его встроенных скриптов; 'unsafe-eval' — только при разработке
  `script-src 'self' 'unsafe-inline' https://telegram.org${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Аватарки бывают из Steam, Telegram, Twitch, YouTube — разрешаем любые https-картинки
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  "media-src 'self' blob:",
  // Голосовой чат (LiveKit на порту 8443) и прочие соединения по https/wss
  "connect-src 'self' https: wss:",
  // Окно входа через Telegram
  "frame-src https://oauth.telegram.org",
  "worker-src 'self' blob:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

/** Защитные заголовки для всех страниц и API */
const securityHeaders = [
  // Не встраивать сайт в чужие iframe (защита от «наложения» поверх формы входа)
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: csp },
  // Только HTTPS на год вперёд (сайт и так редиректит с http)
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Браузерные «разрешения»: микрофон нужен голосовому чату, остальное сайту не нужно — запрещаем
  {
    key: "Permissions-Policy",
    value: "microphone=(self), camera=(), geolocation=(), payment=(), usb=(), display-capture=()",
  },
];

const nextConfig: NextConfig = {
  // Не сообщать «X-Powered-By: Next.js»
  poweredByHeader: false,
  // Плавные переходы между страницами (React <ViewTransition>) с Next.js 16.4 работают без настройки
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

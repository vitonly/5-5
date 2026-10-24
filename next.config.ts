import type { NextConfig } from "next";

/** Защитные заголовки для всех страниц и API */
const securityHeaders = [
  // Не встраивать сайт в чужие iframe (защита от «наложения» поверх формы входа)
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
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

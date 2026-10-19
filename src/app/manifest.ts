import type { MetadataRoute } from "next";

/* Приложение на телефон: «Добавить на главный экран» открывает сайт без адресной строки */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "СТАРТ+ dota 2 education",
    short_name: "СТАРТ+",
    description: "Платформа обучения Dota 2: домашки, рейтинг, субботние 5v5.",
    lang: "ru",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f3f6f6",
    theme_color: "#f3f6f6",
    icons: [
      { src: "/pwa/icon-192.png?v=3", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-512.png?v=3", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa/maskable-512.png?v=3", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Домашки", url: "/homework", icons: [{ src: "/pwa/icon-192.png?v=3", sizes: "192x192" }] },
      { name: "5×5", url: "/match", icons: [{ src: "/pwa/icon-192.png?v=3", sizes: "192x192" }] },
      { name: "Профиль", url: "/profile", icons: [{ src: "/pwa/icon-192.png?v=3", sizes: "192x192" }] },
    ],
  };
}

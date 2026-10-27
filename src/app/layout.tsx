import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/toast";
import { ConfirmHost } from "@/components/ui/confirm";

// Шрифты лежат в проекте (src/app/fonts), а не скачиваются из Google при сборке:
// раньше сборка падала, если Google Fonts не отвечал. Подробности — src/app/fonts/README.md

// Заголовки: Unbounded — с кириллицей (Chakra Petch её не поддерживал)
const unbounded = localFont({
  src: "./fonts/Unbounded.woff2",
  variable: "--font-unbounded",
  weight: "600 700",
  display: "swap",
});

// Основной текст: IBM Plex Sans (по лицензии изменённый файл называется Start Sans)
const ibmPlex = localFont({
  src: "./fonts/StartSans.woff2",
  variable: "--font-ibm-plex",
  weight: "400 600",
  display: "swap",
});

// Цифры и счёт: JetBrains Mono
const jetbrains = localFont({
  src: "./fonts/JetBrainsMono.woff2",
  variable: "--font-jetbrains",
  weight: "500 700",
  display: "swap",
  adjustFontFallback: false,   // запасной моноширинный шрифт задан в globals.css
});

export const metadata: Metadata = {
  title: {
    default: "СТАРТ+ · dota 2 education",
    template: "%s · СТАРТ+",
  },
  applicationName: "СТАРТ+",
  description: "СТАРТ+ — платформа обучения Dota 2: домашки, рейтинги, 5v5. Сайт в разработке v1.01",
  icons: {
    icon: [{ url: "/brand/start-plus-icon.png?v=3", type: "image/png" }],
    apple: [{ url: "/pwa/apple-touch-icon.png?v=3", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "СТАРТ+",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f3f6f6",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`${unbounded.variable} ${ibmPlex.variable} ${jetbrains.variable} antialiased`}
    >
      <body className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
        {children}
        <Toaster />
        <ConfirmHost />
      </body>
    </html>
  );
}

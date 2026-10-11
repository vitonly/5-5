import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, JetBrains_Mono, Unbounded } from "next/font/google";
import "./globals.css";

// Заголовки: Unbounded — с кириллицей (Chakra Petch её не поддерживал)
const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin", "cyrillic"],
  weight: ["600", "700"],
  display: "swap",
});

const ibmPlex = IBM_Plex_Sans({
  variable: "--font-ibm-plex",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "СТАРТ+ dota2 education",
  description: "СТАРТ+ — платформа обучения Dota 2: домашки, рейтинги, 5v5. Сайт в разработке v1.01",
  icons: {
    icon: [{ url: "/brand/start-plus.png?v=2", type: "image/png" }],
    apple: [{ url: "/brand/start-plus.png?v=2", type: "image/png" }],
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
      <body className="min-h-screen bg-[var(--bg)] text-[var(--text)]">{children}</body>
    </html>
  );
}

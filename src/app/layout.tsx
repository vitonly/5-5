import type { Metadata, Viewport } from "next";
import { Chakra_Petch, IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const chakraPetch = Chakra_Petch({
  variable: "--font-chakra-petch",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const ibmPlex = IBM_Plex_Sans({
  variable: "--font-ibm-plex",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["500", "700"],
});

export const metadata: Metadata = {
  title: "Dota 5x5 — Платформа обучения",
  description: "Платформа для обучения Dota: домашки, рейтинги, 5v5",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Dota 5x5",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f2f6f6",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`${chakraPetch.variable} ${ibmPlex.variable} ${jetbrains.variable} antialiased`}
    >
      <body className="min-h-screen bg-[var(--bg)] text-[var(--text)]">{children}</body>
    </html>
  );
}

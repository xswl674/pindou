import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const developmentServiceWorkerCleanup = process.env.NODE_ENV === "development"
  ? `
      (() => {
        const cleanupKey = "perler-dev-service-worker-cleaned-v1";
        if (sessionStorage.getItem(cleanupKey)) return;

        const cleanup = async () => {
          if (!("serviceWorker" in navigator)) return;

          const registrations = await navigator.serviceWorker.getRegistrations();
          const cacheNames = "caches" in window ? await caches.keys() : [];
          const hadStaleState = registrations.length > 0 || cacheNames.length > 0;

          await Promise.all(registrations.map(registration => registration.unregister()));
          if ("caches" in window) {
            await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
          }

          sessionStorage.setItem(cleanupKey, "1");
          if (hadStaleState) window.location.reload();
        };

        cleanup().catch(() => sessionStorage.setItem(cleanupKey, "1"));
      })();
    `
  : null;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "七卡瓦拼豆底稿生成器 | Perler Beads Generator",
  description: "上传图片，调整精细度，一键生成像素画图纸，简单实用的像素画生成工具",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "拼豆生成器",
  },
  icons: {
    icon: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased overflow-x-hidden bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100`}
      >
        {developmentServiceWorkerCleanup && (
          <script dangerouslySetInnerHTML={{ __html: developmentServiceWorkerCleanup }} />
        )}
        {children}
        <Analytics />
      </body>
    </html>
  );
}

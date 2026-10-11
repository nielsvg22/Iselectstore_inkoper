import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SwRegister } from "@/components/pwa/sw-register";
import { ToastProvider } from "@/components/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "iSelectStore — Marktplaats Scraper", template: "%s · iSelectStore" },
  description: "Vind, analyseer en rangschik de beste inkoopdeals voor tweedehands Apple-producten.",
  robots: { index: false, follow: false },
  icons: { icon: [{ url: "/brand/mark.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/icons/apple-touch-icon.png" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "iSelectStore", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};
export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#1f3049" }, { media: "(prefers-color-scheme: dark)", color: "#1f3049" }], width: "device-width", initialScale: 1, viewportFit: "cover" };

const poppins = localFont({
  src: [
    { path: "../fonts/poppins-latin-ext-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/poppins-latin-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/poppins-latin-ext-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/poppins-latin-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/poppins-latin-ext-600.woff2", weight: "600", style: "normal" },
    { path: "../fonts/poppins-latin-600.woff2", weight: "600", style: "normal" },
    { path: "../fonts/poppins-latin-ext-700.woff2", weight: "700", style: "normal" },
    { path: "../fonts/poppins-latin-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-poppins",
  display: "swap",
});

const themeScript = `(function(){try{var t=localStorage.getItem('adh-theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={poppins.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="apple-touch-startup-image" href="/splash/1290x2796.png" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/1179x2556.png" media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/1284x2778.png" media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/1170x2532.png" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/1125x2436.png" media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/828x1792.png" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/750x1334.png" media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/1668x2388.png" media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/2048x2732.png" media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
      </head>
      <body className="min-h-dvh antialiased">
        <ToastProvider>{children}</ToastProvider>
        <SwRegister />
      </body>
    </html>
  );
}

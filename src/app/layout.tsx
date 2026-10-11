import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ToastProvider } from "@/components/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "iSelectStore — Marktplaats Scraper", template: "%s · iSelectStore" },
  description: "Vind, analyseer en rangschik de beste inkoopdeals voor tweedehands Apple-producten.",
  robots: { index: false, follow: false },
  icons: { icon: "/brand/mark.svg" },
};
export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f7f7f7" }, { media: "(prefers-color-scheme: dark)", color: "#0e1524" }], width: "device-width", initialScale: 1 };

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
      </head>
      <body className="min-h-dvh antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

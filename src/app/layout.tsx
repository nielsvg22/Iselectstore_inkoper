import type { Metadata, Viewport } from "next";
import { ToastProvider } from "@/components/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Apple Deal Hunter", template: "%s · Apple Deal Hunter" },
  description: "Vind, analyseer en rangschik de beste inkoopdeals voor tweedehands Apple-producten.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f5f5f7" }, { media: "(prefers-color-scheme: dark)", color: "#0a0a0c" }], width: "device-width", initialScale: 1 };

const themeScript = `(function(){try{var t=localStorage.getItem('adh-theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

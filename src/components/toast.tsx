"use client";
import { CheckCircle2, XCircle } from "lucide-react";
import * as React from "react";

type T = { id: number; msg: string; tone: "ok" | "err" };
const Ctx = React.createContext<(msg: string, tone?: "ok" | "err") => void>(() => {});
export const useToast = () => React.useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<T[]>([]);
  const push = React.useCallback((msg: string, tone: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, msg, tone }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), tone === "err" ? 7000 : 3500);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-6" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="fade-up pointer-events-auto flex max-w-md items-center gap-2.5 rounded-2xl border border-card-border bg-card px-4 py-3 text-sm shadow-pop">
            {t.tone === "ok" ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : <XCircle className="h-4 w-4 shrink-0 text-danger" />}
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

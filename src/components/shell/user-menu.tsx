"use client";
import { LogOut, Moon, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

export function UserMenu({ name, role }: { name: string; role: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [dark, setDark] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => setDark(document.documentElement.classList.contains("dark")), [open]);
  React.useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, []);
  const initials = name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("") || "U";
  return (
    <div className="relative" ref={ref}>
      <button type="button" aria-label="Accountmenu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} className="flex h-12 w-12 items-center justify-center rounded-full bg-[#e9e7ea] text-[15px] font-bold text-foreground/80 transition hover:brightness-95 dark:bg-muted-bg">
        {initials}
      </button>
      {open && (
        <div role="menu" className="fade-up absolute right-0 top-14 z-50 w-64 rounded-3xl border border-card-border bg-card p-2 shadow-pop">
          <div className="px-3.5 py-3"><p className="truncate text-sm font-semibold">{name}</p><p className="text-xs text-muted">{role === "ADMIN" ? "Beheerder" : "Gebruiker"}</p></div>
          <button
            role="menuitem"
            type="button"
            className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm hover:bg-muted-bg"
            onClick={() => {
              const next = !dark;
              document.documentElement.classList.toggle("dark", next);
              try { localStorage.setItem("adh-theme", next ? "dark" : "light"); } catch { /* negeren */ }
              setDark(next);
            }}
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {dark ? "Lichte modus" : "Donkere modus"}
          </button>
          <button
            role="menuitem"
            type="button"
            className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm text-danger hover:bg-danger-soft"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              router.replace("/login");
              router.refresh();
            }}
          >
            <LogOut className="h-4 w-4" />Uitloggen
          </button>
        </div>
      )}
    </div>
  );
}

"use client";
import { EyeOff, ExternalLink, MoreVertical, Search, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useToast } from "@/components/toast";
import { api } from "@/lib/client-api";

export function RowMenu({ adId, url, isDemo, title }: { adId: string; url: string; isDemo: boolean; title: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, []);
  const act = async (state: string, msg: string) => {
    setOpen(false);
    try {
      await api(`/api/ads/${adId}`, { method: "PATCH", body: { userState: state } });
      toast(msg);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const item = "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-muted-bg";
  return (
    <div className="relative" ref={ref}>
      <button type="button" aria-label={`Acties voor ${title}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} className="flex h-9 w-9 items-center justify-center rounded-full text-faint transition hover:bg-muted-bg hover:text-foreground">
        <MoreVertical className="h-5 w-5" />
      </button>
      {open && (
        <div role="menu" className="fade-up absolute right-0 top-10 z-30 w-56 rounded-2xl border border-card-border bg-card p-1.5 shadow-pop">
          <a role="menuitem" className={item} href={`/ads/${adId}`}><Search className="h-4 w-4" />Bekijk analyse</a>
          {!isDemo && <a role="menuitem" className={item} href={url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" />Ga naar advertentie</a>}
          <button role="menuitem" type="button" className={item} onClick={() => act("FAVORITE", "Toegevoegd aan favorieten")}><Star className="h-4 w-4" />Favoriet</button>
          <button role="menuitem" type="button" className={item} onClick={() => act("IGNORED", "Advertentie genegeerd")}><EyeOff className="h-4 w-4" />Negeren</button>
        </div>
      )}
    </div>
  );
}

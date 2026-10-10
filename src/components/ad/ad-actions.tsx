"use client";
import { ArrowUpRight, EyeOff, RefreshCw, ShoppingCart, Sliders, Star, ThumbsUp } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form";
import { api } from "@/lib/client-api";
import { eurosToCents } from "@/lib/format";

export function AdActions({ adId, url, isDemo, userState, purchased, askingCents }: { adId: string; url: string; isDemo: boolean; userState: string; purchased: boolean; askingCents: number | null }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [buyOpen, setBuyOpen] = React.useState(false);
  const [price, setPrice] = React.useState(askingCents != null ? String(askingCents / 100) : "");

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    try {
      await fn();
      toast(ok);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(null);
    }
  }
  const setState = (s: string, ok: string) => run(s, () => api(`/api/ads/${adId}`, { method: "PATCH", body: { userState: s } }), ok);

  return (
    <div className="space-y-2.5">
      {isDemo ? (
        <Button variant="outline" className="w-full" disabled title="Voorbeelddata heeft geen echte advertentie">Geen echte advertentie (voorbeeld)</Button>
      ) : (
        <a href={url} target="_blank" rel="noopener noreferrer" className="block">
          <Button className="w-full">Bekijk op Marktplaats <ArrowUpRight className="h-4 w-4" /></Button>
        </a>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button variant={userState === "INTERESTING" ? "soft" : "secondary"} size="sm" loading={busy === "INTERESTING"} onClick={() => setState(userState === "INTERESTING" ? "NONE" : "INTERESTING", userState === "INTERESTING" ? "Markering verwijderd" : "Gemarkeerd als interessant")}>
          <ThumbsUp className="h-3.5 w-3.5" />{userState === "INTERESTING" ? "Interessant ✓" : "Interessant"}
        </Button>
        <Button variant={userState === "FAVORITE" ? "soft" : "secondary"} size="sm" loading={busy === "FAVORITE"} onClick={() => setState(userState === "FAVORITE" ? "NONE" : "FAVORITE", userState === "FAVORITE" ? "Uit favorieten gehaald" : "Toegevoegd aan favorieten")}>
          <Star className="h-3.5 w-3.5" />{userState === "FAVORITE" ? "Favoriet ✓" : "Favoriet"}
        </Button>
        <Button variant="secondary" size="sm" loading={busy === "IGNORED"} onClick={() => run("IGNORED", async () => { await api(`/api/ads/${adId}`, { method: "PATCH", body: { userState: "IGNORED" } }); router.push("/"); }, "Advertentie genegeerd")}>
          <EyeOff className="h-3.5 w-3.5" />Negeren
        </Button>
        <Button variant="secondary" size="sm" disabled={purchased} onClick={() => setBuyOpen(true)}>
          <ShoppingCart className="h-3.5 w-3.5" />{purchased ? "Gekocht ✓" : "Gekocht"}
        </Button>
      </div>
      <Button variant="outline" size="sm" className="w-full" loading={busy === "re"} onClick={() => run("re", () => api(`/api/ads/${adId}/reanalyze`, { method: "POST", body: {} }), "Analyse opnieuw berekend")}>
        <RefreshCw className="h-3.5 w-3.5" />Herbereken analyse
      </Button>
      <Button variant="ghost" size="sm" className="w-full" onClick={() => document.getElementById("kosten")?.scrollIntoView({ behavior: "smooth" })}>
        <Sliders className="h-3.5 w-3.5" />Bewerk kosten &amp; correcties
      </Button>
      <Dialog open={buyOpen} onClose={() => setBuyOpen(false)} title="Markeer als gekocht">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run("buy", async () => { await api(`/api/ads/${adId}/purchase`, { body: { status: "BOUGHT", buyPriceCents: eurosToCents(price) } }); setBuyOpen(false); }, "Toegevoegd aan Mijn inkopen");
          }}
        >
          <Field label="Werkelijke inkoopprijs (€)" htmlFor="buyprice" hint="Overige gegevens (reparatie, verkoop) vul je in bij Mijn inkopen.">
            <Input id="buyprice" type="number" min="0" step="1" required value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full" loading={busy === "buy"}>Opslaan</Button>
        </form>
      </Dialog>
    </div>
  );
}

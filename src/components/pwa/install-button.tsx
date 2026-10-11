"use client";
import { Download } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { isStandalone } from "@/lib/pwa-client";

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Toont "Installeer app" zodra de browser dat toestaat (Chrome/Edge op Android en desktop). */
export function InstallButton() {
  const [evt, setEvt] = React.useState<BIP | null>(null);
  const [installed, setInstalled] = React.useState(false);
  React.useEffect(() => {
    setInstalled(isStandalone());
    const h = (e: Event) => { e.preventDefault(); setEvt(e as BIP); };
    window.addEventListener("beforeinstallprompt", h);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  if (installed) return <p className="text-sm font-medium text-success">✓ De app is geïnstalleerd en draait als app.</p>;
  if (!evt) return <p className="text-sm text-muted">Je browser toont de installatieknop zodra de app installeerbaar is (zie de stappen hieronder voor jouw toestel).</p>;
  return <Button onClick={async () => { await evt.prompt(); await evt.userChoice; setEvt(null); }}><Download className="h-4 w-4" />Installeer de app</Button>;
}

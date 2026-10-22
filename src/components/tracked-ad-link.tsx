"use client";
import { ArrowUpRight } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";

/** Voor de funnel: registreert dat deze advertentie in de app is geopend en/of is doorgeklikt naar Marktplaats. */
export function FunnelOpenBeacon({ adId }: { adId: string }) {
  React.useEffect(() => {
    void fetch("/api/funnel/open", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ adId }), keepalive: true }).catch(() => undefined);
  }, [adId]);
  return null;
}

export function GoToAdButton({ adId, url }: { adId: string; url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="shrink-0 self-start" aria-label="Ga naar advertentie op Marktplaats (opent in nieuw tabblad)"
      onClick={() => { void fetch("/api/funnel/click", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ adId }), keepalive: true }).catch(() => undefined); }}>
      <Button size="lg">Ga naar advertentie <ArrowUpRight className="h-4 w-4" /></Button>
    </a>
  );
}

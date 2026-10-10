import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { DemoPanel, FileImport, UrlImport } from "@/components/import/import-panels";
import { Card, CardContent } from "@/components/ui/card";
import { getConfig } from "@/lib/settings/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Importeren" };

export default async function ImportPage() {
  const cfg = await getConfig();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-[32px] font-semibold tracking-tight">Advertenties importeren</h1>
        <p className="mt-1 text-muted">Voeg advertenties toe via toegestane invoermethoden. Geïmporteerde advertenties worden automatisch herkend, gewaardeerd en gescoord.</p>
      </div>
      <Card>
        <CardContent className="flex gap-3 pt-5 text-sm sm:pt-6">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" />
          <div className="space-y-1.5">
            <p className="font-medium">Zo gaat Deal Hunter met bronnen om</p>
            <ul className="list-disc space-y-1 pl-5 text-muted">
              <li>Er is geen publiek gedocumenteerde Marktplaats-zoek-API; er wordt daarom niets ‘automatisch gescrapet’ en geen eindpunt aangenomen.</li>
              <li>URL-import haalt alleen pagina&apos;s op die jij opgeeft, met robots.txt-controle, vertraging en SSRF-bescherming. CAPTCHA, login of rate limits worden nooit omzeild.</li>
              <li>Controleer of je gebruik past bij de voorwaarden van de bron. Lukt uitlezen niet, gebruik dan de export-import hieronder.</li>
            </ul>
          </div>
        </CardContent>
      </Card>
      <UrlImport />
      <FileImport />
      <DemoPanel demoMode={cfg.demoMode} />
    </div>
  );
}

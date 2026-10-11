import type { Metadata } from "next";
import Link from "next/link";
import { InstallButton } from "@/components/pwa/install-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "App installeren" };

const Steps = ({ items }: { items: React.ReactNode[] }) => (
  <ol className="space-y-3">
    {items.map((it, i) => (
      <li key={i} className="flex gap-3 text-[15px]">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent-strong">{i + 1}</span>
        <span>{it}</span>
      </li>
    ))}
  </ol>
);

export default function InstallPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-[30px] font-bold tracking-tight">App installeren</h1>
        <p className="mt-1 text-muted">Installeer iSelectStore als app voor snelle toegang en directe pushmeldingen — ook als de app gesloten is.</p>
        <div className="mt-4"><InstallButton /></div>
      </div>

      <Card>
        <CardHeader><CardTitle>iPhone &amp; iPad (Safari, iOS 16.4 of nieuwer)</CardTitle></CardHeader>
        <CardContent>
          <Steps items={[
            <>Open dit portaal in <strong>Safari</strong> (niet in Chrome of in een andere app).</>,
            <>Tik op de <strong>Deel-knop</strong> (vierkant met pijl omhoog) → <strong>Zet op beginscherm</strong> → <strong>Voeg toe</strong>.</>,
            <>Open de app via het <strong>nieuwe icoon op je beginscherm</strong> (niet meer via Safari).</>,
            <>Ga in de app naar <Link href="/settings#push" className="font-semibold text-accent-strong underline">Instellingen → Pushmeldingen</Link> en tik op <strong>Pushmeldingen inschakelen</strong>. Kies <strong>Sta toe</strong>.</>,
            <>Tik op <strong>Stuur testpush</strong>. Binnen enkele seconden verschijnt een melding. Tik erop: de app opent direct de bijbehorende deal.</>,
          ]} />
          <p className="mt-4 text-sm text-muted">Op iOS werkt Web Push alleen voor apps die op het beginscherm staan. Staat “Meldingen” voor de app uit? Ga naar <em>Instellingen → Meldingen → iSelectStore</em> en zet meldingen aan. Let op: Focus-/Niet-storen-standen kunnen meldingen onderdrukken.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Android (Chrome)</CardTitle></CardHeader>
        <CardContent>
          <Steps items={[
            <>Open het portaal in <strong>Chrome</strong>.</>,
            <>Tik op <strong>Installeer de app</strong> hierboven, of op menu (⋮) → <strong>App installeren</strong>.</>,
            <>Open de app en schakel bij <Link href="/settings#push" className="font-semibold text-accent-strong underline">Instellingen → Pushmeldingen</Link> de meldingen in. Sta de toestemming toe.</>,
            <>Controleer met <strong>Stuur testpush</strong>. Zet in Android-instellingen de batterijoptimalisatie voor Chrome op “Onbeperkt” als meldingen vertraagd aankomen.</>,
          ]} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Computer (Chrome, Edge)</CardTitle></CardHeader>
        <CardContent>
          <Steps items={[
            <>Klik in de adresbalk op het <strong>installeer-icoon</strong> of gebruik <strong>Installeer de app</strong> hierboven.</>,
            <>Schakel bij <Link href="/settings#push" className="font-semibold text-accent-strong underline">Instellingen → Pushmeldingen</Link> de meldingen in en test ze. Meldingen komen ook binnen als het venster gesloten is, zolang de browser op de achtergrond draait.</>,
          ]} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Problemen oplossen</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-[15px] text-muted">
          <p><strong className="text-foreground">Geen melding na de test?</strong> Controleer of de toestemming is toegestaan, of het apparaat bij Instellingen → Pushmeldingen op “Aan” staat en of Niet-storen uit staat.</p>
          <p><strong className="text-foreground">Alleen over https.</strong> Installeren en push werken alleen via een beveiligde (https) verbinding.</p>
          <p><strong className="text-foreground">Privacy.</strong> De app bewaart geen persoonlijke pagina’s of gegevens offline; er wordt alleen statische inhoud (iconen, lettertypen) gecachet.</p>
        </CardContent>
      </Card>
    </div>
  );
}

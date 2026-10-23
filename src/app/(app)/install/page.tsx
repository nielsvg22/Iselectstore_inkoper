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
        <CardHeader><CardTitle>Windows — Chrome (of Edge)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Steps items={[
            <>Open het portaal in <strong>Chrome</strong>, log in en klik rechts in de adresbalk op het <strong>installeer-icoon</strong> (scherm met pijl). Zie je dat niet: menu <strong>⋮ → Opslaan en delen → Pagina installeren als app</strong> → <strong>Installeren</strong>.</>,
            <>Open de app via het nieuwe icoon (Startmenu of taakbalk). Wil je hem op het <strong>bureaublad</strong>: typ <code>chrome://apps</code> in Chrome, rechtermuisknop op <strong>iSelectStore</strong> → <strong>Snelkoppeling maken</strong>.</>,
            <>Ga in de app naar <Link href="/settings#push" className="font-semibold text-accent-strong underline">Instellingen → Pushmeldingen</Link> en klik op <strong>Pushmeldingen inschakelen</strong> → <strong>Toestaan</strong>.</>,
            <>Controleer in <strong>Windows Instellingen → Systeem → Meldingen</strong>: <em>Meldingen</em> aan, <em>iSelectStore</em> (of Google Chrome) aan, <em>Niet storen / Focus</em> uit.</>,
            <>Klik in het blok <strong>Controle op deze computer</strong> op <strong>Toon testmelding op dit scherm</strong> en daarna op <strong>Stuur testpush</strong>. Zie je een melding rechtsonder: klaar.</>,
          ]} />
          <p className="text-sm text-muted">Meldingen komen ook binnen als het venster is gesloten, zolang Chrome op de achtergrond mag draaien: <code>chrome://settings/system</code> → <em>Achtergrond-apps blijven uitvoeren als Chrome is gesloten</em>.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Mac — Chrome</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Steps items={[
            <>Open het portaal in <strong>Chrome</strong>, log in en klik rechts in de adresbalk op het <strong>installeer-icoon</strong>, of kies <strong>⋮ → Opslaan en delen → Pagina installeren als app</strong> → <strong>Installeren</strong>.</>,
            <>Open de app via <strong>Launchpad</strong> of de map <strong>Programma&apos;s → Chrome-apps</strong>. Houd het icoon vast in het Dock (rechtermuisknop → <em>Opties → Bewaar in Dock</em>).</>,
            <>Wil je hem op het <strong>bureaublad</strong>: open Programma&apos;s → Chrome-apps, houd <strong>⌥ + ⌘</strong> ingedrukt en sleep <em>iSelectStore</em> naar het bureaublad (dat maakt een alias).</>,
            <>Ga in de app naar <Link href="/settings#push" className="font-semibold text-accent-strong underline">Instellingen → Pushmeldingen</Link> → <strong>Pushmeldingen inschakelen</strong> → <strong>Toestaan</strong>.</>,
            <>Controleer in <strong>Systeeminstellingen → Meldingen → iSelectStore</strong> (of Google Chrome): <em>Meldingen toestaan</em> aan met stijl <em>Banners</em> of <em>Meldingen</em>, en zet <em>Focus / Niet storen</em> uit.</>,
            <>Test met <strong>Toon testmelding op dit scherm</strong> en <strong>Stuur testpush</strong> in het blok <em>Controle op deze computer</em>.</>,
          ]} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Mac — Safari (macOS 14 Sonoma of nieuwer)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Steps items={[
            <>Open het portaal in <strong>Safari</strong> en log in.</>,
            <>Kies in de menubalk <strong>Bestand → Zet in Dock</strong>, laat de naam <em>iSelectStore</em> staan en klik op <strong>Voeg toe</strong>.</>,
            <>Open de app via het Dock-icoon (dat is een eigen venster zonder adresbalk). Op het <strong>bureaublad</strong>: Finder → Programma&apos;s → rechtermuisknop op <em>iSelectStore</em> → <strong>Maak alias</strong>, en sleep die naar het bureaublad.</>,
            <>Ga in de app naar <Link href="/settings#push" className="font-semibold text-accent-strong underline">Instellingen → Pushmeldingen</Link> → <strong>Pushmeldingen inschakelen</strong> → <strong>Sta toe</strong>.</>,
            <>Controleer in <strong>Systeeminstellingen → Meldingen → iSelectStore</strong>: meldingen aan met stijl <em>Banners</em>, <em>Focus / Niet storen</em> uit.</>,
            <>Test met <strong>Toon testmelding op dit scherm</strong> en <strong>Stuur testpush</strong>.</>,
          ]} />
          <p className="text-sm text-muted">Heb je een oudere macOS dan Sonoma (14)? Dan kan Safari geen app aanmaken: gebruik dan <strong>Chrome</strong> (hierboven).</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Problemen oplossen</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-[15px] text-muted">
          <p><strong className="text-foreground">Geen melding na de test?</strong> Controleer of de toestemming is toegestaan, of het apparaat bij Instellingen → Pushmeldingen op “Aan” staat en of Niet-storen uit staat.</p>
          <p><strong className="text-foreground">Controle in de app.</strong> Onder <Link href="/settings#push" className="underline">Instellingen → Pushmeldingen</Link> staat het blok <em>Controle op deze computer</em>: het laat zien of de browser toestemming heeft, kan de toestemming opnieuw vragen en toont een testmelding. Staat de toestemming op <em>geblokkeerd</em>, dan moet je dat zelf in de browser aanzetten (slotje in de adresbalk → Meldingen → Toestaan).</p>
          <p><strong className="text-foreground">Alleen over https.</strong> Installeren en push werken alleen via een beveiligde (https) verbinding.</p>
          <p><strong className="text-foreground">Privacy.</strong> De app bewaart geen persoonlijke pagina’s of gegevens offline; er wordt alleen statische inhoud (iconen, lettertypen) gecachet.</p>
        </CardContent>
      </Card>
    </div>
  );
}

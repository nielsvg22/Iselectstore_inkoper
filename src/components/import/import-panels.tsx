"use client";
import { CheckCircle2, FlaskConical, Link2, Trash2, Upload, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Notice } from "@/components/ui/states";
import { api } from "@/lib/client-api";

export function UrlImport() {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<Array<{ url: string; ok: boolean; error?: string; created?: boolean }>>([]);
  const [test, setTest] = React.useState<null | { ok: boolean; error?: string; ms: number; extracted?: Record<string, unknown>; recognition?: { model: string; confidence: number } }>(null);
  const urls = text.split(/\s+/).map((s) => s.trim()).filter(Boolean);
  return (
    <Card>
      <CardHeader><div><CardTitle className="flex items-center gap-2"><Link2 className="h-4 w-4 text-accent" />Advertentie-URL&apos;s</CardTitle><CardDescription>Plak één of meer Marktplaats-advertentielinks (max. 10 per keer). De pagina wordt eenmalig opgehaald zoals een browser dat doet — met robots.txt, rate limiting en zonder omzeiling van blokkades.</CardDescription></div></CardHeader>
      <CardContent className="space-y-4">
        <Textarea aria-label="Advertentie-URL's" rows={4} placeholder="https://www.marktplaats.nl/v/…" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <Button
            loading={busy === "import"}
            disabled={!urls.length}
            onClick={async () => {
              setBusy("import");
              try {
                const r = await api<{ results: typeof results }>("/api/import/url", { body: { urls } });
                setResults(r.results);
                const ok = r.results.filter((x) => x.ok).length;
                toast(`${ok} van ${r.results.length} geïmporteerd`, ok ? "ok" : "err");
                router.refresh();
              } catch (e) {
                toast((e as Error).message, "err");
              } finally {
                setBusy(null);
              }
            }}
          >
            Importeren &amp; analyseren
          </Button>
          <Button
            variant="outline"
            loading={busy === "test"}
            disabled={urls.length !== 1}
            title="Test of deze URL kan worden uitgelezen, zonder iets op te slaan"
            onClick={async () => {
              setBusy("test");
              setTest(null);
              try {
                setTest(await api("/api/sources/test", { body: { url: urls[0] } }));
              } catch (e) {
                setTest({ ok: false, error: (e as Error).message, ms: 0 });
              } finally {
                setBusy(null);
              }
            }}
          >
            Test uitlezing (1 URL)
          </Button>
        </div>
        {test && (
          <Notice tone={test.ok ? "success" : "danger"}>
            {test.ok ? (
              <div className="space-y-1">
                <p className="flex items-center gap-1.5 font-medium"><CheckCircle2 className="h-4 w-4 text-success" />Uitlezing gelukt ({test.ms} ms)</p>
                <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-foreground/80">{JSON.stringify({ ...test.extracted, herkend: test.recognition }, null, 2)}</pre>
              </div>
            ) : (
              <p className="flex items-start gap-1.5"><XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" /><span><strong>Uitlezing mislukt:</strong> {test.error}</span></p>
            )}
          </Notice>
        )}
        {results.length > 0 && (
          <ul className="space-y-1.5 text-sm" aria-live="polite">
            {results.map((r) => (
              <li key={r.url} className="flex items-start gap-2">
                {r.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />}
                <span className="min-w-0 break-words"><span className="text-muted">{r.url}</span><br />{r.ok ? (r.created ? "Nieuw toegevoegd" : "Bijgewerkt") : r.error}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function FileImport() {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [res, setRes] = React.useState<null | { created: number; updated: number; errors: Array<{ row: number; message: string }>; total: number }>(null);
  return (
    <Card>
      <CardHeader><div><CardTitle className="flex items-center gap-2"><Upload className="h-4 w-4 text-accent" />Export plakken of uploaden</CardTitle><CardDescription>JSON of CSV uit een toegestane bron (eigen export, partnerfeed, verzamelaar). Kolommen: id, titel, prijs, url, plaats, omschrijving, fotos (gescheiden met |), afstand, verzending.</CardDescription></div></CardHeader>
      <CardContent className="space-y-4">
        <input
          type="file"
          accept=".csv,.json,text/csv,application/json,text/plain"
          aria-label="Bestand kiezen"
          className="block w-full text-sm file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-muted-bg file:px-4 file:py-2 file:text-sm file:font-medium"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (f.size > 4_000_000) return toast("Bestand is te groot (max 4 MB)", "err");
            setText(await f.text());
          }}
        />
        <Textarea aria-label="Inhoud van het bestand" rows={6} placeholder={"id;titel;prijs;url;plaats;omschrijving\n123;iPhone 14 128GB;450;https://…;Utrecht;Batterij 90%"} value={text} onChange={(e) => setText(e.target.value)} />
        <Button
          loading={busy}
          disabled={!text.trim()}
          onClick={async () => {
            setBusy(true);
            setRes(null);
            try {
              const r = await api<NonNullable<typeof res>>("/api/import/file", { body: { content: text } });
              setRes(r);
              toast(`${r.created} nieuw, ${r.updated} bijgewerkt`);
              router.refresh();
            } catch (e) {
              toast((e as Error).message, "err");
            } finally {
              setBusy(false);
            }
          }}
        >
          Importeren &amp; analyseren
        </Button>
        {res && (
          <Notice tone={res.errors.length ? "warning" : "success"}>
            <p>{res.created} nieuw · {res.updated} bijgewerkt · {res.errors.length} fouten (van {res.total} rijen)</p>
            {res.errors.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs">{res.errors.slice(0, 8).map((er) => (<li key={er.row}>Rij {er.row}: {er.message}</li>))}</ul>}
          </Notice>
        )}
      </CardContent>
    </Card>
  );
}

export function DemoPanel({ demoMode }: { demoMode: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const act = async (action: "load" | "remove") => {
    setBusy(true);
    try {
      await api("/api/import/demo", { body: { action } });
      toast(action === "load" ? "Voorbeelddata geladen" : "Voorbeelddata verwijderd");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader><div><CardTitle className="flex items-center gap-2"><FlaskConical className="h-4 w-4 text-warning" />Demonstratiemodus</CardTitle><CardDescription>Laadt ±36 duidelijk gemarkeerde <strong>voorbeeldadvertenties</strong> en bijbehorende voorbeeldprijzen om de app te verkennen. Het zijn geen echte advertenties; ze worden gescheiden van je echte data bewaard en versturen nooit meldingen.</CardDescription></div></CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button variant="secondary" loading={busy} onClick={() => act("load")}>{demoMode ? "Voorbeelddata opnieuw laden" : "Voorbeelddata laden"}</Button>
        {demoMode && <Button variant="outline" loading={busy} onClick={() => act("remove")}><Trash2 className="h-4 w-4" />Verwijderen &amp; demomodus uit</Button>}
      </CardContent>
    </Card>
  );
}

export { Field, Input };

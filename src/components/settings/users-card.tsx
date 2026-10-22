"use client";
import { KeyRound, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useToast } from "@/components/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/client-api";

interface UserRow { id: string; email: string; name: string | null; role: "ADMIN" | "USER" }

/** Gebruikersbeheer (alleen beheerders): account aanmaken met tijdelijk wachtwoord, of een nieuw wachtwoord zetten. */
export function UsersCard({ users }: { users: UserRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState<"ADMIN" | "USER">("USER");
  const [busy, setBusy] = React.useState(false);
  const [secret, setSecret] = React.useState<{ email: string; password: string } | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ user: UserRow; password?: string }>("/api/users", { method: "POST", body: { email, name, role } });
      setSecret(r.password ? { email: r.user.email, password: r.password } : null);
      toast(`Account aangemaakt voor ${r.user.email}`);
      setEmail(""); setName("");
      router.refresh();
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reset(u: UserRow) {
    if (!window.confirm(`Nieuw tijdelijk wachtwoord zetten voor ${u.email}? Het oude wachtwoord werkt dan niet meer.`)) return;
    try {
      setSecret(await api<{ email: string; password: string }>(`/api/users/${u.id}`, { method: "POST" }));
    } catch (err) {
      toast((err as Error).message);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gebruikers</CardTitle>
        <CardDescription>Maak accounts aan. Het tijdelijke wachtwoord wordt één keer getoond; geef het persoonlijk door.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <ul className="divide-y divide-card-border rounded-2xl border border-card-border">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{u.name || u.email}</p>
                {u.name && <p className="truncate text-xs text-muted">{u.email}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Badge>{u.role === "ADMIN" ? "Beheerder" : "Gebruiker"}</Badge>
                <Button type="button" variant="outline" size="sm" onClick={() => reset(u)}><KeyRound className="h-4 w-4" /> Nieuw wachtwoord</Button>
              </div>
            </li>
          ))}
        </ul>
        {secret && (
          <div role="status" className="rounded-2xl border border-card-border bg-ivory p-4 text-sm">
            <p className="font-medium">Tijdelijk wachtwoord voor {secret.email}</p>
            <p className="mt-1 select-all font-mono text-base" data-testid="temp-password">{secret.password}</p>
            <p className="mt-1 text-xs text-muted">Wordt niet opnieuw getoond en is niet opgeslagen in leesbare vorm.</p>
          </div>
        )}
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
          <input className="h-11 min-w-0 rounded-xl border border-card-border px-3 text-sm" type="email" required placeholder="E-mailadres" aria-label="E-mailadres nieuwe gebruiker" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="h-11 min-w-0 rounded-xl border border-card-border px-3 text-sm" placeholder="Naam (optioneel)" aria-label="Naam nieuwe gebruiker" value={name} onChange={(e) => setName(e.target.value)} />
          <select className="h-11 rounded-xl border border-card-border px-3 text-sm" aria-label="Rol" value={role} onChange={(e) => setRole(e.target.value as "ADMIN" | "USER")}>
            <option value="USER">Gebruiker</option>
            <option value="ADMIN">Beheerder</option>
          </select>
          <Button type="submit" loading={busy}><UserPlus className="h-4 w-4" /> Account maken</Button>
        </form>
      </CardContent>
    </Card>
  );
}

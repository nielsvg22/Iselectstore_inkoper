"use client";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { ErrorState } from "@/components/ui/states";
import { api } from "@/lib/client-api";

export function AuthForm({ mode }: { mode: "login" | "setup" }) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api(mode === "login" ? "/api/auth/login" : "/api/auth/setup", { body: { email, password } });
          router.replace("/");
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      <Field label="E-mailadres" htmlFor="email">
        <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Wachtwoord" htmlFor="password" hint={mode === "setup" ? "Minimaal 10 tekens." : undefined}>
        <Input id="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "setup" ? 10 : 1} value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {error && <ErrorState title={mode === "login" ? "Inloggen mislukt" : "Account aanmaken mislukt"} message={error} />}
      <Button type="submit" size="lg" className="w-full" loading={busy}>
        {mode === "login" ? "Inloggen" : "Account aanmaken"}
      </Button>
    </form>
  );
}

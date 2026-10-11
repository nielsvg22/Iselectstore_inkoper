"use client";
import { Pause, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";

export function GroupActions({ group, subgroup, anyActive, compact }: { group: string; subgroup?: string; anyActive: boolean; compact?: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const run = async (active: boolean) => {
    setBusy(true);
    try {
      const r = await api<{ updated: number }>("/api/profiles/group", { body: { group, subgroup, active } });
      toast(`${r.updated} profielen ${active ? "aangezet" : "gepauzeerd"}`);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };
  return anyActive ? (
    <Button variant="outline" size="sm" loading={busy} onClick={() => run(false)} aria-label={subgroup ? `${subgroup} pauzeren` : "Alles pauzeren"}><Pause className="h-3.5 w-3.5" />{compact ? "Pauzeren" : "Alles pauzeren"}</Button>
  ) : (
    <Button variant="outline" size="sm" loading={busy} onClick={() => run(true)} aria-label={subgroup ? `${subgroup} aanzetten` : "Alles aanzetten"}><Play className="h-3.5 w-3.5" />{compact ? "Aanzetten" : "Alles aanzetten"}</Button>
  );
}

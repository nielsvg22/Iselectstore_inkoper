"use client";
import * as React from "react";
import { Input } from "@/components/ui/form";

export function Chips({ id, value, onChange, placeholder, listId }: { id: string; value: string[]; onChange: (v: string[]) => void; placeholder: string; listId?: string }) {
  const [draft, setDraft] = React.useState("");
  const add = () => {
    const v = draft.trim().toLowerCase();
    if (v && !value.includes(v)) onChange([...value, v]);
    setDraft("");
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
            {v}
            <button type="button" aria-label={`Verwijder ${v}`} onClick={() => onChange(value.filter((x) => x !== v))} className="rounded-full px-0.5 hover:bg-accent/20">×</button>
          </span>
        ))}
      </div>
      <Input
        id={id}
        className="mt-2"
        list={listId}
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
      />
    </div>
  );
}

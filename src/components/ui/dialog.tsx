"use client";
import { X } from "lucide-react";
import * as React from "react";
import { Button } from "./button";

export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl border border-card-border bg-card p-0 text-foreground shadow-pop backdrop:bg-black/40 backdrop:backdrop-blur-sm"
    >
      <div className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <Button variant="ghost" size="icon" aria-label="Sluiten" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

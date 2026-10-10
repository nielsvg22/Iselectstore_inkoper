import * as React from "react";
import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4 w-full", className)} aria-hidden />;
}

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius)] border border-dashed border-border px-6 py-14 text-center">
      {icon && <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">{icon}</div>}
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      {description && <p className="mt-1.5 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "Er ging iets mis", message, action }: { title?: string; message?: string; action?: React.ReactNode }) {
  return (
    <div role="alert" className="rounded-[var(--radius)] border border-danger/30 bg-danger-soft px-5 py-4 text-sm">
      <p className="font-semibold text-danger">{title}</p>
      {message && <p className="mt-1 text-foreground/80">{message}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children, className }: { tone?: "info" | "warning" | "danger" | "success"; children: React.ReactNode; className?: string }) {
  const t = { info: "bg-accent-soft text-foreground", warning: "bg-warning-soft text-foreground", danger: "bg-danger-soft text-foreground", success: "bg-success-soft text-foreground" }[tone];
  return <div className={cn("rounded-2xl px-4 py-3 text-sm", t, className)}>{children}</div>;
}

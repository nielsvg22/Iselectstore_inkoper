import * as React from "react";
import { cn } from "@/lib/cn";

const field = "w-full rounded-xl border border-border bg-card px-3.5 text-[15px] text-foreground placeholder:text-muted/70 transition focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft disabled:opacity-50";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => <input ref={ref} className={cn(field, "h-11", className)} {...p} />);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => <textarea ref={ref} className={cn(field, "min-h-24 py-2.5", className)} {...p} />);
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => (
  <select ref={ref} className={cn(field, "h-11 appearance-none bg-no-repeat pr-9", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2386868b' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")", backgroundPosition: "right 14px center" }} {...p}>
    {children}
  </select>
));
Select.displayName = "Select";

export function Label({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-[13px] font-medium text-foreground/80", className)} {...p} />;
}

export function Field({ label, hint, children, className, htmlFor }: { label: string; hint?: string; children: React.ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Switch({ checked, onChange, label, id, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; id?: string; disabled?: boolean }) {
  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-3">
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50", checked ? "bg-success" : "bg-muted-bg border border-border")}
      >
        <span className={cn("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200", checked ? "translate-x-[22px]" : "translate-x-0.5")} />
      </button>
      {label && <span className="text-sm">{label}</span>}
    </label>
  );
}

import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/cn";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[14px] text-sm font-semibold transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] select-none cursor-pointer",
  {
    variants: {
      variant: {
        primary: "bg-gradient-to-r from-[#FF7A88] to-[#F9606F] text-white shadow-[0_8px_18px_rgba(249,96,111,0.3)] hover:brightness-105",
        secondary: "bg-muted-bg text-foreground hover:brightness-95 dark:hover:brightness-125",
        outline: "border border-border bg-card text-foreground hover:bg-muted-bg",
        ghost: "text-foreground hover:bg-muted-bg",
        danger: "bg-danger text-white hover:brightness-110",
        soft: "bg-accent-soft text-accent hover:brightness-95",
      },
      size: { sm: "h-9 px-4 text-[13px]", md: "h-11 px-5", lg: "h-[52px] px-7 text-base", icon: "h-9 w-9" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, loading, children, disabled, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
    {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
    {children}
  </button>
));
Button.displayName = "Button";

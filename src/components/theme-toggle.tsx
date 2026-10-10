"use client";
import { Moon, Sun } from "lucide-react";
import * as React from "react";
import { Button } from "./ui/button";

export function ThemeToggle() {
  const [dark, setDark] = React.useState(false);
  React.useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={dark ? "Schakel naar lichte modus" : "Schakel naar donkere modus"}
      onClick={() => {
        const next = !dark;
        setDark(next);
        document.documentElement.classList.toggle("dark", next);
        try {
          localStorage.setItem("adh-theme", next ? "dark" : "light");
        } catch {
          /* negeren */
        }
      }}
    >
      {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </Button>
  );
}

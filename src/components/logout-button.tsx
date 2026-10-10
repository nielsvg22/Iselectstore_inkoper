"use client";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";

export function LogoutButton() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Uitloggen"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.replace("/login");
        router.refresh();
      }}
    >
      <LogOut className="h-[18px] w-[18px]" />
    </Button>
  );
}

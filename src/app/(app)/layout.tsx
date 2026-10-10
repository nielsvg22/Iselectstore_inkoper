import { FlaskConical } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BottomNav, SideNav } from "@/components/nav";
import { LogoutButton } from "@/components/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCurrentUser } from "@/lib/auth";
import { getConfig } from "@/lib/settings/store";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const cfg = await getConfig();
  return (
    <div className="mx-auto flex min-h-dvh max-w-[1500px]">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col justify-between px-4 py-6 lg:flex">
        <div>
          <Link href="/" className="mb-8 flex items-center gap-2.5 px-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-gradient-to-br from-accent to-[#5e5ce6] text-lg text-white shadow-sm" aria-hidden></span>
            <span className="text-[17px] font-semibold tracking-tight">Deal Hunter</span>
          </Link>
          <SideNav />
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-card px-3 py-2.5 shadow-card">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium">{user.name ?? user.email}</p>
            <p className="text-xs text-muted">{user.role === "ADMIN" ? "Beheerder" : "Gebruiker"}</p>
          </div>
          <div className="flex shrink-0">
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1 px-4 pb-28 pt-4 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">
        <header className="mb-4 flex items-center justify-between lg:hidden">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-gradient-to-br from-accent to-[#5e5ce6] text-white" aria-hidden></span>
            <span className="font-semibold tracking-tight">Deal Hunter</span>
          </Link>
          <div className="flex">
            <ThemeToggle />
            <LogoutButton />
          </div>
        </header>
        {cfg.demoMode && (
          <div className="mb-5 flex items-center gap-2.5 rounded-2xl bg-warning-soft px-4 py-3 text-sm" role="status">
            <FlaskConical className="h-4 w-4 shrink-0 text-warning" />
            <p>
              <strong>Demonstratiemodus:</strong> alle getoonde advertenties zijn voorbeeldgegevens en geen echte Marktplaats-advertenties.{" "}
              <Link href="/import" className="font-medium underline underline-offset-2">Beheren</Link>
            </p>
          </div>
        )}
        <main className="fade-up">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}

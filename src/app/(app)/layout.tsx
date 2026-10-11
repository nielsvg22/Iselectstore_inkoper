import { FlaskConical } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LivePopups } from "@/components/notify/live-popups";
import { BottomNav } from "@/components/shell/bottom-nav";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { getConfig } from "@/lib/settings/store";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const cfg = await getConfig();
  const hasNew = (await prisma.notification.count({ where: { status: "SENT", sentAt: { gte: new Date(Date.now() - 24 * 3600_000) } } })) > 0;
  return (
    <div className="mx-auto flex min-h-dvh max-w-[1720px] gap-8 p-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))] lg:p-6 lg:pb-6">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <Topbar name={user.name ?? user.email} role={user.role} hasNew={hasNew} />
        {cfg.demoMode && (
          <div className="mt-6 flex items-center gap-2.5 rounded-2xl bg-warning-soft/60 px-4 py-2.5 text-[13px] text-muted" role="status">
            <FlaskConical className="h-4 w-4 shrink-0 text-warning" />
            <p>
              <strong>Demonstratiemodus:</strong> alle getoonde advertenties zijn voorbeeldgegevens en geen echte Marktplaats-advertenties.{" "}
              <Link href="/import" className="font-semibold underline underline-offset-2">Beheren</Link>
            </p>
          </div>
        )}
        <main className="fade-up mt-8">{children}</main>
      </div>
      <LivePopups />
      <BottomNav />
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { AutoMsgEditor } from "@/components/rules/automsg-editor";
import { getCurrentUser } from "@/lib/auth";
import { recentAutoMessages } from "@/lib/rules/automsg";
import { getRules } from "@/lib/rules/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Auto-berichten" };

export default async function AutoMsgPage() {
  const [user, rules, messages] = await Promise.all([getCurrentUser(), getRules(), recentAutoMessages(100)]);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-[32px] font-semibold tracking-tight">Auto-berichten</h1>
        <p className="mt-1 text-muted">Berichten aan verkopers klaarzetten met de sjablonen van de klant. <Link href="/rules" className="underline">Terug naar Inkoopregels</Link>.</p>
      </div>
      <AutoMsgEditor initialRules={rules} messages={messages} isAdmin={user?.role === "ADMIN"} />
    </div>
  );
}

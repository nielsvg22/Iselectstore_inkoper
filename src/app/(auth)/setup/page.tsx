import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { prisma } from "@/lib/db/client";

export const metadata: Metadata = { title: "Eerste account" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if ((await prisma.user.count()) > 0) redirect("/login");
  return (
    <>
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Welkom bij Deal Hunter</h1>
        <p className="mt-1 text-sm text-muted">Maak het beheerdersaccount aan om te beginnen.</p>
      </div>
      <AuthForm mode="setup" />
    </>
  );
}

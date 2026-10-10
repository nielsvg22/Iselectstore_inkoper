import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

export const metadata: Metadata = { title: "Inloggen" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  if ((await prisma.user.count()) === 0) redirect("/setup");
  return (
    <>
      <div className="mb-8 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[20px] bg-gradient-to-br from-accent to-[#5e5ce6] text-3xl text-white shadow-pop" aria-hidden></div>
        <h1 className="text-2xl font-semibold tracking-tight">Apple Deal Hunter</h1>
        <p className="mt-1 text-sm text-muted">Log in om je beste inkoopdeals te zien.</p>
      </div>
      <AuthForm mode="login" />
    </>
  );
}

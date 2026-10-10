import type { Metadata } from "next";
import { ProfileEditor } from "@/components/profile/profile-editor";
import { defaultProfile } from "@/lib/profile-form";

export const metadata: Metadata = { title: "Nieuw zoekprofiel" };

export default function NewProfilePage() {
  const base = defaultProfile();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-[32px] font-semibold tracking-tight">Nieuw zoekprofiel</h1>
      <ProfileEditor initial={{ ...base, name: "iPhone 15 Pro inkoop" }} />
    </div>
  );
}

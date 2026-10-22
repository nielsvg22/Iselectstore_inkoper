import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { verifyPassword } from "@/lib/security/crypto";
import { GET as listGet, POST as createPost } from "@/app/api/users/route";
import { POST as resetPost } from "@/app/api/users/[id]/route";
import { ctx, makeUser, req, resetDb } from "../helpers";

beforeEach(async () => { await resetDb(); });

describe("gebruikersbeheer", () => {
  it("alleen beheerders; maakt account met eenmalig tijdelijk wachtwoord, nooit in leesbare vorm opgeslagen", async () => {
    const admin = await makeUser("ADMIN", "admin@example.com");
    const plain = await makeUser("USER", "gewoon@example.com");
    const body = { email: "Info@BestBuyPhone.nl", name: "BestBuyPhone", role: "ADMIN" };
    expect((await createPost(req("/api/users", { method: "POST", body, cookie: plain.cookie }))).status).toBe(403);
    expect((await listGet(req("/api/users", { cookie: plain.cookie }))).status).toBe(403);
    expect((await createPost(req("/api/users", { method: "POST", body }))).status).toBe(401);

    const r = await createPost(req("/api/users", { method: "POST", body, cookie: admin.cookie }));
    expect(r.status).toBe(200);
    const j = (await r.json()) as { user: { email: string; role: string }; password: string };
    expect(j.user.email).toBe("info@bestbuyphone.nl");
    expect(j.user.role).toBe("ADMIN");
    expect(j.password).toHaveLength(16);
    const row = await prisma.user.findUniqueOrThrow({ where: { email: "info@bestbuyphone.nl" } });
    expect(row.passwordHash).not.toContain(j.password);
    expect(verifyPassword(j.password, row.passwordHash)).toBe(true);

    // dubbel e-mailadres
    expect((await createPost(req("/api/users", { method: "POST", body, cookie: admin.cookie }))).status).toBe(409);
    // lijst bevat nooit wachtwoordhashes
    const list = await (await listGet(req("/api/users", { cookie: admin.cookie }))).text();
    expect(list).toContain("info@bestbuyphone.nl");
    expect(list).not.toContain("scrypt$");
    expect(await prisma.auditLog.count({ where: { action: "user.created" } })).toBe(1);
  });

  it("nieuw wachtwoord zetten maakt het oude ongeldig", async () => {
    const admin = await makeUser("ADMIN", "admin@example.com");
    const created = await (await createPost(req("/api/users", { method: "POST", body: { email: "twan@example.com", role: "ADMIN" }, cookie: admin.cookie }))).json() as { user: { id: string }; password: string };
    const r = await resetPost(req("/x", { method: "POST", cookie: admin.cookie }), ctx({ id: created.user.id }));
    const j = (await r.json()) as { password: string };
    const row = await prisma.user.findUniqueOrThrow({ where: { id: created.user.id } });
    expect(verifyPassword(j.password, row.passwordHash)).toBe(true);
    expect(verifyPassword(created.password, row.passwordHash)).toBe(false);
    expect((await resetPost(req("/x", { method: "POST", cookie: admin.cookie }), ctx({ id: "bestaatniet" }))).status).toBe(404);
  });
});

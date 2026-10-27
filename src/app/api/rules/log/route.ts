import { route } from "@/lib/api";
import { filterLog } from "@/lib/rules/log";

export const GET = route(async (req) => {
  const u = new URL(req.url);
  const platform = u.searchParams.get("platform");
  return filterLog({
    platform: platform === "vinted" ? "vinted" : platform === "marktplaats" ? "marktplaats" : undefined,
    status: u.searchParams.get("status") ?? undefined,
    limit: Number(u.searchParams.get("limit")) || undefined,
  });
});

import { route } from "@/lib/api";
import { funnelStats, offerOverview } from "@/lib/funnel";

export const GET = route(async (req, { user }) => {
  const u = new URL(req.url);
  const days = Math.min(365, Math.max(1, Number(u.searchParams.get("days")) || 30));
  const [funnel, offer] = await Promise.all([funnelStats(user.role === "ADMIN" ? null : user.id, days), offerOverview(Math.min(days, 60))]);
  return { funnel, offer };
});

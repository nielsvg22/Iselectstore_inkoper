const LABELS: Record<string, string> = { iphone: "iPhone", macbook_air: "MacBook", macbook_pro: "MacBook", ipad: "iPad", watch: "Watch", airpods: "AirPods" };

export async function GET(req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params;
  const label = LABELS[kind] ?? "Apple";
  const v = new URL(req.url).searchParams.get("v") === "2";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${v ? "#dfe7f3" : "#e8ecf4"}"/><stop offset="1" stop-color="${v ? "#c3cde0" : "#cfd6e4"}"/></linearGradient></defs><rect width="640" height="480" fill="url(#g)"/><text x="320" y="235" font-family="-apple-system,Helvetica,Arial" font-size="44" font-weight="600" fill="#5b667a" text-anchor="middle">${label}</text><text x="320" y="285" font-family="-apple-system,Helvetica,Arial" font-size="22" fill="#7a869b" text-anchor="middle">VOORBEELDDATA</text></svg>`;
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" } });
}

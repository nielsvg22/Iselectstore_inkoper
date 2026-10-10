"use client";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function PriceHistoryChart({ data }: { data: Array<{ date: string; price: number; market?: number }> }) {
  if (data.length < 2) return <p className="text-sm text-muted">Nog geen prijswijzigingen waargenomen. Zodra de vraagprijs verandert, verschijnt hier het verloop.</p>;
  return (
    <div className="h-56 w-full" role="img" aria-label="Verloop van de vraagprijs">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => `€${v}`} domain={["auto", "auto"]} />
          <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }} formatter={(v: number, n: string) => [`€${v}`, n === "price" ? "Vraagprijs" : "Marktwaarde"]} />
          <Line type="stepAfter" dataKey="price" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3 }} />
          {data.some((d) => d.market != null) && <Line type="monotone" dataKey="market" stroke="var(--success)" strokeWidth={2} strokeDasharray="5 4" dot={false} />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

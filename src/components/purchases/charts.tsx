"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const tip = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 };

export function ProfitTimeline({ data }: { data: Array<{ date: string; cumulative: number }> }) {
  if (!data.length) return <p className="text-sm text-muted">Zodra je verkopen registreert, zie je hier je winstontwikkeling.</p>;
  return (
    <div className="h-56" role="img" aria-label="Cumulatieve gerealiseerde winst">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--success)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--success)" stopOpacity={0} /></linearGradient></defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => `€${v / 100}`} />
          <Tooltip contentStyle={tip} formatter={(v: number) => [`€${(v / 100).toFixed(0)}`, "Cumulatieve winst"]} />
          <Area type="monotone" dataKey="cumulative" stroke="var(--success)" strokeWidth={2.5} fill="url(#g1)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BestProducts({ data }: { data: Array<{ label: string; profit: number; count: number }> }) {
  if (!data.length) return <p className="text-sm text-muted">Nog geen verkochte producten.</p>;
  return (
    <div className="h-56" role="img" aria-label="Meest winstgevende producten">
      <ResponsiveContainer>
        <BarChart data={data.map((d) => ({ ...d, label: d.label.length > 18 ? d.label.slice(0, 17) + "…" : d.label }))} layout="vertical" margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} tickFormatter={(v) => `€${v / 100}`} />
          <YAxis type="category" dataKey="label" width={120} tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tip} formatter={(v: number) => [`€${(v / 100).toFixed(0)}`, "Winst"]} />
          <Bar dataKey="profit" fill="var(--accent)" radius={[0, 8, 8, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

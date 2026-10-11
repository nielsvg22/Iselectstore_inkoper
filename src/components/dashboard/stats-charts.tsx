"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const tip = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 };
const tick = { fontSize: 11, fill: "var(--muted)" };

export function DealsPerDay({ data }: { data: Array<{ day: string; deals: number; interesting: number }> }) {
  return (
    <div className="h-64" role="img" aria-label="Nieuwe advertenties per dag">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <defs><linearGradient id="dpd" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ff6f7d" stopOpacity={0.3} /><stop offset="100%" stopColor="#ff6f7d" stopOpacity={0} /></linearGradient></defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="day" tick={tick} tickLine={false} axisLine={false} />
          <YAxis tick={tick} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
          <Tooltip contentStyle={tip} />
          <Area type="monotone" name="Alle advertenties" dataKey="deals" stroke="#ff9aa4" strokeWidth={2} fill="url(#dpd)" />
          <Area type="monotone" name="Interessante deals" dataKey="interesting" stroke="#f0525f" strokeWidth={2.5} fill="none" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ByModel({ data }: { data: Array<{ label: string; count: number }> }) {
  if (!data.length) return <p className="text-sm text-muted">Nog geen data.</p>;
  return (
    <div className="h-64" role="img" aria-label="Deals per model">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis type="number" tick={tick} tickLine={false} axisLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="label" width={130} tick={tick} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tip} />
          <Bar dataKey="count" name="Aantal" fill="#182439" radius={[0, 8, 8, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

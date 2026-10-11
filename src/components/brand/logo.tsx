import Link from "next/link";

/** iSelectStore-merkteken (asterisk) — vectoraal, scherp op elke schaal. */
export function LogoMark({ size = 40, tile = false, className }: { size?: number; tile?: boolean; className?: string }) {
  const mark = (
    <svg viewBox="0 0 64 64" width={tile ? size * 0.62 : size} height={tile ? size * 0.62 : size} aria-hidden fill="none" stroke={tile ? "#182439" : "#FF7686"} strokeWidth="9" strokeLinecap="round">
      <path d="M33 33 L36 9" /><path d="M33 33 L55 22" /><path d="M33 33 L47 54" /><path d="M33 33 L18 52" /><path d="M33 33 L9 36" />
    </svg>
  );
  if (!tile) return <span className={className} style={{ width: size, height: size, display: "inline-flex" }}>{mark}</span>;
  return (
    <span className={className} style={{ width: size, height: size, borderRadius: size * 0.28, background: "linear-gradient(135deg,#FF8A94,#F9606F)", display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 20px rgba(249,96,111,.35)" }}>
      {mark}
    </span>
  );
}

export function Logo({ href = "/", onDark = true }: { href?: string; onDark?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-3" aria-label="iSelectStore — naar het dashboard">
      <LogoMark size={44} />
      <span className="leading-tight">
        <span className={`block text-[22px] font-bold tracking-tight ${onDark ? "text-white" : "text-foreground"}`}>iSelectStore</span>
        <span className={`block text-[12.5px] ${onDark ? "text-white/70" : "text-muted"}`}>Marktplaats Scraper</span>
      </span>
    </Link>
  );
}

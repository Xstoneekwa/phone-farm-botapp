export type BadgeTone = "success" | "error" | "warning" | "info" | "neutral" | "accent";

const tones: Record<BadgeTone, { bg: string; text: string; dot?: string }> = {
  success: { bg: "var(--green-bg)", text: "var(--green-text)", dot: "#22C55E" },
  error: { bg: "var(--red-bg)", text: "var(--red-text)", dot: "#F87171" },
  warning: { bg: "var(--amber-bg)", text: "var(--amber-text)", dot: "#FBBF24" },
  info: { bg: "var(--blue-bg)", text: "var(--blue-text)" },
  neutral: { bg: "var(--neutral-bg)", text: "var(--neutral-text)" },
  accent: { bg: "var(--accent-tint)", text: "#4338CA" },
};

export function Badge({ children, tone = "neutral", dot = false }: { children: React.ReactNode; tone?: BadgeTone; dot?: boolean }) {
  const cfg = tones[tone];
  return <span className="badge" style={{ background: cfg.bg, color: cfg.text }}>
    {dot && cfg.dot ? <span className="badge-dot" style={{ background: cfg.dot }} /> : null}{children}
  </span>;
}

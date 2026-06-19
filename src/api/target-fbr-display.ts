import type { ProfileTarget } from "./types";

export const FBR_NOT_MEASURED_EN = "Not measured";
export const FBR_NOT_MEASURED_FR = "Non mesuré";

export type TargetFbrResolution = {
  fbrMetricsReliable: boolean;
  fbrPercent: number | null;
  fbrLabel: string | null;
  followbacksMetricsReliableAt: string | null;
  followsSent: number | null;
  followbacks: number | null;
};

function readOptionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function readOptionalString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function readCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
  return null;
}

function readReliableFlag(row: Record<string, unknown>): boolean | null {
  if (typeof row.fbrMetricsReliable === "boolean") return row.fbrMetricsReliable;
  if (typeof row.fbr_metrics_reliable === "boolean") return row.fbr_metrics_reliable;
  return null;
}

export function formatFbrPercent(percent: number): string {
  return `${new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(percent)}%`;
}

export function resolveTargetFbrFromApiRow(row: Record<string, unknown>): TargetFbrResolution {
  const followsSent = readCount(row.followsSentCount) ?? readCount(row.follows_sent_count);
  const followbacks = readCount(row.followbacksCount) ?? readCount(row.followbacks_count);
  const reliableAt = readOptionalString(row.followbacks_metrics_reliable_at);
  const explicitReliable = readReliableFlag(row);
  const hasRelayProjection = explicitReliable !== null
    || row.fbrPercent !== undefined
    || row.fbr_percent !== undefined
    || row.fbrLabel !== undefined
    || row.fbr_label !== undefined
    || reliableAt !== null;

  const fbrMetricsReliable = explicitReliable === true
    || (explicitReliable === null && hasRelayProjection && reliableAt !== null);

  const relayFbrPercent = readOptionalNumber(row.fbrPercent) ?? readOptionalNumber(row.fbr_percent);
  const relayFollowbackRatio = fbrMetricsReliable ? readOptionalNumber(row.followback_ratio) : null;
  const fbrPercent = fbrMetricsReliable ? (relayFbrPercent ?? relayFollowbackRatio) : null;

  const relayLabel = readOptionalString(row.fbrLabel) ?? readOptionalString(row.fbr_label);
  const fbrLabel = fbrMetricsReliable
    ? (relayLabel ?? (fbrPercent !== null ? formatFbrPercent(fbrPercent) : null))
    : FBR_NOT_MEASURED_EN;

  return {
    fbrMetricsReliable,
    fbrPercent,
    fbrLabel,
    followbacksMetricsReliableAt: reliableAt,
    followsSent,
    followbacks,
  };
}

export function formatTargetFbrDisplay(
  target: Pick<ProfileTarget, "fbrMetricsReliable" | "fbrPercent" | "fbrLabel" | "followsSent">,
  locale: "en" | "fr" = "en",
): string {
  const notMeasured = locale === "fr" ? FBR_NOT_MEASURED_FR : FBR_NOT_MEASURED_EN;
  if (target.fbrMetricsReliable !== true) return notMeasured;
  if (target.fbrLabel) return target.fbrLabel;
  if (target.fbrPercent !== null && target.fbrPercent !== undefined) return formatFbrPercent(target.fbrPercent);
  if (typeof target.followsSent === "number" && target.followsSent <= 0) return "—";
  return "—";
}

import type { ProfileFollowerDelta3d, ProfileUnfollowTruthfulness } from "../../api/types";

export function shortSnapshotDate(value: string | null | undefined) {
  if (!value) return "unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unavailable";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

export function followerDeltaStatus(delta?: ProfileFollowerDelta3d) {
  if (delta?.status) return delta.status;
  if (delta?.dataFreshness === "stale") return "stale" as const;
  if (delta?.value === null || delta?.value === undefined) return "unavailable" as const;
  return "fresh" as const;
}

function followerDeltaValueLabel(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return value > 0 ? `+${value}` : String(value);
}

export function followerDeltaDisplayLabel(delta?: ProfileFollowerDelta3d) {
  const status = followerDeltaStatus(delta);
  const value = status === "insufficient_data" || status === "unavailable"
    ? null
    : delta?.value;
  const suffix = status === "stale" ? " · stale" : status === "aging" ? " · aging" : "";
  return `${followerDeltaValueLabel(value)} · 3d${suffix}`;
}

export function followerDeltaDisplayTone(delta?: ProfileFollowerDelta3d) {
  const status = followerDeltaStatus(delta);
  if (status === "stale") return "stale";
  if (status === "aging") return "aging";
  const value = delta?.value;
  if (value === null || value === undefined) return "unknown";
  if (value > 0) return "up";
  if (value === 0) return "zero";
  return "down";
}

function snapshotAgeLabel(ageSeconds: number | null | undefined) {
  if (!Number.isFinite(ageSeconds)) return "Update age unavailable";
  const hours = Math.max(0, Math.round(Number(ageSeconds) / 3600));
  if (hours < 24) return `Updated ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `Updated ${days} day${days === 1 ? "" : "s"} ago`;
}

export function followerDeltaTooltip(delta?: ProfileFollowerDelta3d) {
  const baseline = delta?.baselineValue ?? delta?.previousFollowers ?? null;
  const current = delta?.currentValue ?? delta?.currentFollowers ?? null;
  const baselineAt = delta?.baselineCapturedAt ?? delta?.baselineSnapshotAt ?? delta?.deltaFrom ?? delta?.from;
  const currentAt = delta?.currentCapturedAt ?? delta?.capturedAt ?? delta?.latestSnapshotAt ?? delta?.deltaTo ?? delta?.to;
  const coverage = Number.isFinite(delta?.windowCoverageHours)
    ? `Coverage ${delta?.windowCoverageHours} h`
    : "Coverage unavailable";
  return [
    followerDeltaDisplayLabel(delta),
    "Net follower change over approximately 72 hours",
    `Current ${current ?? "—"}`,
    `Baseline ${baseline ?? "—"}`,
    `${shortSnapshotDate(baselineAt)} → ${shortSnapshotDate(currentAt)}`,
    coverage,
    snapshotAgeLabel(delta?.ageSeconds),
    `Status ${followerDeltaStatus(delta)}`,
    `Source ${delta?.source || "unavailable"}`,
  ].join(" · ");
}

export function unfollowMetricTooltip(metrics?: ProfileUnfollowTruthfulness, displayedCurrent?: number, displayedCap?: number) {
  if (!metrics || metrics.source === "unavailable") {
    const current = Number.isFinite(displayedCurrent) ? displayedCurrent : "—";
    const cap = Number.isFinite(displayedCap) ? displayedCap : "—";
    return `${current} unfollows verified today · daily cap ${cap} · detailed last-run coverage unavailable.`;
  }
  const details = [
    `${metrics.unfollowDoneToday} unfollows verified today`,
    `daily cap ${metrics.unfollowDailyCap}`,
  ];
  if (metrics.unfollowEffectiveLimit !== null) details.push(`effective limit ${metrics.unfollowEffectiveLimit}`);
  if (metrics.lastRunEligibleAtStart !== null) details.push(`${metrics.lastRunEligibleAtStart} eligible at last-run start`);
  if (metrics.lastRunAttempted !== null) details.push(`${metrics.lastRunAttempted} attempted in last run`);
  if (metrics.lastRunVerified !== null) details.push(`${metrics.lastRunVerified} verified in last run`);
  if (metrics.lastRunRemainingEligible !== null) details.push(`${metrics.lastRunRemainingEligible} eligible remaining`);
  if (metrics.lastRunCoverageStatus) details.push(`UI coverage ${metrics.lastRunCoverageStatus}`);
  if (metrics.lastRunStopReason) details.push(`stop ${metrics.lastRunStopReason}`);
  if (metrics.metricsAsOf) details.push(`measured at ${metrics.metricsAsOf}`);
  return details.join(" · ");
}

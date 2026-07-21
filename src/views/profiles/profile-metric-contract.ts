import type { ProfileFollowerDelta3d, ProfileUnfollowTruthfulness } from "../../api/types";

export function shortSnapshotDate(value: string | null | undefined) {
  if (!value) return "unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unavailable";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

export function followerDeltaTooltip(delta?: ProfileFollowerDelta3d) {
  const value = delta?.value;
  const label = value === null || value === undefined ? "—" : value > 0 ? `+${value}` : String(value);
  return [
    label,
    "Rolling 72 h",
    `${shortSnapshotDate(delta?.deltaFrom ?? delta?.from)} → ${shortSnapshotDate(delta?.deltaTo ?? delta?.to)}`,
    `Snapshot ${delta?.dataFreshness ?? "unknown"}`,
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

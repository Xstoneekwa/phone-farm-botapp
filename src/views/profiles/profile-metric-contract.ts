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

export function unfollowMetricTooltip(metrics?: ProfileUnfollowTruthfulness) {
  if (!metrics) return "Unfollows verified today; detailed last-run coverage unavailable.";
  const details = [
    `${metrics.unfollowDoneToday} unfollows verified today`,
    `daily cap ${metrics.unfollowDailyCap}`,
  ];
  if (metrics.lastRunEligibleAtStart !== null) details.push(`${metrics.lastRunEligibleAtStart} eligible at last-run start`);
  if (metrics.lastRunVerified !== null) details.push(`${metrics.lastRunVerified} verified in last run`);
  if (metrics.lastRunRemainingEligible !== null) details.push(`${metrics.lastRunRemainingEligible} eligible remaining`);
  if (metrics.lastRunCoverageStatus) details.push(`UI coverage ${metrics.lastRunCoverageStatus}`);
  if (metrics.metricsAsOf) details.push(`measured at ${metrics.metricsAsOf}`);
  return details.join(" · ");
}

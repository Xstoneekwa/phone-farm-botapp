import type { BotProfile, DeviceProfileGroup, ProfileCounterProjection, ProfileRunCounters } from "../../api/types";

export type ProfilesLivePatch = {
  accountId: string;
  activeRunRequestId?: string | null;
  activeRunRequestStatus?: string | null;
  activeRunId?: string | null;
  activeRunStatus?: string | null;
  runtimeIndicator?: BotProfile["runtimeIndicator"];
  currentRunCounters?: ProfileRunCounters;
  countersToday?: Partial<Record<"follows" | "unfollows" | "likes" | "comments" | "dms", number>>;
  counterProjection?: ProfileCounterProjection;
  interactionsToday?: number;
  currentBlocker?: { actionType?: string; status?: string; blockingCampaign?: boolean } | null;
  followerDelta3d?: BotProfile["followerDelta3d"];
  liveSupportedKinds?: Array<"follow" | "unfollow" | "like" | "dm">;
  runControlPhase?: BotProfile["runControlPhase"];
  runControlLabel?: string | null;
};

const activeStatuses = new Set(["pending", "queued", "claimed", "starting", "running", "stopping", "canceling"]);
const authoritativeCounterSources = new Set(["canonical_persisted_actions_sast_v1"]);

export function shouldApplyCounterProjection(
  current: ProfileCounterProjection | undefined,
  incoming: ProfileCounterProjection | undefined,
) {
  if (!incoming) return !current;
  if (!authoritativeCounterSources.has(incoming.source)) return false;
  if (!current) return true;
  if (incoming.businessTimezone !== current.businessTimezone) return false;
  if (incoming.businessDate !== current.businessDate) return incoming.businessDate > current.businessDate;
  const incomingAt = Date.parse(incoming.computedAt);
  const currentAt = Date.parse(current.computedAt);
  if (!Number.isFinite(incomingAt)) return false;
  return !Number.isFinite(currentAt) || incomingAt >= currentAt;
}

function isActive(patch: ProfilesLivePatch) {
  return activeStatuses.has(String(patch.activeRunRequestStatus || "").toLowerCase())
    || activeStatuses.has(String(patch.activeRunStatus || "").toLowerCase())
    || patch.runtimeIndicator?.state === "active";
}

function isDashboardBlockReason(reason: string) {
  return /operator_review_required|blocking_dashboard_action|scheduler_launch_blocked/.test(reason.toLowerCase());
}

export function mergeProfilesLiveProjection(profiles: BotProfile[], patches: ProfilesLivePatch[]): BotProfile[] {
  const byId = new Map(patches.map((patch) => [patch.accountId, patch]));
  return profiles.map((profile) => {
    const patch = byId.get(profile.id);
    if (!patch) return profile;
    const active = isActive(patch);
    const blocker = patch.currentBlocker?.blockingCampaign ? String(patch.currentBlocker.actionType || "blocking_dashboard_action") : "";
    const staleDashboardBlocker = isDashboardBlockReason(`${profile.eligibilityReason} ${profile.eligibilityDetail.primary_block_reason}`);
    const countersToday = patch.countersToday ?? {};
    const applyCounters = shouldApplyCounterProjection(profile.counterProjection, patch.counterProjection);
    const eligibility = active
      ? profile.eligibility
      : blocker
        ? "blocked_now"
        : staleDashboardBlocker
          ? "can_start"
          : profile.eligibility;
    const eligibilityReason = active
      ? profile.eligibilityReason
      : blocker || (staleDashboardBlocker ? "ready" : profile.eligibilityReason);
    const status: BotProfile["status"] = active
      ? "running"
      : profile.status === "running"
        ? (eligibility === "can_start" ? "ready" : "blocked")
        : profile.status;

    return {
      ...profile,
      status,
      activeRunRequestId: patch.activeRunRequestId ?? null,
      activeRunRequestStatus: patch.activeRunRequestStatus ?? null,
      activeRunId: patch.activeRunId ?? null,
      activeRunStatus: patch.activeRunStatus ?? null,
      runControlPhase: patch.runControlPhase ?? null,
      runControlLabel: patch.runControlLabel ?? null,
      runtimeIndicator: patch.runtimeIndicator ?? profile.runtimeIndicator,
      currentRunCounters: applyCounters ? patch.currentRunCounters ?? profile.currentRunCounters : profile.currentRunCounters,
      counterProjection: applyCounters ? patch.counterProjection ?? profile.counterProjection : profile.counterProjection,
      followerDelta3d: applyCounters ? patch.followerDelta3d ?? profile.followerDelta3d : profile.followerDelta3d,
      interactionsToday: applyCounters && Number.isFinite(patch.interactionsToday) ? Number(patch.interactionsToday) : profile.interactionsToday,
      counters: {
        follow: { ...profile.counters.follow, current: applyCounters ? countersToday.follows ?? profile.counters.follow.current : profile.counters.follow.current },
        unfollow: { ...profile.counters.unfollow, current: applyCounters ? countersToday.unfollows ?? profile.counters.unfollow.current : profile.counters.unfollow.current },
        like: { ...profile.counters.like, current: applyCounters ? countersToday.likes ?? profile.counters.like.current : profile.counters.like.current },
        comment: { ...profile.counters.comment, current: applyCounters ? countersToday.comments ?? profile.counters.comment.current : profile.counters.comment.current },
        dm: { ...profile.counters.dm, current: applyCounters ? countersToday.dms ?? profile.counters.dm.current : profile.counters.dm.current },
      },
      eligibility,
      eligibilityReason,
      eligibilityDetail: {
        ...profile.eligibilityDetail,
        status: eligibility,
        primary_block_reason: eligibilityReason === "ready" ? "" : eligibilityReason,
        reason_label: eligibilityReason === "ready" ? "Ready" : profile.eligibilityDetail.reason_label,
      },
      liveSupportedKinds: patch.liveSupportedKinds ?? ["follow", "unfollow", "like", "dm"],
    };
  });
}

export function mergeGroupedProfiles(
  groups: DeviceProfileGroup[],
  profiles: BotProfile[],
): DeviceProfileGroup[] {
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  return groups.map((group) => ({
    ...group,
    profiles: group.profiles.map((profile) => profilesById.get(profile.id) ?? profile),
  }));
}

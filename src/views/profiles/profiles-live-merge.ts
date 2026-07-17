import type { BotProfile, DeviceProfileGroup, ProfileRunCounters } from "../../api/types";

export type ProfilesLivePatch = {
  accountId: string;
  activeRunRequestId?: string | null;
  activeRunRequestStatus?: string | null;
  activeRunId?: string | null;
  activeRunStatus?: string | null;
  runtimeIndicator?: BotProfile["runtimeIndicator"];
  currentRunCounters?: ProfileRunCounters;
  countersToday?: Partial<Record<"follows" | "unfollows" | "likes" | "comments" | "dms", number>>;
  interactionsToday?: number;
  currentBlocker?: { actionType?: string; status?: string; blockingCampaign?: boolean } | null;
  followerDelta3d?: BotProfile["followerDelta3d"];
  liveSupportedKinds?: Array<"follow" | "unfollow" | "like" | "dm">;
  runControlPhase?: BotProfile["runControlPhase"];
  runControlLabel?: string | null;
};

const activeStatuses = new Set(["pending", "queued", "claimed", "starting", "running", "stopping", "canceling"]);

function isActive(patch: ProfilesLivePatch) {
  return activeStatuses.has(String(patch.activeRunRequestStatus || "").toLowerCase())
    || activeStatuses.has(String(patch.activeRunStatus || "").toLowerCase())
    || patch.runtimeIndicator?.state === "active";
}

function isDashboardBlockReason(reason: string) {
  return /operator_review_required|blocking_dashboard_action|scheduler_launch_blocked/.test(reason.toLowerCase());
}

function isStaleRuntimeReason(reason: string) {
  return /already_running|already_requested|active_run|account_session_running|stop_cleanup_in_progress/.test(reason.toLowerCase());
}

function followerDeltaTimestamp(value: BotProfile["followerDelta3d"]) {
  const timestamp = Date.parse(String(value?.to ?? ""));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function mergeFollowerDelta3d(
  current: BotProfile["followerDelta3d"],
  incoming: BotProfile["followerDelta3d"],
) {
  if (!incoming) return current;
  if (incoming.value === null && current?.value !== null && current?.value !== undefined) return current;
  const currentTimestamp = followerDeltaTimestamp(current);
  const incomingTimestamp = followerDeltaTimestamp(incoming);
  if (currentTimestamp !== null && (incomingTimestamp === null || incomingTimestamp < currentTimestamp)) return current;
  return incoming;
}

export function mergeProfilesLiveProjection(profiles: BotProfile[], patches: ProfilesLivePatch[]): BotProfile[] {
  const byId = new Map(patches.map((patch) => [patch.accountId, patch]));
  return profiles.map((profile) => {
    const patch = byId.get(profile.id);
    if (!patch) return profile;
    const active = isActive(patch);
    const blocker = patch.currentBlocker?.blockingCampaign ? String(patch.currentBlocker.actionType || "blocking_dashboard_action") : "";
    const previousReason = `${profile.eligibilityReason} ${profile.eligibilityDetail.primary_block_reason}`;
    const staleDashboardBlocker = isDashboardBlockReason(previousReason);
    const staleRuntimeReason = !active && isStaleRuntimeReason(previousReason);
    const countersToday = patch.countersToday ?? {};
    const eligibility = active
      ? profile.eligibility
      : blocker
        ? "blocked_now"
        : staleDashboardBlocker || staleRuntimeReason
          ? "can_start"
          : profile.eligibility;
    const eligibilityReason = active
      ? profile.eligibilityReason
      : blocker || (staleDashboardBlocker || staleRuntimeReason ? "ready" : profile.eligibilityReason);
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
      currentRunCounters: patch.currentRunCounters ?? profile.currentRunCounters,
      followerDelta3d: mergeFollowerDelta3d(profile.followerDelta3d, patch.followerDelta3d),
      interactionsToday: Number.isFinite(patch.interactionsToday) ? Number(patch.interactionsToday) : profile.interactionsToday,
      counters: {
        follow: { ...profile.counters.follow, current: countersToday.follows ?? profile.counters.follow.current },
        unfollow: { ...profile.counters.unfollow, current: countersToday.unfollows ?? profile.counters.unfollow.current },
        like: { ...profile.counters.like, current: countersToday.likes ?? profile.counters.like.current },
        comment: { ...profile.counters.comment, current: countersToday.comments ?? profile.counters.comment.current },
        dm: { ...profile.counters.dm, current: countersToday.dms ?? profile.counters.dm.current },
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

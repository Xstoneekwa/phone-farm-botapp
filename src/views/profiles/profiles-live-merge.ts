import type { BotProfile, DeviceProfileGroup, ProfileRunCounters } from "../../api/types";

export type ProfilesLivePatch = {
  accountId: string;
  canonicalProfile?: BotProfile;
  activeRunRequestId?: string | null;
  activeRunRequestStatus?: string | null;
  activeRunId?: string | null;
  activeRunStatus?: string | null;
  runtimeIndicator?: BotProfile["runtimeIndicator"];
  latestBusinessTransition?: BotProfile["latestBusinessTransition"];
  accountRuntimeStatus?: string | null;
  currentRunCounters?: ProfileRunCounters;
  countersToday?: Partial<Record<"follows" | "unfollows" | "likes" | "comments" | "dms", number>>;
  interactionsToday?: number;
  currentBlocker?: { actionType?: string; status?: string; blockingCampaign?: boolean } | null;
  followerDelta3d?: BotProfile["followerDelta3d"];
  liveSupportedKinds?: Array<"follow" | "like" | "dm">;
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

export function mergeProfilesLiveProjection(profiles: BotProfile[], patches: ProfilesLivePatch[]): BotProfile[] {
  const existingById = new Map(profiles.map((profile) => [profile.id, profile]));
  const authoritativePatches = new Map(patches.map((patch) => [patch.accountId, patch]));
  return [...authoritativePatches.values()].flatMap((patch) => {
    const existing = existingById.get(patch.accountId);
    const profile = patch.canonicalProfile
      ? { ...existing, ...patch.canonicalProfile, id: patch.accountId }
      : existing;
    if (!profile) return [];
    const active = isActive(patch);
    const blocker = patch.currentBlocker?.blockingCampaign ? String(patch.currentBlocker.actionType || "blocking_dashboard_action") : "";
    const staleDashboardBlocker = isDashboardBlockReason(`${profile.eligibilityReason} ${profile.eligibilityDetail.primary_block_reason}`);
    const canonicalIdentityReady = profile.identityVerified === true && profile.loginStatus === "connected" && profile.readiness === "ready";
    const countersToday = patch.countersToday ?? {};
    const eligibility = active
      ? profile.eligibility
      : blocker
        ? "blocked_now"
        : staleDashboardBlocker && canonicalIdentityReady
          ? "can_start"
          : profile.eligibility;
    const eligibilityReason = active
      ? profile.eligibilityReason
      : blocker || (staleDashboardBlocker && canonicalIdentityReady ? "ready" : profile.eligibilityReason);
    const status: BotProfile["status"] = active
      ? "running"
      : profile.status === "running"
        ? (eligibility === "can_start" ? "ready" : "blocked")
        : profile.status;

    return [{
      ...profile,
      status,
      activeRunRequestId: patch.activeRunRequestId ?? null,
      activeRunRequestStatus: patch.activeRunRequestStatus ?? null,
      activeRunId: patch.activeRunId ?? null,
      activeRunStatus: patch.activeRunStatus ?? null,
      runControlPhase: patch.runControlPhase ?? null,
      runControlLabel: patch.runControlLabel ?? null,
      runtimeIndicator: patch.runtimeIndicator ?? profile.runtimeIndicator,
      latestBusinessTransition: patch.latestBusinessTransition ?? profile.latestBusinessTransition,
      accountRuntimeStatus: patch.accountRuntimeStatus ?? profile.accountRuntimeStatus,
      currentRunCounters: patch.currentRunCounters ?? profile.currentRunCounters,
      followerDelta3d: patch.followerDelta3d ?? profile.followerDelta3d,
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
      liveSupportedKinds: patch.liveSupportedKinds ?? ["follow", "like", "dm"],
    }];
  });
}

export function mergeGroupedProfiles(
  groups: DeviceProfileGroup[],
  profiles: BotProfile[],
): DeviceProfileGroup[] {
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  return groups.map((group) => ({
    ...group,
    profiles: group.profiles.flatMap((profile) => {
      const authoritative = profilesById.get(profile.id);
      return authoritative ? [authoritative] : [];
    }),
  }));
}

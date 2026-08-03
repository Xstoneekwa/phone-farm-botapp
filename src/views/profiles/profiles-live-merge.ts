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
  liveSupportedKinds?: Array<"follow" | "like" | "dm">;
  runControlPhase?: BotProfile["runControlPhase"];
  runControlLabel?: string | null;
};

export type LiveCounterMergeDecision =
  | "applied"
  | "ignored_stale"
  | "ignored_equal"
  | "ignored_wrong_run"
  | "ignored_missing_fields";

export type LiveCounterMergeObservation = {
  accountId: string;
  decision: LiveCounterMergeDecision;
  previous: ProfileRunCounters | undefined;
  incoming: ProfileRunCounters | undefined;
  next: ProfileRunCounters | undefined;
  expectedRunId: string | null;
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

function counterRevision(counters: ProfileRunCounters | undefined) {
  const revision = Number(counters?.revision);
  return Number.isInteger(revision) && revision >= 0 ? revision : null;
}

function exactPatchRunId(patch: ProfilesLivePatch) {
  return String(patch.activeRunId || patch.runtimeIndicator?.lastRunId || "").trim() || null;
}

export function mergeRevisionedRunCounters(
  current: ProfileRunCounters | undefined,
  incoming: ProfileRunCounters | undefined,
  patch: ProfilesLivePatch,
): { counters: ProfileRunCounters | undefined; decision: LiveCounterMergeDecision } {
  if (!incoming) return { counters: current, decision: "ignored_missing_fields" };
  const incomingRunId = String(incoming.runId || "").trim() || null;
  const currentRunId = String(current?.runId || "").trim() || null;
  const expectedRunId = exactPatchRunId(patch);
  if (expectedRunId && incomingRunId !== expectedRunId) {
    return { counters: current, decision: "ignored_wrong_run" };
  }

  const incomingRevision = counterRevision(incoming);
  const currentRevision = counterRevision(current);
  if (currentRunId && incomingRunId && currentRunId !== incomingRunId) {
    return incomingRevision === null
      ? { counters: current, decision: "ignored_missing_fields" }
      : { counters: incoming, decision: "applied" };
  }
  if (incomingRevision === null) {
    return currentRevision === null
      ? { counters: incoming, decision: "applied" }
      : { counters: current, decision: "ignored_missing_fields" };
  }
  if (currentRevision !== null && incomingRevision < currentRevision) {
    return { counters: current, decision: "ignored_stale" };
  }
  if (currentRevision !== null && incomingRevision === currentRevision) {
    return { counters: current, decision: "ignored_equal" };
  }
  return { counters: incoming, decision: "applied" };
}

export function mergeProfilesLiveProjection(
  profiles: BotProfile[],
  patches: ProfilesLivePatch[],
  observe?: (observation: LiveCounterMergeObservation) => void,
): BotProfile[] {
  const byId = new Map(patches.map((patch) => [patch.accountId, patch]));
  return profiles.map((profile) => {
    const patch = byId.get(profile.id);
    if (!patch) return profile;
    const active = isActive(patch);
    const blocker = patch.currentBlocker?.blockingCampaign ? String(patch.currentBlocker.actionType || "blocking_dashboard_action") : "";
    const staleDashboardBlocker = isDashboardBlockReason(`${profile.eligibilityReason} ${profile.eligibilityDetail.primary_block_reason}`);
    const countersToday = patch.countersToday ?? {};
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
    const counterMerge = mergeRevisionedRunCounters(profile.currentRunCounters, patch.currentRunCounters, patch);
    observe?.({
      accountId: profile.id,
      decision: counterMerge.decision,
      previous: profile.currentRunCounters,
      incoming: patch.currentRunCounters,
      next: counterMerge.counters,
      expectedRunId: exactPatchRunId(patch),
    });

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
      currentRunCounters: counterMerge.counters,
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

import type { ProfileLogEntry, ProfileTarget } from "./types";

export type ProfileDetailsSourceStatus = "connected" | "backend_pending" | "not_available";

export type ProfileDetailsPayload = {
  account?: Record<string, unknown>;
  stats?: { summary?: Record<string, unknown>; runs?: Record<string, unknown>[]; status?: ProfileDetailsSourceStatus; error?: string | null };
  logs?: { items?: Record<string, unknown>[]; status?: ProfileDetailsSourceStatus; error?: string | null };
  targets?: { items?: Record<string, unknown>[]; status?: ProfileDetailsSourceStatus; error?: string | null };
  settings?: { data?: Record<string, unknown>; status?: ProfileDetailsSourceStatus; error?: string | null };
  packageSummary?: { data?: Record<string, unknown>; status?: ProfileDetailsSourceStatus; error?: string | null };
  filters?: { data?: Record<string, unknown>; status?: ProfileDetailsSourceStatus; error?: string | null };
  credentialsSafe?: Record<string, unknown>;
  source?: Record<string, string>;
};

export async function loadProfileDetails(accountId: string) {
  if (window.botappDesktop?.profiles?.details) {
    return window.botappDesktop.profiles.details(accountId);
  }
  return { ok: false as const, error: "Profile details relay unavailable in this runtime." };
}

export function mapApiTargetRow(profileId: string, row: Record<string, unknown>): ProfileTarget {
  const followsSent = typeof row.follows_sent_count === "number" ? row.follows_sent_count : null;
  const followbacks = typeof row.followbacks_count === "number" ? row.followbacks_count : null;
  const followersCount = typeof row.followers_count === "number" ? row.followers_count : null;
  const statusRaw = String(row.status || "unknown");
  const status: ProfileTarget["status"] = statusRaw === "pending_verification" || statusRaw === "valid" || statusRaw === "rejected" || statusRaw === "review" || statusRaw === "duplicate" || statusRaw === "active" || statusRaw === "archived" || statusRaw === "deleted"
    ? statusRaw
    : "review";
  return {
    id: String(row.id || ""),
    accountId: profileId,
    username: String(row.target_username || row.normalized_username || ""),
    canonicalUsername: String(row.normalized_username || row.target_username || "") || null,
    avatarUrl: String(row.avatar_url || row.profile_picture_url || row.profile_image_url || "") || null,
    status,
    verification: status === "pending_verification" ? "pending" : "found",
    verificationReason: String(row.rejection_reason || "") || null,
    eligibility: "unknown",
    followersCount,
    performance: "pending",
    followbackRatio: followsSent && followbacks ? Number((followbacks / followsSent).toFixed(2)) : null,
    followsSent,
    followbacks,
    lastUsedAt: String(row.last_used_at || "") || null,
    lastSelectedAt: String(row.last_selected_at || "") || null,
    addedAt: String(row.updated_at || row.created_at || "") || "",
    source: "backend",
    archivedAt: String(row.archived_at || "") || null,
    deletedAt: String(row.deleted_at || "") || null,
    reason: String(row.rejection_reason || "") || null,
    syncStatus: "synced",
  };
}

export function mapApiLogRow(profileId: string, row: Record<string, unknown>): ProfileLogEntry {
  const levelRaw = String(row.level || "info");
  const level: ProfileLogEntry["level"] = levelRaw === "debug" || levelRaw === "info" || levelRaw === "success" || levelRaw === "warning" || levelRaw === "error"
    ? levelRaw
    : "info";
  const sourceRaw = String(row.source || "dashboard");
  const source: ProfileLogEntry["source"] = sourceRaw === "worker" || sourceRaw === "botapp" || sourceRaw === "dashboard" || sourceRaw === "api" || sourceRaw === "device"
    ? sourceRaw
    : "dashboard";
  const statusRaw = String(row.status || "");
  const actionStatus: ProfileLogEntry["actionStatus"] = statusRaw === "started" || statusRaw === "skipped" || statusRaw === "succeeded" || statusRaw === "failed" || statusRaw === "recovered"
    ? statusRaw
    : undefined;
  const runId = String(row.run_id || "").trim();
  return {
    id: String(row.id || `${profileId}_${String(row.created_at || Date.now())}`),
    accountId: profileId,
    timestamp: String(row.created_at || ""),
    level,
    phase: "api",
    event: String(row.action_type || "activity"),
    message: String(row.message || ""),
    actionStatus,
    source,
    runId: runId || undefined,
  };
}

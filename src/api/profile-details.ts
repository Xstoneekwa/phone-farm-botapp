import type { ProfileLogEntry, ProfileTarget } from "./types";
import { resolveTargetFbrFromApiRow } from "./target-fbr-display";
import { resolveProfileTargetDates } from "./profile-target-dates";

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
  readinessSafe?: Record<string, unknown>;
  source?: Record<string, string>;
};

export async function loadProfileDetails(accountId: string) {
  if (window.botappDesktop?.profiles?.details) {
    return window.botappDesktop.profiles.details(accountId);
  }
  return { ok: false as const, error: "Profile details relay unavailable in this runtime." };
}

function targetVerification(value: unknown): ProfileTarget["verification"] {
  const raw = String(value || "pending");
  return raw === "pending" || raw === "found" || raw === "not_found" || raw === "unavailable" || raw === "rate_limited" || raw === "provider_error"
    ? raw
    : "provider_error";
}

function inferTargetVerification(row: Record<string, unknown>, status: ProfileTarget["status"]): ProfileTarget["verification"] {
  const explicit = String(row.verification_status || "").trim();
  if (explicit) return targetVerification(explicit);
  const quality = String(row.quality_status || "").trim();
  if (quality === "eligible") return "found";
  if (quality === "rejected_not_found") return "not_found";
  if (quality.startsWith("rejected_")) return "found";
  if (quality.startsWith("review_")) return "unavailable";
  if (status === "valid" || status === "active") return "found";
  if (status === "rejected") return "provider_error";
  return "pending";
}

function targetEligibility(value: unknown): ProfileTarget["eligibility"] {
  const raw = String(value || "unknown");
  return raw === "unknown" || raw === "eligible" || raw === "rejected_low_followers" || raw === "rejected_verified" || raw === "rejected_private" || raw === "rejected_not_found" || raw === "review_provider_unavailable" || raw === "review_username_changed"
    ? raw
    : "unknown";
}

function targetPerformance(value: unknown): ProfileTarget["performance"] {
  const raw = String(value || "pending");
  return raw === "good" || raw === "avg" || raw === "bad" || raw === "insufficient_data" || raw === "pending" || raw === "not_applicable"
    ? raw
    : "pending";
}

export function mapApiTargetRow(profileId: string, row: Record<string, unknown>): ProfileTarget {
  const fbr = resolveTargetFbrFromApiRow(row);
  const dates = resolveProfileTargetDates(row);
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
    verification: inferTargetVerification(row, status),
    verificationReason: String(row.verification_reason || row.rejected_reason || row.rejection_reason || row.job_last_error_code || (row.quality_status === "eligible" ? "found" : "") || "") || null,
    eligibility: targetEligibility(row.quality_status),
    followersCount,
    isVerified: typeof row.is_verified === "boolean" ? row.is_verified : null,
    isPrivate: typeof row.is_private === "boolean" ? row.is_private : null,
    providerCheckedAt: String(row.provider_checked_at || "") || null,
    lastVerifiedAt: String(row.last_verified_at || row.provider_checked_at || "") || null,
    jobStatus: String(row.job_status || "") || null,
    jobProviderStatus: String(row.job_provider_status || "") || null,
    jobNextAttemptAt: String(row.job_next_attempt_at || "") || null,
    jobLastErrorCode: String(row.job_last_error_code || "") || null,
    performance: targetPerformance(row.performance_status),
    followbackRatio: fbr.fbrMetricsReliable ? fbr.fbrPercent : null,
    fbrMetricsReliable: fbr.fbrMetricsReliable,
    fbrPercent: fbr.fbrPercent,
    fbrLabel: fbr.fbrLabel,
    followbacksMetricsReliableAt: fbr.followbacksMetricsReliableAt,
    followsSent: fbr.followsSent,
    followbacks: fbr.followbacks,
    lastUsedAt: dates.lastUsedAt,
    lastSelectedAt: String(row.last_selected_at || "") || null,
    addedAt: dates.addedAt,
    source: "backend",
    archivedAt: String(row.archived_at || "") || null,
    deletedAt: String(row.deleted_at || "") || null,
    reason: String(row.rejected_reason || row.rejection_reason || row.verification_reason || row.job_last_error_code || "") || null,
    syncStatus: String(row.job_status || "").includes("pending") || status === "pending_verification" ? "pending" : "synced",
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

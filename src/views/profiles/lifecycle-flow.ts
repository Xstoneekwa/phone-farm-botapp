import type {
  BotProfile,
  ProfileArchivePayload,
  ProfileArchiveState,
  ProfileDeletePayload,
  ProfileDeleteState,
  ProfileLifecycleRetentionPolicy,
  ProfileLifecycleStatus,
} from "../../api/types";

export const ACCOUNT_LIFECYCLE_RETENTION_DAYS = 30;

function addUtcDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

function lifecycleStatus(profile: BotProfile): ProfileLifecycleStatus {
  if (profile.lifecycleStatus) return profile.lifecycleStatus;
  if (profile.status === "trashed") return "trashed";
  if (profile.status === "archived") return "archived";
  return "active";
}

function idempotencyKey(action: "archive" | "trash" | "restore", profile: BotProfile) {
  return `botapp:lifecycle:${action}:${profile.id}:preview`;
}

function hasActiveRunWarning(profile: BotProfile) {
  return profile.status === "running" || profile.runtimeLock !== "none";
}

export function buildLifecycleRetentionPolicy(action: "archive" | "trash", now = new Date()): ProfileLifecycleRetentionPolicy {
  const scheduledAt = addUtcDays(now, ACCOUNT_LIFECYCLE_RETENTION_DAYS).toISOString();
  return {
    retentionDays: ACCOUNT_LIFECYCLE_RETENTION_DAYS,
    archiveToTrashAfterDays: ACCOUNT_LIFECYCLE_RETENTION_DAYS,
    trashToPermanentDeleteAfterDays: ACCOUNT_LIFECYCLE_RETENTION_DAYS,
    restoreUntil: action === "trash" ? scheduledAt : null,
    scheduledTrashAt: action === "archive" ? scheduledAt : null,
    scheduledDeleteAt: action === "trash" ? scheduledAt : null,
    permanentDeleteImplemented: false,
    trashStatus: "trashed",
  };
}

export function buildArchivePayload(profile: BotProfile, now = new Date()): ProfileArchivePayload {
  const retention = buildLifecycleRetentionPolicy("archive", now);
  return {
    account_id: profile.id,
    action: "archive",
    requested_by: null,
    source: "BotApp",
    reason: "operator_archive",
    idempotency_key: idempotencyKey("archive", profile),
    metadata_safe: {
      account_username: profile.username,
      platform: profile.platform,
      current_status: lifecycleStatus(profile),
      device_label: profile.deviceName,
      active_run_warning: hasActiveRunWarning(profile),
      scheduled_trash_at: retention.scheduledTrashAt ?? "",
    },
  };
}

export function buildDeletePayload(profile: BotProfile, now = new Date()): ProfileDeletePayload {
  const retention = buildLifecycleRetentionPolicy("trash", now);
  const deleteAfter = retention.scheduledDeleteAt ?? addUtcDays(now, ACCOUNT_LIFECYCLE_RETENTION_DAYS).toISOString();
  return {
    account_id: profile.id,
    action: "trash",
    requested_by: null,
    source: "BotApp",
    reason: "operator_move_to_trash",
    restore_until: deleteAfter,
    delete_after: deleteAfter,
    idempotency_key: idempotencyKey("trash", profile),
    metadata_safe: {
      account_username: profile.username,
      platform: profile.platform,
      current_status: lifecycleStatus(profile),
      device_label: profile.deviceName,
      active_run_warning: hasActiveRunWarning(profile),
      trash_status: "trashed",
    },
  };
}

export function createArchiveState(profile: BotProfile): ProfileArchiveState {
  const now = new Date();
  return {
    profileId: profile.id,
    lifecycleStatus: lifecycleStatus(profile),
    retentionPolicy: buildLifecycleRetentionPolicy("archive", now),
    payload: buildArchivePayload(profile, now),
    result: "prepared",
  };
}

export function createDeleteState(profile: BotProfile): ProfileDeleteState {
  const now = new Date();
  return {
    profileId: profile.id,
    lifecycleStatus: lifecycleStatus(profile),
    retentionPolicy: buildLifecycleRetentionPolicy("trash", now),
    payload: buildDeletePayload(profile, now),
    result: "prepared",
  };
}

export function lifecycleWarning(profile: BotProfile) {
  if (!hasActiveRunWarning(profile)) return null;
  return "Active runs or requests must be stopped or reconciled by the secure relay before lifecycle changes are finalized.";
}

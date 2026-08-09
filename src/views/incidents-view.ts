/**
 * Pure helpers for the operational Incidents view (P2).
 *
 * The view is observability only: incidents come from the canonical backend
 * read-model (`/api/instagram-dashboard/incidents` through the relay bridge).
 * No click here may create a run, a run request or any scheduling side
 * effect — actions are limited to acknowledge / resolve / keep paused through
 * the audited incident action endpoint.
 */

export const INCIDENTS_REFRESH_INTERVAL_MS = 30_000;

/** Statuses requested from the backend: everything still relevant to ops. */
export const INCIDENTS_LIST_STATUS = "open,acknowledged,resolved";

export type IncidentListFilter = "open" | "action_required" | "resolved" | "all";
export type IncidentLoadErrorKind = "permission" | "invalid_contract" | "backend_unavailable";

export interface IncidentGlobalCounters {
  open: number;
  actionRequired: number;
  resolved: number;
  deliveryDegraded: number;
  total: number;
}

const OPERATOR_REVIEW_RECORDED_STATUSES = new Set(["acknowledged", "resolved", "reviewed"]);
const OPERATOR_REVIEW_MARKABLE_STATUSES = new Set(["pending", "pending_verification", "code_submitted"]);

export function isOperatorReviewRecorded(status: unknown): boolean {
  return OPERATOR_REVIEW_RECORDED_STATUSES.has(str(status).toLowerCase());
}

export function canMarkOperatorReviewed(status: unknown): boolean {
  return OPERATOR_REVIEW_MARKABLE_STATUSES.has(str(status).toLowerCase());
}

export function incidentLoadErrorCopy(kind: IncidentLoadErrorKind | null | undefined) {
  if (kind === "permission") {
    return { title: "Incident access denied", message: "The relay credential is not authorized to read incidents." };
  }
  if (kind === "invalid_contract") {
    return { title: "Incident data contract is invalid", message: "The backend response could not be safely interpreted." };
  }
  return { title: "Incident backend unavailable", message: "The incident service could not be reached. No incident count is shown." };
}

export function normalizeGlobalIncidentCounters(raw: unknown): IncidentGlobalCounters | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const keys = ["open", "actionRequired", "resolved", "deliveryDegraded", "total"] as const;
  const values = keys.map((key) => Number(record[key]));
  if (values.some((value) => !Number.isFinite(value) || value < 0)) return null;
  return {
    open: Math.floor(values[0]),
    actionRequired: Math.floor(values[1]),
    resolved: Math.floor(values[2]),
    deliveryDegraded: Math.floor(values[3]),
    total: Math.floor(values[4]),
  };
}

export function emptyIncidentCopy(filter: IncidentListFilter) {
  if (filter === "open") return { title: "No open incidents", message: "There are no open incidents requiring monitoring." };
  if (filter === "action_required") return { title: "No action required", message: "There are no incidents awaiting operator action." };
  if (filter === "resolved") return { title: "No resolved incidents", message: "No resolved incidents match this search." };
  return { title: "No incidents", message: "No incidents match this search." };
}

export function shouldPollIncidents(activeRoute: string, visibilityState: string) {
  return activeRoute === "incidents" && visibilityState === "visible";
}

export type IncidentBadgeTone = "success" | "warning" | "error" | "info" | "neutral";

export interface IncidentRowView {
  id: string;
  displayState: string;
  severity: string;
  incidentType: string;
  reasonCode: string;
  operatorLabel: string;
  actionRequired: string | null;
  accountId: string | null;
  accountUsername: string | null;
  runId: string | null;
  occurrenceCount: number;
  lastSeenAt: string | null;
  deliveryState: string;
  isTest: boolean;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const LEGACY_ENGLISH_COPY: Record<string, string> = {
  "Échec worker sans raison structurée": "Worker process failure",
  "Échec runtime du run": "Run runtime failure",
  "Le worker s'est terminé en erreur sans raison structurée. Vérifier les logs internes du run.":
    "The worker exited with an error and no structured reason. Review the internal run logs.",
};

function englishCopy(value: unknown) {
  const text = str(value);
  return LEGACY_ENGLISH_COPY[text] || text;
}

/** Normalize one raw incident record from the IPC bridge into a view row. */
export function normalizeIncidentRow(raw: Record<string, unknown>): IncidentRowView | null {
  const id = str(raw.id);
  if (!id) return null;
  const incidentType = str(raw.incidentType) || str(raw.incident_type) || "unknown_incident";
  const status = (str(raw.status) || "open").toLowerCase();
  const actionRequired = englishCopy(raw.actionRequired) || englishCopy(raw.action_required) || "";
  // Canonical incident status wins over any stale action-derived display state.
  // Historical dashboard actions must never resurrect a resolved incident.
  const displayState = status === "resolved" || status === "ignored"
    ? status
    : str(raw.displayState) || (status === "open" && actionRequired ? "action_required" : status);
  const occurrenceRaw = Number(raw.occurrenceCount ?? raw.occurrence_count);
  return {
    id,
    displayState,
    severity: (str(raw.severity) || "warning").toLowerCase(),
    incidentType,
    reasonCode: str(raw.reasonCode) || str(raw.reason) || incidentType,
    operatorLabel: englishCopy(raw.operatorLabel) || incidentType,
    actionRequired: actionRequired || null,
    accountId: str(raw.accountId) || str(raw.account_id) || null,
    accountUsername: str(raw.accountUsername) || str(raw.account_username) || null,
    runId: str(raw.runId) || str(raw.run_id) || null,
    occurrenceCount: Number.isFinite(occurrenceRaw) && occurrenceRaw > 0 ? Math.floor(occurrenceRaw) : 1,
    lastSeenAt: str(raw.lastSeenAt) || str(raw.last_seen_at) || null,
    deliveryState: (str(raw.deliveryState) || "none").toLowerCase(),
    isTest: raw.isTest === true || raw.is_test === true,
  };
}

export function normalizeIncidentList(rows: Array<Record<string, unknown>> | undefined | null): IncidentRowView[] {
  if (!Array.isArray(rows)) return [];
  const out: IncidentRowView[] = [];
  for (const row of rows) {
    const normalized = normalizeIncidentRow(row ?? {});
    if (normalized) out.push(normalized);
  }
  return out;
}

export interface IncidentViewCounters {
  open: number;
  actionRequired: number;
  resolved: number;
  deliveryDegraded: number;
  total: number;
}

/** Operational counters. Test incidents never inflate operational numbers. */
export function countIncidents(rows: IncidentRowView[]): IncidentViewCounters {
  const operational = rows.filter((row) => !row.isTest);
  return {
    open: operational.filter((row) =>
      row.displayState === "open"
      || row.displayState === "reviewed"
      || row.displayState === "acknowledged"
      || row.displayState === "ready_to_resume"
      || row.displayState === "resume_requested").length,
    actionRequired: operational.filter((row) =>
      row.displayState === "action_required"
      || row.displayState === "reintervention_required").length,
    resolved: operational.filter((row) => row.displayState === "resolved" || row.displayState === "ignored").length,
    deliveryDegraded: operational.filter((row) => row.deliveryState === "delivery_degraded").length,
    total: operational.length,
  };
}

export const INCIDENT_STATE_COPY: Record<string, { label: string; tone: IncidentBadgeTone }> = {
  open: { label: "Open", tone: "warning" },
  action_required: { label: "Action required", tone: "error" },
  reviewed: { label: "Reviewed", tone: "success" },
  acknowledged: { label: "Acknowledged", tone: "info" },
  resolved: { label: "Resolved", tone: "success" },
  ignored: { label: "Ignored", tone: "neutral" },
  // P3 recovery display states. "Ready to resume" is reserved for the BUTTON;
  // the armed state reads unambiguously.
  ready_to_resume: { label: "Resume authorized — awaiting next tick", tone: "info" },
  resume_requested: { label: "Resume requested", tone: "info" },
  reintervention_required: { label: "New intervention required", tone: "error" },
  resume_authorization_expired: { label: "Recovery window expired", tone: "error" },
};

/** P3.2 English operator copy for recovery reasons (stable backend codes). */
export const RECOVERY_REASON_COPY: Record<string, string> = {
  awaiting_next_scheduler_tick: "Authorization armed — awaiting the next Auto Restart tick.",
  resume_window_closed: "Recovery window closed — no resume can be armed.",
  resume_authorization_expired: "Recovery window expired — the resume authorization expired.",
  resume_authorization_already_armed: "A resume authorization is already armed.",
  resume_retry_window_exhausted: "Resume budget already consumed for this window.",
  resume_plan_missing: "No resume plan for this run (pre-P3 run).",
  resume_plan_not_recoverable: "Incident not automatically recoverable — resolve manually.",
  incident_not_active: "Incident already resolved or ignored.",
  recovery_state_unavailable: "Recovery state unavailable right now.",
};

export const AUTHORIZATION_STATUS_COPY: Record<string, string> = {
  armed: "Armed — awaiting next tick",
  consumed: "Authorization consumed",
  expired: "Recovery window expired",
};

export type RecoveryLike = {
  state?: string;
  eligible?: boolean;
  reason?: string | null;
  authorizationStatus?: string | null;
} | null | undefined;

export function isRecoveryFlow(recovery: RecoveryLike): boolean {
  const state = str(recovery?.state);
  return Boolean(state && state !== "none");
}

/** Armed or resume already in flight: hide ambiguous generic actions. */
export function isArmedOrPendingRecovery(recovery: RecoveryLike): boolean {
  if (!isRecoveryFlow(recovery)) return false;
  const auth = str(recovery?.authorizationStatus);
  const state = str(recovery?.state);
  if (auth === "armed" || auth === "consumed") return true;
  if (state === "ready_to_resume" && recovery?.eligible !== true) return true;
  if (state === "resume_requested") return true;
  return false;
}

export function shouldShowReadyToResume(recovery: RecoveryLike): boolean {
  return recovery?.eligible === true;
}

export function shouldShowGenericIncidentActions(recovery: RecoveryLike): boolean {
  return !isRecoveryFlow(recovery);
}

export function shouldShowAcknowledge(recovery: RecoveryLike, canAcknowledge: boolean): boolean {
  return canAcknowledge && shouldShowGenericIncidentActions(recovery);
}

export function shouldShowKeepPaused(recovery: RecoveryLike): boolean {
  return shouldShowGenericIncidentActions(recovery);
}

export function shouldShowResolve(recovery: RecoveryLike, canResolve: boolean): boolean {
  if (!canResolve) return false;
  if (shouldShowGenericIncidentActions(recovery)) return true;
  if (isArmedOrPendingRecovery(recovery)) return false;
  if (shouldShowReadyToResume(recovery)) return false;
  return isRecoveryFlow(recovery);
}

export function resolveButtonLabel(recovery: RecoveryLike): string {
  if (isRecoveryFlow(recovery) && !shouldShowGenericIncidentActions(recovery)) {
    return "Resolve without resuming";
  }
  return "Resolve after verification";
}

export function authorizationStatusCopy(status: string | null | undefined): string | null {
  const key = str(status);
  if (!key) return null;
  return AUTHORIZATION_STATUS_COPY[key] ?? key;
}

export function recoveryReasonCopy(reason: string | null | undefined): string | null {
  const code = str(reason);
  if (!code) return null;
  return RECOVERY_REASON_COPY[code] ?? code;
}

export function incidentStateCopy(displayState: string): { label: string; tone: IncidentBadgeTone } {
  return INCIDENT_STATE_COPY[displayState] ?? { label: displayState || "unknown", tone: "neutral" };
}

export function severityTone(severity: string): IncidentBadgeTone {
  if (severity === "critical" || severity === "error") return "error";
  if (severity === "warning") return "warning";
  return "neutral";
}

export const INCIDENT_DELIVERY_COPY: Record<string, { label: string; tone: IncidentBadgeTone }> = {
  delivered: { label: "Slack/Discord delivered", tone: "success" },
  pending: { label: "Delivery pending", tone: "info" },
  delivery_degraded: { label: "Delivery degraded", tone: "error" },
  none: { label: "No notification", tone: "neutral" },
};

export function deliveryCopy(deliveryState: string): { label: string; tone: IncidentBadgeTone } {
  return INCIDENT_DELIVERY_COPY[deliveryState] ?? { label: deliveryState || "unknown", tone: "neutral" };
}

export function formatIncidentTimestamp(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

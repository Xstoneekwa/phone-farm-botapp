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

/** Normalize one raw incident record from the IPC bridge into a view row. */
export function normalizeIncidentRow(raw: Record<string, unknown>): IncidentRowView | null {
  const id = str(raw.id);
  if (!id) return null;
  const incidentType = str(raw.incidentType) || str(raw.incident_type) || "unknown_incident";
  const status = (str(raw.status) || "open").toLowerCase();
  const actionRequired = str(raw.actionRequired) || str(raw.action_required) || "";
  const displayState = str(raw.displayState)
    || (status === "open" && actionRequired ? "action_required" : status);
  const occurrenceRaw = Number(raw.occurrenceCount ?? raw.occurrence_count);
  return {
    id,
    displayState,
    severity: (str(raw.severity) || "warning").toLowerCase(),
    incidentType,
    reasonCode: str(raw.reasonCode) || str(raw.reason) || incidentType,
    operatorLabel: str(raw.operatorLabel) || incidentType,
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
  deliveryDegraded: number;
  total: number;
}

/** Operational counters. Test incidents never inflate operational numbers. */
export function countIncidents(rows: IncidentRowView[]): IncidentViewCounters {
  const operational = rows.filter((row) => !row.isTest);
  return {
    open: operational.filter((row) =>
      row.displayState === "open"
      || row.displayState === "acknowledged"
      || row.displayState === "ready_to_resume"
      || row.displayState === "resume_requested").length,
    actionRequired: operational.filter((row) =>
      row.displayState === "action_required"
      || row.displayState === "reintervention_required").length,
    deliveryDegraded: operational.filter((row) => row.deliveryState === "delivery_degraded").length,
    total: operational.length,
  };
}

export const INCIDENT_STATE_COPY: Record<string, { label: string; tone: IncidentBadgeTone }> = {
  open: { label: "Open", tone: "warning" },
  action_required: { label: "Action requise", tone: "error" },
  acknowledged: { label: "Acknowledged", tone: "info" },
  resolved: { label: "Résolu", tone: "success" },
  ignored: { label: "Ignored", tone: "neutral" },
  // P3 recovery display states (human-confirmed resume workflow).
  ready_to_resume: { label: "Prêt à relancer", tone: "info" },
  resume_requested: { label: "Reprise demandée", tone: "info" },
  reintervention_required: { label: "Nouvelle intervention requise", tone: "error" },
};

/**
 * Safe operator copy for recovery reasons (stable codes from the backend).
 * The "Prêt à relancer" button itself never creates a run: it arms one
 * durable authorization consumed only by the Auto Restart tick.
 */
export const RECOVERY_REASON_COPY: Record<string, string> = {
  awaiting_next_scheduler_tick: "Autorisation armée — en attente du prochain tick Auto Restart.",
  resume_window_closed: "Fenêtre de session fermée — aucune reprise armable.",
  resume_authorization_expired: "Fenêtre expirée — l'autorisation de reprise a expiré.",
  resume_authorization_already_armed: "Une autorisation de reprise est déjà armée.",
  resume_retry_window_exhausted: "Budget de reprise déjà consommé pour cette fenêtre.",
  resume_plan_missing: "Aucun resume plan pour ce run (run antérieur à P3).",
  resume_plan_not_recoverable: "Incident non récupérable automatiquement — résolution simple.",
  incident_not_active: "Incident déjà résolu ou ignoré.",
  recovery_state_unavailable: "État recovery indisponible pour le moment.",
};

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

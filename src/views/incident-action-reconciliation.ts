import type { IncidentDetail } from "./incident-detail-contract";

export type IncidentActionResult = {
  ok?: boolean;
  status?: number;
  data?: Record<string, unknown>;
  error?: string;
  code?: string;
  reason?: string;
};

function incidentField(detail: IncidentDetail, ...keys: string[]): string {
  for (const key of keys) {
    const value = detail.incident[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function incidentActionErrorMessage(result: IncidentActionResult | undefined): string {
  if (result?.reason?.startsWith("corrected_worker_runtime_")) {
    return `Resolve is blocked because the corrected Worker runtime identity is not certified (${result.reason}).`;
  }
  if (result?.status === 409 && result?.code === "INCIDENT_ACTION_CONFLICT") {
    return "Incident changed again during reconciliation. No action was applied; review the refreshed detail.";
  }
  if (result?.status === 409) return result.error || "Incident action is blocked by a material conflict.";
  if (result?.status === 401) return "Relay authentication failed.";
  if (result?.status === 403) return "Incident action is forbidden.";
  return result?.error || "Incident action failed.";
}

export function isIncidentVersionConflict(result: IncidentActionResult | undefined): boolean {
  return result?.status === 409 && result?.code === "INCIDENT_ACTION_CONFLICT";
}

export function classifyResolveConflict(
  previous: IncidentDetail,
  refreshed: IncidentDetail,
): "retry_once" | "already_resolved" | "material_conflict" {
  const refreshedStatus = String(refreshed.incident.status || "").toLowerCase();
  if (refreshedStatus === "resolved") return "already_resolved";

  const sameIdentity = previous.incident.id === refreshed.incident.id
    && incidentField(previous, "accountId", "account_id") === incidentField(refreshed, "accountId", "account_id")
    && previous.incident.accountUsername === refreshed.incident.accountUsername
    && previous.incident.reason === refreshed.incident.reason
    && previous.incident.severity === refreshed.incident.severity;
  const versionAdvanced = refreshed.incident.version > previous.incident.version;
  const statusAllowsResolve = refreshedStatus === "open" || refreshedStatus === "acknowledged";
  if (sameIdentity && versionAdvanced && statusAllowsResolve && refreshed.lifecycle.resolveSupported) {
    return "retry_once";
  }
  return "material_conflict";
}

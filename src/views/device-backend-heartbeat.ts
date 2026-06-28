import type { Device } from "../api/types";

/** Same threshold as lib/instagram-dashboard/assignment-live-capacity.ts */
export const ASSIGNMENT_HEARTBEAT_STALE_MS = 15 * 60 * 1000;

export type BackendHeartbeatLabel = "active" | "expired" | "pending" | "unknown";

export type BackendAssignmentConsequence =
  | "ready_for_assignment"
  | "not_available_for_assignment"
  | "verification_in_progress"
  | "backend_unavailable";

export type BackendHeartbeatProjection = {
  label: BackendHeartbeatLabel;
  labelFr: string;
  relativeFr: string;
  preciseAt: string;
  consequence: BackendAssignmentConsequence;
  consequenceFr: string;
  assignable: boolean;
  explanationFr: string | null;
};

function readDbHeartbeatStatus(device: Device) {
  return String(device.backendHeartbeatDbStatus || device.heartbeatStatus || "").trim().toLowerCase();
}

export function isAssignmentHeartbeatLive(
  dbStatus: string,
  lastSeenAt: string | null | undefined,
  now = new Date(),
) {
  if (dbStatus !== "online") return false;
  const normalized = String(lastSeenAt || "").trim();
  if (!normalized) return false;
  const lastSeenMs = Date.parse(normalized);
  if (!Number.isFinite(lastSeenMs)) return false;
  return now.getTime() - lastSeenMs <= ASSIGNMENT_HEARTBEAT_STALE_MS;
}

export function formatRelativeTimeFr(lastSeenAt: string, now = new Date()) {
  const lastSeenMs = Date.parse(lastSeenAt);
  if (!Number.isFinite(lastSeenMs)) return "";
  const elapsedMs = Math.max(0, now.getTime() - lastSeenMs);
  const seconds = Math.floor(elapsedMs / 1000);
  if (seconds < 60) return `il y a ${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} j`;
}

export function projectBackendHeartbeat(
  device: Device,
  options: { pending?: boolean; now?: Date } = {},
): BackendHeartbeatProjection | null {
  if (device.deviceKind !== "physical_phone") return null;

  const now = options.now ?? new Date();
  const lastSeenAt = String(device.backendLastSeenAt || "").trim();
  const dbStatus = readDbHeartbeatStatus(device);
  const preciseAt = lastSeenAt ? new Date(lastSeenAt).toLocaleString("fr-FR") : "";
  const relativeFr = lastSeenAt ? formatRelativeTimeFr(lastSeenAt, now) : "";

  if (options.pending) {
    return {
      label: "pending",
      labelFr: "En attente",
      relativeFr,
      preciseAt,
      consequence: "verification_in_progress",
      consequenceFr: "Vérification en cours",
      assignable: false,
      explanationFr: null,
    };
  }

  if (!lastSeenAt && (dbStatus === "unknown" || !dbStatus)) {
    return {
      label: "unknown",
      labelFr: "Inconnu",
      relativeFr: "",
      preciseAt: "",
      consequence: "backend_unavailable",
      consequenceFr: "État backend indisponible",
      assignable: false,
      explanationFr: null,
    };
  }

  const assignable = isAssignmentHeartbeatLive(dbStatus, lastSeenAt, now);

  if (assignable) {
    return {
      label: "active",
      labelFr: "Actif",
      relativeFr,
      preciseAt,
      consequence: "ready_for_assignment",
      consequenceFr: "Prêt pour une nouvelle assignation",
      assignable: true,
      explanationFr: null,
    };
  }

  const adbConnected = device.localAdbStatus === "device";
  const explanationFr = adbConnected
    ? "Le téléphone est connecté à ce Mac, mais il ne communique pas actuellement avec le service d'assignation. Relancez les heartbeats avant d'ajouter un nouveau compte client."
    : lastSeenAt
      ? "Le service d'assignation ne reçoit pas de signal récent pour ce téléphone."
      : null;

  return {
    label: "expired",
    labelFr: "Expiré",
    relativeFr,
    preciseAt,
    consequence: "not_available_for_assignment",
    consequenceFr: "Non disponible pour une nouvelle assignation",
    assignable: false,
    explanationFr,
  };
}

export type BackendHeartbeatSummary = {
  active: number;
  expired: number;
  unknown: number;
  totalPhysical: number;
  globalReady: boolean;
  globalLabelFr: string;
};

export function summarizeBackendHeartbeats(devices: Device[], now = new Date()): BackendHeartbeatSummary {
  const physical = devices.filter((device) => device.deviceKind === "physical_phone");
  let active = 0;
  let expired = 0;
  let unknown = 0;

  for (const device of physical) {
    const projection = projectBackendHeartbeat(device, { now });
    if (!projection || projection.label === "unknown") unknown += 1;
    else if (projection.label === "active") active += 1;
    else expired += 1;
  }

  const globalReady = physical.length > 0 && expired === 0 && unknown === 0 && active === physical.length;
  return {
    active,
    expired,
    unknown,
    totalPhysical: physical.length,
    globalReady,
    globalLabelFr: globalReady
      ? "Prêt pour les nouvelles assignations"
      : "Assignations bloquées : heartbeat requis",
  };
}

export function buildHeartbeatDiagnostic(devices: Device[], publisherResult: Record<string, unknown> | null) {
  const physical = devices.filter((device) => device.deviceKind === "physical_phone");
  const summary = summarizeBackendHeartbeats(devices);
  return {
    generated_at: new Date().toISOString(),
    physical_phone_count: physical.length,
    adb_connected_count: physical.filter((device) => device.localAdbStatus === "device").length,
    backend_summary: summary,
    devices: physical.map((device) => {
      const projection = projectBackendHeartbeat(device);
      return {
        label: device.name,
        adb: device.localAdbStatus || "unknown",
        backend_heartbeat: projection?.labelFr || "Inconnu",
        last_seen_relative: projection?.relativeFr || "",
        assignable: projection?.assignable === true,
      };
    }),
    publisher: publisherResult
      ? {
          ok: publisherResult.ok === true,
          stage: String(publisherResult.stage || ""),
          published_count: Number(publisherResult.published_count ?? publisherResult.publishedCount ?? 0),
          skipped_count: Number(publisherResult.skipped_count ?? publisherResult.skippedCount ?? 0),
          error: publisherResult.error ? String(publisherResult.error) : null,
        }
      : null,
  };
}

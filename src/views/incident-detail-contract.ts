export type IncidentNotification = {
  id: string;
  channel: "slack" | "discord" | string;
  status: string;
  attemptCount: number;
  lastAttemptAt: string | null;
  deliveredAt: string | null;
  lastError: string | null;
};

export type IncidentDetail = {
  contractVersion: string;
  incident: Record<string, unknown> & {
    id: string;
    status: string;
    displayState: string;
    severity: string;
    reason: string;
    version: number;
    accountUsername: string | null;
    operatorReviewStatus: "pending" | "reviewed" | "none";
  };
  linked: Record<string, unknown>;
  recovery?: Record<string, unknown> | null;
  operatorReviewAction: { id: string; accountId: string; status: string; blockingCampaign: boolean } | null;
  timeline: Array<{ id?: string; actionType: string; message: string; actorType?: string; actorId?: string | null; createdAt: string | null }>;
  notifications: IncidentNotification[];
  notificationChannels: {
    slack: { channel: "slack"; current: IncidentNotification | null; history: IncidentNotification[] };
    discord: { channel: "discord"; current: IncidentNotification | null; history: IncidentNotification[] };
  };
  lifecycle: {
    acknowledgeSupported: boolean;
    investigatingStateSupported: boolean;
    resolveSupported: boolean;
    reopenSupported: boolean;
    addNoteSupported: boolean;
    retryFailedNotificationSupported: boolean;
  };
  retention: Record<string, unknown>;
};

type Row = Record<string, unknown>;

function row(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function nullableString(value: unknown): string | null {
  return stringValue(value) || null;
}

function numberValue(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function notification(value: unknown): IncidentNotification | null {
  const input = row(value);
  const id = stringValue(input.id);
  const channel = stringValue(input.channel).toLowerCase();
  if (!id || !channel) return null;
  return {
    id,
    channel,
    status: stringValue(input.status, "unknown").toLowerCase(),
    attemptCount: Math.max(0, numberValue(input.attemptCount ?? input.attempt_count, 0)),
    lastAttemptAt: nullableString(input.lastAttemptAt ?? input.last_attempt_at),
    deliveredAt: nullableString(input.deliveredAt ?? input.delivered_at),
    lastError: nullableString(input.lastError ?? input.last_error),
  };
}

function notificationChannel<C extends "slack" | "discord">(channel: C, input: Row, all: IncidentNotification[]): { channel: C; current: IncidentNotification | null; history: IncidentNotification[] } {
  const source = row(input[channel]);
  const historySource = Array.isArray(source.history) ? source.history : all.filter((item) => item.channel === channel);
  const history = historySource.map(notification).filter((item): item is IncidentNotification => Boolean(item));
  return {
    channel,
    current: notification(source.current) ?? history[0] ?? null,
    history,
  };
}

export function parseIncidentDetail(value: unknown): { ok: true; data: IncidentDetail } | { ok: false; error: string } {
  const root = row(value);
  const incident = row(root.incident ?? root.detail);
  const id = stringValue(incident.id ?? root.id);
  if (!id) return { ok: false, error: "Detail contract invalid: incident id is missing." };
  const contractVersion = stringValue(root.contractVersion ?? root.contract_version, "incident_detail_legacy");
  if (contractVersion !== "incident_detail_v1" && contractVersion !== "incident_detail_legacy") {
    return { ok: false, error: `Detail contract invalid: unsupported version ${contractVersion}.` };
  }

  const status = stringValue(incident.status, "open").toLowerCase();
  const notifications = (Array.isArray(root.notifications) ? root.notifications : [])
    .map(notification)
    .filter((item): item is IncidentNotification => Boolean(item));
  const channels = row(root.notificationChannels ?? root.notification_channels);
  const lifecycleInput = row(root.lifecycle);
  const actionSource = root.actionHistory ?? root.action_history;
  const actions: unknown[] = Array.isArray(actionSource) ? actionSource : [];
  const timelineSource: unknown[] = Array.isArray(root.timeline) ? root.timeline : actions;
  const operatorActionInput = row(root.operatorReviewAction ?? root.operator_review_action);
  const operatorActionId = stringValue(operatorActionInput.id);
  const accountId = stringValue(operatorActionInput.accountId ?? operatorActionInput.account_id ?? incident.accountId ?? incident.account_id);

  return {
    ok: true,
    data: {
      contractVersion,
      incident: {
        ...incident,
        id,
        status,
        displayState: stringValue(incident.displayState ?? incident.display_state, status),
        severity: stringValue(incident.severity, "warning").toLowerCase(),
        reason: stringValue(incident.reason ?? incident.reasonCode ?? incident.reason_code ?? incident.failure_reason, "unknown_incident"),
        version: Math.max(1, numberValue(incident.version ?? incident.lifecycle_version, 1)),
        accountUsername: nullableString(incident.accountUsername ?? incident.account_username),
        operatorReviewStatus: stringValue(incident.operatorReviewStatus ?? incident.operator_review_status, "none") as "pending" | "reviewed" | "none",
      },
      linked: row(root.linked),
      recovery: Object.keys(row(root.recovery)).length ? row(root.recovery) : null,
      operatorReviewAction: operatorActionId && accountId ? {
        id: operatorActionId,
        accountId,
        status: stringValue(operatorActionInput.status, "pending"),
        blockingCampaign: Boolean(operatorActionInput.blockingCampaign ?? operatorActionInput.blocking_campaign),
      } : null,
      timeline: timelineSource.map((value: unknown) => {
        const item = row(value);
        return {
          id: nullableString(item.id) ?? undefined,
          actionType: stringValue(item.actionType ?? item.action_type ?? item.eventType ?? item.event_type, "event"),
          message: stringValue(item.message ?? item.resolutionReason ?? item.resolution_reason, "Incident event recorded"),
          actorType: nullableString(item.actorType ?? item.actor_type) ?? undefined,
          actorId: nullableString(item.actorId ?? item.actor_id),
          createdAt: nullableString(item.createdAt ?? item.created_at),
        };
      }),
      notifications,
      notificationChannels: {
        slack: notificationChannel("slack", channels, notifications),
        discord: notificationChannel("discord", channels, notifications),
      },
      lifecycle: {
        acknowledgeSupported: lifecycleInput.acknowledgeSupported === undefined ? status === "open" : Boolean(lifecycleInput.acknowledgeSupported),
        investigatingStateSupported: Boolean(lifecycleInput.investigatingStateSupported),
        resolveSupported: lifecycleInput.resolveSupported === undefined ? status === "open" || status === "acknowledged" : Boolean(lifecycleInput.resolveSupported),
        reopenSupported: Boolean(lifecycleInput.reopenSupported),
        addNoteSupported: lifecycleInput.addNoteSupported === undefined ? true : Boolean(lifecycleInput.addNoteSupported),
        retryFailedNotificationSupported: lifecycleInput.retryFailedNotificationSupported === undefined ? true : Boolean(lifecycleInput.retryFailedNotificationSupported),
      },
      retention: row(root.retention),
    },
  };
}

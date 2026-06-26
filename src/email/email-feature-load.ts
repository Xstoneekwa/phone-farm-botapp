import type { BotAppEmailHistoryProjection, BotAppEmailTemplatesProjection } from "../api/types";

export type EmailRelayResult<T> = {
  ok?: boolean;
  data?: T | null;
  error?: string | null;
};

export type EmailFeatureLoadState<T> =
  | { status: "ready"; projection: T }
  | { status: "infrastructure_pending"; projection: T | null; message: string }
  | { status: "relay_error"; message: string }
  | { status: "relay_unavailable"; message: string };

function isTemplatesProjection(value: unknown): value is BotAppEmailTemplatesProjection {
  if (!value || typeof value !== "object") return false;
  const row = value as BotAppEmailTemplatesProjection;
  return typeof row.featureAvailable === "boolean" && Array.isArray(row.templates);
}

function isHistoryProjection(value: unknown): value is BotAppEmailHistoryProjection {
  if (!value || typeof value !== "object") return false;
  const row = value as BotAppEmailHistoryProjection;
  return typeof row.featureAvailable === "boolean" && Array.isArray(row.items);
}

export function resolveEmailTemplatesLoad(
  result: EmailRelayResult<BotAppEmailTemplatesProjection> | null | undefined,
): EmailFeatureLoadState<BotAppEmailTemplatesProjection> {
  if (!result) {
    return {
      status: "relay_unavailable",
      message: "BotApp email relay is unavailable. Configure the secure relay and refresh.",
    };
  }

  if (!result.ok || !isTemplatesProjection(result.data)) {
    return {
      status: "relay_error",
      message: result.error?.trim() || "Email templates could not be loaded from relay.",
    };
  }

  if (!result.data.featureAvailable) {
    return {
      status: "infrastructure_pending",
      projection: result.data,
      message: "Email infrastructure not enabled yet.",
    };
  }

  return { status: "ready", projection: result.data };
}

export function resolveEmailHistoryLoad(
  result: EmailRelayResult<BotAppEmailHistoryProjection> | null | undefined,
): EmailFeatureLoadState<BotAppEmailHistoryProjection> {
  if (!result) {
    return {
      status: "relay_unavailable",
      message: "BotApp email relay is unavailable. Configure the secure relay and refresh.",
    };
  }

  if (!result.ok || !isHistoryProjection(result.data)) {
    return {
      status: "relay_error",
      message: result.error?.trim() || "Email history could not be loaded from relay.",
    };
  }

  if (!result.data.featureAvailable) {
    return {
      status: "infrastructure_pending",
      projection: result.data,
      message: "Email infrastructure not enabled yet.",
    };
  }

  return { status: "ready", projection: result.data };
}

export function canEditEmailTemplates(state: EmailFeatureLoadState<BotAppEmailTemplatesProjection>) {
  return state.status === "ready";
}

export function canBrowseEmailHistory(state: EmailFeatureLoadState<BotAppEmailHistoryProjection>) {
  return state.status === "ready";
}

export function readEmailFeatureProjection<T>(
  state: EmailFeatureLoadState<T>,
  fallback: () => T,
): T {
  if (state.status === "ready") return state.projection;
  if (state.status === "infrastructure_pending" && state.projection) return state.projection;
  return fallback();
}

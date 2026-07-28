"use strict";
/* global module */

const RELAY_READ_TIMEOUT_MS = 8_000;

function relayErrorKindForStatus(status) {
  if (status === 401 || status === 403) return "auth_failed";
  if (status >= 500) return "backend_unavailable";
  if (status >= 400) return "request_rejected";
  return "network_unavailable";
}

function relayReadError(kind, message, status = 0) {
  const error = new Error(String(message || "Relay read failed."));
  error.relayKind = String(kind || "network_unavailable");
  error.status = Number(status || 0);
  return error;
}

function normalizeRelayReadError(error, fallback = "Live backend temporarily unavailable.") {
  if (error && typeof error === "object" && typeof error.relayKind === "string") {
    return {
      kind: error.relayKind,
      status: Number(error.status || 0),
      message: error.message || fallback,
    };
  }
  const name = String(error?.name || "");
  const raw = String(error?.message || "");
  if (name === "TimeoutError" || name === "AbortError" || /timed?\s*out|timeout/i.test(raw)) {
    return { kind: "timeout", status: 0, message: "Live backend request timed out." };
  }
  if (/json|payload|unexpected token/i.test(raw)) {
    return { kind: "payload_malformed", status: 0, message: "Live backend returned an invalid payload." };
  }
  return { kind: "network_unavailable", status: 0, message: fallback };
}

function relayReadRetryable(kind) {
  return ["timeout", "network_unavailable", "backend_unavailable"].includes(String(kind || ""));
}

module.exports = {
  RELAY_READ_TIMEOUT_MS,
  normalizeRelayReadError,
  relayErrorKindForStatus,
  relayReadError,
  relayReadRetryable,
};

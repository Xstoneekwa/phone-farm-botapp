export type ProfilesRelayErrorKind =
  | "timeout"
  | "network_unavailable"
  | "backend_unavailable"
  | "auth_failed"
  | "request_rejected"
  | "payload_malformed"
  | "unknown";

export type ProfilesFreshness = {
  state: "unknown" | "fresh" | "stale";
  lastSuccessfulAt: string | null;
  lastFailureAt: string | null;
  errorKind: ProfilesRelayErrorKind | null;
};

export const initialProfilesFreshness: ProfilesFreshness = {
  state: "unknown",
  lastSuccessfulAt: null,
  lastFailureAt: null,
  errorKind: null,
};

export function markProfilesFresh(
  previous: ProfilesFreshness,
  observedAt: string,
): ProfilesFreshness {
  return {
    ...previous,
    state: "fresh",
    lastSuccessfulAt: observedAt,
    lastFailureAt: null,
    errorKind: null,
  };
}

export function markProfilesStale(
  previous: ProfilesFreshness,
  failedAt: string,
  errorKind: ProfilesRelayErrorKind | null | undefined,
): ProfilesFreshness {
  return {
    ...previous,
    state: "stale",
    lastFailureAt: failedAt,
    errorKind: errorKind || "unknown",
  };
}

export function profilesMutationsDisabled(freshness: ProfilesFreshness) {
  return freshness.state !== "fresh";
}

export function profilesRelayErrorLabel(kind: ProfilesRelayErrorKind | null) {
  if (kind === "auth_failed") return "Relay authentication failed";
  if (kind === "timeout") return "Live backend request timed out";
  if (kind === "backend_unavailable") return "Live backend temporarily unavailable";
  if (kind === "payload_malformed") return "Live backend payload invalid";
  if (kind === "request_rejected") return "Live backend request rejected";
  return "Live backend temporarily unavailable";
}

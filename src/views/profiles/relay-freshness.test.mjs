import assert from "node:assert/strict";
import test from "node:test";
import {
  initialProfilesFreshness,
  markProfilesFresh,
  markProfilesStale,
  profilesMutationsDisabled,
  profilesRelayErrorLabel,
} from "./relay-freshness.ts";

test("a successful projection records freshness and enables mutations", () => {
  const fresh = markProfilesFresh(initialProfilesFreshness, "2026-07-28T20:00:00.000Z");
  assert.equal(fresh.state, "fresh");
  assert.equal(fresh.lastSuccessfulAt, "2026-07-28T20:00:00.000Z");
  assert.equal(profilesMutationsDisabled(fresh), false);
});

test("a transient failure preserves cache time and disables mutations", () => {
  const fresh = markProfilesFresh(initialProfilesFreshness, "2026-07-28T20:00:00.000Z");
  const stale = markProfilesStale(fresh, "2026-07-28T20:01:00.000Z", "timeout");
  assert.equal(stale.lastSuccessfulAt, fresh.lastSuccessfulAt);
  assert.equal(stale.errorKind, "timeout");
  assert.equal(profilesMutationsDisabled(stale), true);
});

test("authentication is distinct from no profiles and transient backend failure", () => {
  assert.equal(profilesRelayErrorLabel("auth_failed"), "Relay authentication failed");
  assert.equal(profilesRelayErrorLabel("backend_unavailable"), "Live backend temporarily unavailable");
});

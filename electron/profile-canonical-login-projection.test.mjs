import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  canonicalIdentityBlockReason,
  readCanonicalLoginIdentity,
  readCanonicalLoginStatus,
  readCanonicalReadinessStatus,
} = require("./profile-canonical-login-projection.cjs");

function valid(overrides = {}) {
  return {
    loginStatus: "connected",
    loginIdentityProofStatus: "verified",
    loginIdentityProfileOpened: true,
    loginIdentityUsernameMatch: true,
    loginIdentityVerifiedAt: "2026-08-10T10:00:00.000Z",
    readinessProjection: { overall_readiness_status: "ready" },
    eligibility: "can_start",
    ...overrides,
  };
}

test("canonical connected survives missing or review-pending identity metadata while Identity Guard stays closed", () => {
  for (const row of [{ loginStatus: "connected" }, valid({ loginIdentityProofStatus: "required_unverified", loginIdentityVerifiedAt: null })]) {
    assert.equal(readCanonicalLoginIdentity(row).verified, false);
    assert.equal(readCanonicalLoginStatus(row), "connected");
    assert.notEqual(canonicalIdentityBlockReason(row), "");
  }
});

test("identity mismatch still overrides a stale connected status", () => {
  for (const row of [
    valid({ loginIdentityProofStatus: "failed", loginIdentityUsernameMatch: false }),
    valid({ loginIdentityProofStatus: "proven_false_ready", loginIdentityProfileOpened: false }),
  ]) {
    assert.notEqual(readCanonicalLoginStatus(row), "connected");
    assert.notEqual(canonicalIdentityBlockReason(row), "");
  }
});

test("valid identity permits connected but does not manufacture canonical readiness", () => {
  assert.equal(readCanonicalLoginStatus(valid()), "connected");
  assert.equal(readCanonicalReadinessStatus(valid()), "ready");
  assert.equal(readCanonicalReadinessStatus(valid({ readinessProjection: { overall_readiness_status: "blocked" } })), "blocked");
});

test("HISTORICAL_CONNECTED_NO_INVALIDATION_IS_CONNECTED", () => {
  const historical = valid({
    loginIdentityProofStatus: "historical_model_missing",
    loginIdentityProfileOpened: null,
    loginIdentityUsernameMatch: null,
    loginIdentityVerifiedAt: null,
    loginStateInvalidationReason: null,
  });
  assert.equal(readCanonicalLoginIdentity(historical).historicalNonBlocking, true);
  assert.equal(readCanonicalLoginStatus(historical), "connected");
  assert.equal(canonicalIdentityBlockReason(historical), "");
});

test("EXPLICIT_INVALIDATION_IS_LOGIN_REQUIRED", () => {
  const invalidated = valid({
    loginIdentityProofStatus: "historical_model_missing",
    loginIdentityProfileOpened: null,
    loginIdentityUsernameMatch: null,
    loginIdentityVerifiedAt: null,
    loginStateInvalidationReason: "instagram_logged_out",
  });
  assert.equal(readCanonicalLoginIdentity(invalidated).historicalNonBlocking, false);
  assert.notEqual(readCanonicalLoginStatus(invalidated), "connected");
  assert.equal(canonicalIdentityBlockReason(invalidated), "login_state_invalidated_instagram_logged_out");
});

test("PROVEN_FALSE_READY_IS_LOGIN_REQUIRED", () => {
  const mismatch = valid({
    loginIdentityProofStatus: "proven_false_ready",
    loginIdentityProfileOpened: false,
    loginIdentityUsernameMatch: false,
    loginIdentityVerifiedAt: null,
    loginStateInvalidationReason: null,
  });
  assert.notEqual(readCanonicalLoginStatus(mismatch), "connected");
  assert.equal(canonicalIdentityBlockReason(mismatch), "login_identity_mismatch");
});

test("SUCCESSFUL_LOGIN_REMAINS_CONNECTED_AFTER_BOTAPP_RESTART", () => {
  const serialized = JSON.stringify(valid({ followerDelta3d: { dataFreshness: "stale" } }));
  const afterRestart = JSON.parse(serialized);
  assert.equal(readCanonicalLoginStatus(afterRestart), "connected");
  assert.equal(readCanonicalReadinessStatus(afterRestart), "ready");
});

test("SOCIAL_STALE_DOES_NOT_REQUIRE_LOGIN and SOCIAL_UNAVAILABLE_DOES_NOT_REQUIRE_LOGIN", () => {
  for (const socialStatus of ["stale", "unavailable", "failed"]) {
    assert.equal(readCanonicalLoginStatus(valid({ socialStatus })), "connected");
  }
});

test("SUCCESSFUL_RECENT_RUN_ACCOUNT_IS_NOT_LOGIN_REQUIRED", () => {
  assert.equal(readCanonicalLoginStatus(valid({
    lastRunStatus: "completed",
    lastRunFinishedAt: "2026-08-10T19:15:00.000Z",
  })), "connected");
});

test("BACKEND_BOTAPP_PARITY", () => {
  const backendCamel = valid({
    loginIdentityProofStatus: "historical_model_missing",
    loginIdentityProfileOpened: null,
    loginIdentityUsernameMatch: null,
    loginIdentityVerifiedAt: null,
    loginStateInvalidationReason: null,
  });
  const relaySnake = {
    login_status: backendCamel.loginStatus,
    login_identity_proof_status: backendCamel.loginIdentityProofStatus,
    login_identity_profile_opened: backendCamel.loginIdentityProfileOpened,
    login_identity_username_match: backendCamel.loginIdentityUsernameMatch,
    login_identity_verified_at: backendCamel.loginIdentityVerifiedAt,
    login_state_invalidation_reason: backendCamel.loginStateInvalidationReason,
  };
  assert.equal(readCanonicalLoginStatus(backendCamel), "connected");
  assert.equal(readCanonicalLoginStatus(relaySnake), "connected");
});

test("REFRESH_DOES_NOT_REINTRODUCE_FALSE_LOGIN_REQUIRED", () => {
  const payload = valid({
    loginIdentityProofStatus: "historical_model_missing",
    loginIdentityProfileOpened: null,
    loginIdentityUsernameMatch: null,
    loginIdentityVerifiedAt: null,
    loginStateInvalidationReason: null,
  });
  assert.equal(readCanonicalLoginStatus(structuredClone(payload)), "connected");
  assert.equal(readCanonicalLoginStatus(structuredClone(payload)), "connected");
});

test("OLD_CAN_START_CANNOT_OVERRIDE_CANONICAL_LOGIN", () => {
  const stale = valid({
    eligibility: "can_start",
    loginIdentityProofStatus: "failed",
    loginIdentityProfileOpened: false,
    loginIdentityUsernameMatch: false,
    loginIdentityVerifiedAt: null,
  });
  assert.notEqual(readCanonicalLoginStatus(stale), "connected");
});

test("snake-case relay payload uses the same fail-closed contract", () => {
  const row = {
    login_status: "connected",
    login_identity_proof_status: "verified",
    login_identity_profile_opened: true,
    login_identity_username_match: true,
    login_identity_verified_at: "2026-08-10T10:00:00.000Z",
    readiness_projection: { overall_readiness_status: "ready" },
  };
  assert.equal(readCanonicalLoginStatus(row), "connected");
  assert.equal(readCanonicalReadinessStatus(row), "ready");
});

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

test("missing, pending, mismatched, and unknown identity never project connected", () => {
  for (const row of [
    { loginStatus: "connected" },
    valid({ loginIdentityProofStatus: "required_unverified", loginIdentityVerifiedAt: null }),
    valid({ loginIdentityProofStatus: "failed", loginIdentityUsernameMatch: false }),
    valid({ loginIdentityProofStatus: "proven_false_ready", loginIdentityProfileOpened: false }),
  ]) {
    assert.equal(readCanonicalLoginIdentity(row).verified, false);
    assert.notEqual(readCanonicalLoginStatus(row), "connected");
    assert.notEqual(canonicalIdentityBlockReason(row), "");
  }
});

test("valid identity permits connected but does not manufacture canonical readiness", () => {
  assert.equal(readCanonicalLoginStatus(valid()), "connected");
  assert.equal(readCanonicalReadinessStatus(valid()), "ready");
  assert.equal(readCanonicalReadinessStatus(valid({ readinessProjection: { overall_readiness_status: "blocked" } })), "blocked");
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

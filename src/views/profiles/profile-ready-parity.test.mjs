import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { socialBadge } from "./profile-growth-badge.ts";

const currentDir = dirname(fileURLToPath(import.meta.url));
const mainSource = readFileSync(resolve(currentDir, "../../../electron/main.cjs"), "utf8");

function profile(overrides = {}) {
  return {
    id: "account-ready-parity",
    status: "ready",
    loginStatus: "connected",
    readiness: "ready",
    eligibility: "blocked_now",
    eligibilityReason: "assignment_window_closed",
    eligibilityDetail: {
      status: "blocked_now",
      primary_block_reason: "assignment_window_closed",
      reason_label: "Outside current window",
      reason_description: "",
    },
    runtimeLock: "none",
    ...overrides,
  };
}

test("CANONICAL_READY_RENDERS_GROWTH_READY", () => {
  assert.deepEqual(socialBadge(profile()), { label: "growth ready", tone: "success" });
});

test("CANONICAL_NOT_READY_NEVER_RENDERS_READY", () => {
  for (const readiness of ["needs_login", "needs_targets", "blocked"]) {
    assert.notEqual(socialBadge(profile({ readiness })).label, "growth ready");
  }
});

test("CONNECTED_AND_READY_PARITY", () => {
  assert.equal(socialBadge(profile({ loginStatus: "connected", readiness: "ready" })).label, "growth ready");
  assert.equal(socialBadge(profile({ loginStatus: "logged_out", readiness: "ready" })).label, "login required");
});

test("BACKEND_BOTAPP_PARITY", () => {
  assert.match(mainSource, /const raw = readCanonicalReadinessStatus\(account\);/);
  assert.match(mainSource, /if \(loginStatus !== "connected"\) return "needs_login";/);
  assert.match(mainSource, /if \(raw === "ready"\) return "ready";/);
  assert.doesNotMatch(mainSource, /!identity\.verified \|\| loginStatus !== "connected"/);
});

test("REFRESH_PRESERVES_READY", () => {
  const refreshed = { ...profile(), eligibility: "blocked_now", eligibilityReason: "outside_window" };
  assert.equal(socialBadge(refreshed).label, "growth ready");
});

test("BOTAPP_RESTART_PRESERVES_READY", () => {
  const rehydrated = JSON.parse(JSON.stringify(profile()));
  assert.equal(socialBadge(rehydrated).label, "growth ready");
});

test("commercial lifecycle outranks readiness and operator-review projections", () => {
  assert.deepEqual(
    socialBadge(profile({
      commercialLifecycleStatus: "paused",
      readiness: "blocked",
      eligibilityReason: "operator_review_required",
    })),
    { label: "paused", tone: "warning" },
  );
  assert.deepEqual(
    socialBadge(profile({ commercialLifecycleStatus: "cancelled" })),
    { label: "cancelled", tone: "error" },
  );
});

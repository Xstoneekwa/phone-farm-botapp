import assert from "node:assert/strict";
import test from "node:test";
import { formatBlockedCandidatesReason, humanizeDeviceRestReason } from "./auto-restart-labels.ts";

test("humanizeDeviceRestReason hides raw backend token", () => {
  assert.equal(humanizeDeviceRestReason("no_rest_configured", true), "No rest configured (backend preview)");
});

test("formatBlockedCandidatesReason returns backend reason unchanged", () => {
  const reason = formatBlockedCandidatesReason("8 blocked candidate(s)", { operationalState: "ready" });
  assert.equal(reason, "8 blocked candidate(s)");
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  formatNeedsMoreTargetsDeliveryState,
  formatNeedsMoreTargetsLifecycleDecision,
} from "./needs-more-targets-preview-labels.ts";

test("lifecycle preview labels stay human-readable", () => {
  assert.equal(formatNeedsMoreTargetsLifecycleDecision("would_open_episode"), "Would open episode");
  assert.equal(formatNeedsMoreTargetsDeliveryState("blocked_missing_client_email"), "Blocked: missing client email");
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  formatAccountLifecycleDecision,
  formatAccountLifecycleDeliveryState,
} from "./account-lifecycle-preview-labels.ts";

test("account lifecycle preview labels stay human-readable", () => {
  assert.equal(
    formatAccountLifecycleDecision("legacy_state_no_backfill"),
    "Legacy state (no backfill)",
  );
  assert.equal(
    formatAccountLifecycleDeliveryState("blocked_missing_transition_evidence"),
    "Blocked: missing transition evidence",
  );
});

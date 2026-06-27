import test from "node:test";
import assert from "node:assert/strict";
import {
  formatOutboxPreviewDecisionLabel,
  formatOutboxPreviewDeliveryStateLabel,
} from "./outbox-preview-labels.ts";

test("outbox preview labels stay human-readable", () => {
  assert.equal(formatOutboxPreviewDecisionLabel("blocked_legacy_pre_watermark"), "Blocked: legacy pre-watermark");
  assert.equal(formatOutboxPreviewDeliveryStateLabel("theoretical_dispatch_ready"), "Theoretically ready to dispatch");
  assert.doesNotMatch(formatOutboxPreviewDecisionLabel("would_create_initial_intent"), /would_create_initial_intent/);
});

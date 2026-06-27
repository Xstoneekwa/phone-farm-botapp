import assert from "node:assert/strict";
import test from "node:test";
import {
  formatReadinessFlag,
  resolveTestDeliveryReadinessLabel,
  resolveTestDeliverySendDisabled,
} from "../src/email/email-test-delivery-ui.ts";

test("send test delivery section stays visible with readable blocking reason", () => {
  const label = resolveTestDeliveryReadinessLabel({
    templateConfigured: true,
    statusLoading: false,
    canSendTest: false,
    disabledReason: "Test delivery is disabled by CLIENT_EMAIL_TEST_SENDING_ENABLED.",
  });
  assert.match(label, /disabled/i);
});

test("send button disabled when prerequisite missing", () => {
  assert.equal(resolveTestDeliverySendDisabled({
    templateConfigured: false,
    statusLoading: false,
    canSendTest: true,
  }), true);
  assert.equal(resolveTestDeliverySendDisabled({
    templateConfigured: true,
    statusLoading: false,
    canSendTest: true,
  }), false);
});

test("ready label shown when can send test", () => {
  const label = resolveTestDeliveryReadinessLabel({
    templateConfigured: true,
    statusLoading: false,
    canSendTest: true,
    readinessLabel: "Ready for one controlled test",
  });
  assert.equal(label, "Ready for one controlled test");
});

test("readiness flags avoid secrets and use plain language", () => {
  assert.equal(formatReadinessFlag(false, "Enabled", "Disabled"), "Disabled");
  assert.equal(formatReadinessFlag(true, "Configured", "Not configured"), "Configured");
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  deliverySettingsBadgeTone,
  formatDeliverySettingsSaveError,
  formatDeliverySettingsUxState,
} from "./delivery-settings-labels.ts";

test("delivery settings ux labels cover required states", () => {
  assert.equal(formatDeliverySettingsUxState("schema_migration_pending"), "Schema migration pending");
  assert.equal(formatDeliverySettingsUxState("not_configured"), "Sender identity sync is not configured");
  assert.equal(formatDeliverySettingsUxState("not_refreshed"), "Refresh sender identities");
  assert.equal(formatDeliverySettingsUxState("invalid_credentials"), "Postmark Account Token rejected");
  assert.equal(formatDeliverySettingsUxState("provider_unavailable"), "Postmark sync unavailable");
  assert.equal(formatDeliverySettingsUxState("no_confirmed_senders"), "No confirmed sender identities found");
  assert.equal(formatDeliverySettingsUxState("ready"), "Ready");
  assert.equal(formatDeliverySettingsUxState("stale"), "Sender identities stale");
});

test("delivery settings save errors are redacted", () => {
  assert.match(formatDeliverySettingsSaveError("POSTMARK_ACCOUNT_TOKEN missing"), /\[redacted\]/i);
});

test("delivery settings badge tone follows backend ux state", () => {
  assert.equal(deliverySettingsBadgeTone("ready"), "success");
  assert.equal(deliverySettingsBadgeTone("not_refreshed"), "warning");
  assert.equal(deliverySettingsBadgeTone("not_configured"), "neutral");
});

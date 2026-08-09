import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parseIncidentDetail } from "./incident-detail-contract.ts";

const drawer = readFileSync(new URL("./IncidentDrawer.tsx", import.meta.url), "utf8");
const main = readFileSync(new URL("../../electron/main.cjs", import.meta.url), "utf8");
const preload = readFileSync(new URL("../../electron/preload.cjs", import.meta.url), "utf8");

function detail(overrides = {}) {
  return {
    contractVersion: "incident_detail_v1",
    incident: {
      id: "d1b48a08-2dbe-496e-8623-a17f92c8c536",
      status: "open",
      severity: "error",
      reason: "worker_exit_nonzero",
      version: 2,
      ...overrides,
    },
    linked: {},
    timeline: [],
    notifications: [],
    notificationChannels: {},
    lifecycle: {},
  };
}

test("parser accepts canonical and incomplete historical incidents", () => {
  const canonical = parseIncidentDetail(detail());
  assert.equal(canonical.ok, true);
  assert.equal(canonical.data.incident.version, 2);
  const legacy = parseIncidentDetail({ incident: { id: "legacy-1", reason: "legacy_reason" } });
  assert.equal(legacy.ok, true);
  assert.equal(legacy.data.contractVersion, "incident_detail_legacy");
  assert.equal(legacy.data.linked.run, undefined);
});

test("parser rejects missing id and unsupported contract version", () => {
  assert.equal(parseIncidentDetail({ incident: {} }).ok, false);
  assert.match(parseIncidentDetail({ contractVersion: "incident_detail_v9", incident: { id: "x" } }).error, /unsupported version/i);
});

test("Slack and Discord deliveries stay independent", () => {
  const parsed = parseIncidentDetail({
    ...detail(),
    notifications: [
      { id: "slack-1", channel: "slack", status: "sent", attemptCount: 1 },
      { id: "discord-1", channel: "discord", status: "failed", attemptCount: 2 },
    ],
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.data.notificationChannels.slack.current.status, "sent");
  assert.equal(parsed.data.notificationChannels.discord.current.status, "failed");
  assert.equal(parsed.data.notificationChannels.discord.current.attemptCount, 2);
});

test("parser accepts snake_case compatibility fields and action history", () => {
  const parsed = parseIncidentDetail({
    incident: { id: "legacy", account_username: "archived_account", lifecycle_version: 3 },
    operator_review_action: { id: "action", account_id: "account", status: "pending_verification" },
    action_history: [{ id: "action", action_type: "operator_review_required", status: "pending" }],
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.data.incident.accountUsername, "archived_account");
  assert.equal(parsed.data.incident.version, 3);
  assert.equal(parsed.data.operatorReviewAction.id, "action");
  assert.equal(parsed.data.timeline[0].actionType, "operator_review_required");
});

test("drawer sends id, protects stale responses, cancels close, blocks double action and refreshes", () => {
  assert.match(drawer, /incidents\.detail\(incidentId, requestId\)/);
  assert.match(drawer, /requestSequence\.current/);
  assert.match(drawer, /cancelDetail/);
  assert.match(drawer, /if \(!incidentId \|\| !detail \|\| acting\) return/);
  assert.match(drawer, /let result = await submit\(detail\.incident\.version\)/);
  assert.match(drawer, /expected_version: expectedVersion/);
  assert.match(drawer, /await reload\(\)/);
  assert.match(drawer, /Retry detail/);
});

test("drawer exposes generic audited lifecycle without read-time mutation", () => {
  assert.match(drawer, /Add note/);
  assert.match(drawer, /Acknowledge \/ mark investigating/);
  assert.match(drawer, /Resolution reason \(required\)/);
  assert.match(drawer, /Reopen is not supported/);
  assert.match(drawer, /data-testid=\{`incident-channel-\$\{channel\}`\}/);
  assert.match(drawer, /\["slack", "discord"\]/);
  const reloadSlice = drawer.slice(drawer.indexOf("const reload"), drawer.indexOf("async function runAction"));
  assert.doesNotMatch(reloadSlice, /incidents\?\.action|dashboardPost|runAction\(/);
});

test("Electron relay maps detail errors and supports bounded cancellation", () => {
  assert.match(main, /path: "\/api\/instagram-dashboard\/incidents\/:incidentId"/);
  assert.match(main, /status === 400/);
  assert.match(main, /status === 401/);
  assert.match(main, /status === 403/);
  assert.match(main, /status === 404/);
  assert.match(main, /status === 409/);
  assert.match(main, /status >= 500/);
  assert.match(main, /12_000/);
  assert.match(main, /incidentDetailRequests/);
  assert.match(preload, /botapp:incidents:detail-cancel/);
});

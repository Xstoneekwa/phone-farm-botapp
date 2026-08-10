import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const toolbar = readFileSync(new URL("./profiles/ProfileToolbar.tsx", import.meta.url), "utf8");
const profiles = readFileSync(new URL("./profiles/ProfilesView.tsx", import.meta.url), "utf8");
const main = readFileSync(new URL("../../electron/main.cjs", import.meta.url), "utf8");

test("CONFIRM_LOGIN_BUTTON_USES_OPERATOR_ONLY_CONTRACT", () => {
  assert.match(toolbar, /Confirm login & refresh readiness/);
  assert.match(profiles, /Confirm login & refresh readiness/);
  assert.match(main, /operator_confirmation: true/);
  assert.match(main, /operator_id: botappOperatorId\(\)/);
  assert.match(main, /certifyWorkerRuntimeIdentity/);
  assert.match(main, /expected_worker_sha: certification\.workerSha/);
  assert.match(main, /idempotency_key: `confirm-login-readiness:\$\{accountId\}`/);
});

test("CONFIRM_LOGIN_NEVER_STARTS_DEVICE_OR_RUN", () => {
  const functionBody = main.match(/async function profileReadinessNow\(input\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(functionBody, /operator_confirmation: true/);
  assert.doesNotMatch(functionBody, /profiles_auto_login|profiles_run_start|create_account_run_request|adb/i);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";

const drawer = readFileSync(new URL("./drawers/AddProfileDrawer.tsx", import.meta.url), "utf8");
const profiles = readFileSync(new URL("./ProfilesView.tsx", import.meta.url), "utf8");
const main = readFileSync(new URL("../../../electron/main.cjs", import.meta.url), "utf8");

test("BotApp supplies client ownership and stable idempotency to the shared endpoint", () => {
  assert.match(drawer, /client_id: ""/);
  assert.match(drawer, /idempotency_key: crypto\.randomUUID\(\)/);
  assert.match(drawer, /dry_run: mode === "dry_run"/);
  assert.match(drawer, /endpoint_contract: "\/api\/instagram-dashboard\/accounts\/create"/);
  assert.match(main, /client_id/);
  assert.match(main, /idempotency_key/);
  assert.match(main, /"dry_run"/);
});

test("BotApp cannot choose package or add-ons outside entitlement truth", () => {
  assert.match(drawer, /client_account_entitlements/);
  assert.match(drawer, /cannot create or override them/);
  assert.doesNotMatch(drawer, /commercial_package|addonOptions|addons:/);
});

test("BotApp requires write-only credentials and never starts runtime", () => {
  assert.match(drawer, /type="password"/);
  assert.match(drawer, /value="credentials"/);
  assert.doesNotMatch(drawer, /option value="manual"/);
  assert.match(drawer, /provisioning_started: false/);
  assert.match(drawer, /login_started: false/);
  assert.match(drawer, /run_started: false/);
});

test("BotApp truthfully renders deferred assignment and gate 15", () => {
  assert.match(drawer, /15 eligible CTs/);
  assert.match(drawer, /Device\/schedule intent stays deferred/);
  assert.match(profiles, /canonical onboarding started/i);
  assert.doesNotMatch(profiles, /Profile created successfully/);
});

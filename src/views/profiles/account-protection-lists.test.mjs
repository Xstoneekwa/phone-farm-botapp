import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const drawer = readFileSync(new URL("./drawers/SettingsDrawer.tsx", import.meta.url), "utf8");
const main = readFileSync(new URL("../../../electron/main.cjs", import.meta.url), "utf8");
const preload = readFileSync(new URL("../../../electron/preload.cjs", import.meta.url), "utf8");

test("Sources renders canonical account protection lists below target accounts", () => {
  const targetsIndex = drawer.indexOf('title="Target accounts / Sources"');
  const protectionIndex = drawer.indexOf("<AccountProtectionLists accountId={profile.id} />");
  const performanceIndex = drawer.indexOf('title="Followback ratio / Target performance"');
  assert.ok(targetsIndex >= 0 && protectionIndex > targetsIndex && performanceIndex > protectionIndex);
  assert.match(drawer, /title: "Unfollow whitelist"/);
  assert.match(drawer, /never automatically unfollowed/);
  assert.match(drawer, /title: "Interaction blacklist"/);
  assert.match(drawer, /Follow, Like, Comment, Welcome DM, Outreach DM, and Story Watch/);
  assert.match(drawer, /It does not block Unfollow/);
});

test("BotApp uses a secure relay bridge and no local protection-list source of truth", () => {
  assert.match(preload, /botapp:profiles:protection-list:get/);
  assert.match(preload, /botapp:profiles:protection-list:mutate/);
  assert.match(main, /profiles_account_protection_list/);
  assert.match(main, /Idempotency-Key/);
  assert.match(main, /If-Match/);
  assert.doesNotMatch(drawer, /SUPABASE_SERVICE_ROLE_KEY|createClient\(|localStorage/);
});

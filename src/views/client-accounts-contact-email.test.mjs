import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const clientAccountsView = readFileSync(new URL("./ClientAccounts.tsx", import.meta.url), "utf8");
const electronMain = readFileSync(new URL("../../electron/main.cjs", import.meta.url), "utf8");
const typesSource = readFileSync(new URL("../api/types.ts", import.meta.url), "utf8");

test("client accounts column is labeled Client email and uses canonical projection field", () => {
  assert.match(clientAccountsView, /<th>Client email<\/th>/);
  assert.match(clientAccountsView, /item\.clientContactEmailDisplay/);
  assert.doesNotMatch(clientAccountsView, /<th>Email<\/th>/);
  assert.doesNotMatch(clientAccountsView, /item\.safeEmailDisplay/);
});

test("botapp relay maps canonical client contact email instead of instagram emailDisplay", () => {
  assert.match(electronMain, /clientContactEmail/);
  assert.match(electronMain, /clientContactEmailDisplay/);
  assert.match(electronMain, /Not provided/);
  assert.match(electronMain, /overlayClientAccountNeedsMoreTargets/);
  assert.doesNotMatch(electronMain, /safeEmailDisplay: String\(account\?\.emailDisplay/);
  assert.doesNotMatch(electronMain, /clientContactEmailDisplay: String\(account\?\.emailDisplay/);
});

test("botapp client account type exposes canonical client contact email fields", () => {
  assert.match(typesSource, /clientContactEmailDisplay: string/);
  assert.match(typesSource, /clientContactEmailSource: string/);
  assert.match(typesSource, /clientContactEmailAvailable: boolean/);
});

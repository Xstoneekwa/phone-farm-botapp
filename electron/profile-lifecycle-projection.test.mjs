import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { isVisibleProfileAccount } = require("./profile-lifecycle-projection.cjs");

test("active and legacy active profiles remain visible", () => {
  assert.equal(isVisibleProfileAccount({ status: "active", adminStatus: "active" }), true);
  assert.equal(isVisibleProfileAccount({ accountLifecycleStatus: "active" }), true);
});

test("rollback, cancelled, deleted, archived and inactive profiles are hidden", () => {
  for (const account of [
    { status: "rolled_back_test_onboarding", adminStatus: "cancelled" },
    { accountLifecycleStatus: "onboarding_rollback" },
    { admin_status: "canceled" },
    { status: "deleted" },
    { status: "archived" },
    { client_active: false },
  ]) {
    assert.equal(isVisibleProfileAccount(account), false);
  }
});

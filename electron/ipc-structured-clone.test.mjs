import assert from "node:assert/strict";
import test from "node:test";
import {
  describeValue,
  findNonCloneablePath,
  toIpcSafe,
} from "./ipc-structured-clone.cjs";

test("findNonCloneablePath flags nested function values", () => {
  const found = findNonCloneablePath({ ok: true, cb: () => 1 });
  assert.equal(found?.kind, "function");
  assert.match(found?.path || "", /\.cb$/);
});

test("findNonCloneablePath flags Map and function values", () => {
  assert.equal(findNonCloneablePath(new Map([["a", 1]]))?.kind, "Map");
  assert.equal(findNonCloneablePath(() => undefined)?.kind, "function");
});

test("toIpcSafe yields structured-cloneable plain payloads", () => {
  const safe = toIpcSafe({
    ok: true,
    data: {
      count: 2,
      tags: ["a"],
      nested: { when: "2026-01-01T00:00:00.000Z" },
      err: new Error("ignored"),
      big: 9n,
    },
  });
  assert.doesNotThrow(() => structuredClone(safe));
  assert.equal(safe.data.err.message, "ignored");
  assert.equal(safe.data.big, "9");
});

test("describeValue covers common non-cloneable kinds", () => {
  assert.equal(describeValue(new Error("x")), "Error");
  assert.equal(describeValue(Symbol("s")), "symbol");
  assert.equal(describeValue(1n), "bigint");
});

test("toIpcSafe preserves shared object references without [circular] corruption", () => {
  const profile = { id: "acc_1", counters: { follow: { current: 1, max: 10 } } };
  const payload = { profiles: [profile], profileGroups: [{ deviceId: "d1", profiles: [profile] }] };
  const safe = toIpcSafe(payload);
  assert.doesNotThrow(() => structuredClone(safe));
  assert.equal(safe.profileGroups[0].profiles[0].counters.follow.current, 1);
  assert.notEqual(safe.profileGroups[0].profiles[0], "[circular]");
});

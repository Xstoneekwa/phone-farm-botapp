import assert from "node:assert/strict";
import test from "node:test";
import ipcClone from "./ipc-structured-clone.cjs";

const { serializeIpcPayload } = ipcClone;

test("shared profile references remain complete in profiles and profile groups", () => {
  const profile = {
    username: "mythyl_fitness",
    counters: { follow: { current: 40, max: 120 } },
  };
  const result = serializeIpcPayload({
    profiles: [profile],
    profileGroups: [{ profiles: [profile] }],
  });

  assert.deepEqual(result.profiles[0].counters.follow, { current: 40, max: 120 });
  assert.deepEqual(result.profileGroups[0].profiles[0].counters.follow, { current: 40, max: 120 });
  assert.notStrictEqual(result.profiles[0], result.profileGroups[0].profiles[0]);
});

test("actual recursive cycles still stop safely", () => {
  const value = { name: "root" };
  value.self = value;
  assert.deepEqual(serializeIpcPayload(value), { name: "root", self: "[circular]" });
});

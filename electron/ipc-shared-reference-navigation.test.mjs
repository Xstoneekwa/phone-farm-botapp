import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { serializeIpcPayload } = require("./ipc-structured-clone.cjs");

test("Profiles navigation payload preserves shared profile counters", () => {
  const profile = {
    id: "profile-1",
    username: "profile_one",
    counters: {
      follow: { current: 3, max: 10 },
      unfollow: { current: 2, max: 10 },
      like: { current: 4, max: 10 },
      comment: { current: 1, max: 10 },
      dm: { current: 0, max: 2 },
    },
  };
  const payload = {
    data: {
      profiles: [profile],
      profileGroups: [{ deviceId: "device-1", profiles: [profile] }],
    },
  };

  const serialized = serializeIpcPayload(payload);
  const groupedProfile = serialized.data.profileGroups[0].profiles[0];

  assert.notEqual(groupedProfile, "[circular]");
  assert.equal(groupedProfile.id, "profile-1");
  assert.equal(groupedProfile.counters.follow.current, 3);
  assert.doesNotThrow(() => groupedProfile.counters.follow.current);
});

test("true ancestor cycles remain bounded", () => {
  const value = { name: "root" };
  value.self = value;

  assert.deepEqual(serializeIpcPayload(value), {
    name: "root",
    self: "[circular]",
  });
});

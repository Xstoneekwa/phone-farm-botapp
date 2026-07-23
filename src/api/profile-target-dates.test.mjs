import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveProfileTargetDates } from "./profile-target-dates.ts";

test("Added uses created_at rather than a later updated_at", () => {
  const createdAt = "2026-07-04T09:00:00.000Z";
  const dates = resolveProfileTargetDates({
    created_at: createdAt,
    updated_at: "2026-07-22T18:00:00.000Z",
  });
  assert.equal(dates.addedAt, createdAt);
});

test("Added accepts the client-safe added_at projection first", () => {
  const addedAt = "2026-07-04T09:00:00.000Z";
  const dates = resolveProfileTargetDates({
    added_at: addedAt,
    created_at: "2026-07-05T09:00:00.000Z",
  });
  assert.equal(dates.addedAt, addedAt);
});

test("missing created_at stays unknown even when updated_at exists", () => {
  const dates = resolveProfileTargetDates({
    created_at: null,
    updated_at: "2026-07-22T18:00:00.000Z",
  });
  assert.equal(dates.addedAt, null);
});

test("refresh updates do not change Added", () => {
  const source = { created_at: "2026-07-04T09:00:00.000Z" };
  const first = resolveProfileTargetDates({ ...source, updated_at: "2026-07-19T10:00:00.000Z" });
  const refreshed = resolveProfileTargetDates({ ...source, updated_at: "2026-07-22T18:00:00.000Z" });
  assert.equal(first.addedAt, refreshed.addedAt);
});

test("Last used remains sourced from last_used_at", () => {
  const lastUsedAt = "2026-07-21T15:30:00.000Z";
  const dates = resolveProfileTargetDates({
    created_at: "2026-07-04T09:00:00.000Z",
    last_used_at: lastUsedAt,
  });
  assert.equal(dates.lastUsedAt, lastUsedAt);
});

test("Targets drawer renders a missing Added date as an em dash", () => {
  const drawerSource = readFileSync(new URL("../views/profiles/drawers/TargetsDrawer.tsx", import.meta.url), "utf8");
  assert.match(drawerSource, /formatShortDate\(target\.addedAt\)/);
  assert.match(drawerSource, /if \(!value\) return "—"/);
});

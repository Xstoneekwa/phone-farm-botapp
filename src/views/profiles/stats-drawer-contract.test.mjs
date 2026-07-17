import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./drawers/StatsDrawer.tsx", import.meta.url), "utf8");

test("Statistics labels its rows as daily totals with the latest session time", () => {
  assert.match(source, /DAY \/ LATEST SESSION/);
  assert.doesNotMatch(source, />SESSION TIME</);
});

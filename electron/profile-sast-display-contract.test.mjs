import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const mainSource = readFileSync(new URL("./main.cjs", import.meta.url), "utf8");

test("packaged Profiles timestamps use Johannesburg time without a timezone suffix", () => {
  assert.match(mainSource, /function formatCompactDateTime[\s\S]*timeZone:\s*"Africa\/Johannesburg"/);
  assert.doesNotMatch(mainSource.match(/function formatCompactDateTime[\s\S]*?\n}/)?.[0] ?? "", /timeZoneName/);
  assert.doesNotMatch(mainSource.match(/function formatCompactDateTime[\s\S]*?\n}/)?.[0] ?? "", /toISOString\(\)\.slice/);
});

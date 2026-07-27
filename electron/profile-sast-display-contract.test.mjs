import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const mainSource = readFileSync(new URL("./main.cjs", import.meta.url), "utf8");

test("packaged Profiles timestamps use the explicit Johannesburg timezone and SAST label", () => {
  assert.match(mainSource, /function formatCompactDateTime[\s\S]*timeZone:\s*"Africa\/Johannesburg"/);
  assert.match(mainSource, /timeZoneName:\s*"short"/);
  assert.doesNotMatch(mainSource.match(/function formatCompactDateTime[\s\S]*?\n}/)?.[0] ?? "", /toISOString\(\)\.slice/);
});

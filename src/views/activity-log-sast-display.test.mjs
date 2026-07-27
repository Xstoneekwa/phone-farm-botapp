import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./ActivityLog.tsx", import.meta.url), "utf8");

test("Activity Log renders canonical timestamps in Johannesburg time without a timezone suffix", () => {
  assert.match(source, /timeZone:\s*BUSINESS_TIMEZONE/);
  assert.match(source, /label="Occurred"/);
  assert.match(source, /formatActivityTimestampSast\(record\.occurredAt\)/);
  assert.doesNotMatch(source, /Occurred \(SAST\)/);
  assert.doesNotMatch(source, /\.format\(parsed\)\}\s+SAST/);
});

test("Activity Log keeps the canonical source timestamp in safe exports", () => {
  assert.match(source, /occurred_at:\s*item\.occurredAt/);
});

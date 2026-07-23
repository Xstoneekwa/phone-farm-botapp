import assert from "node:assert/strict";
import test from "node:test";

import { warmupCapsValidationError, warmupPackageMaximum } from "./warmup-cap-settings.ts";

const valid = {
  day1: 8,
  day2: 15,
  day3: 25,
  day4Plus: 45,
  packageDayCap: 80,
  packageSessionCap: 80,
};

test("custom warmup progression 8 / 15 / 25 / 45 is editable", () => {
  assert.equal(warmupCapsValidationError(valid), "");
});

test("warmup caps require positive integers", () => {
  assert.match(warmupCapsValidationError({ ...valid, day1: 0 }), /positive integer/);
  assert.match(warmupCapsValidationError({ ...valid, day2: 15.5 }), /positive integer/);
});

test("warmup caps cannot exceed the lower package day/session maximum", () => {
  assert.equal(warmupPackageMaximum({ packageDayCap: 80, packageSessionCap: 50 }), 50);
  assert.equal(
    warmupCapsValidationError({ ...valid, packageSessionCap: 40 }),
    "Follow warmup caps cannot exceed the package maximum (40).",
  );
});

test("warmup progression must be monotonic", () => {
  assert.equal(
    warmupCapsValidationError({ ...valid, day1: 20, day2: 10 }),
    "Follow warmup progression must satisfy Day 1 <= Day 2 <= Day 3 <= Day 4+.",
  );
});

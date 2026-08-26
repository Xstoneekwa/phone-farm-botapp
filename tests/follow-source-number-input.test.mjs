import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../src/views/profiles/drawers/SettingsDrawer.tsx", import.meta.url),
  "utf8",
);

test("follow-source number fields merge into the latest draft", () => {
  assert.match(
    source,
    /setSourcesDraft\(\(current\) => \(\{ \.\.\.\(current \?\? settings\.sources\), maxFollowsPerTargetPerRun: value \}\)\)/,
  );
  assert.match(
    source,
    /setSourcesDraft\(\(current\) => \(\{ \.\.\.\(current \?\? settings\.sources\), maxTargetsPerRun: value \}\)\)/,
  );
  assert.doesNotMatch(source, /setSourcesDraft\(\{ \.\.\.sources, maxFollowsPerTargetPerRun: value \}\)/);
  assert.doesNotMatch(source, /setSourcesDraft\(\{ \.\.\.sources, maxTargetsPerRun: value \}\)/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const types = readFileSync(new URL("../../api/types.ts", import.meta.url), "utf8");
const view = readFileSync(new URL("./ProfilesView.tsx", import.meta.url), "utf8");
const main = readFileSync(new URL("../../../electron/main.cjs", import.meta.url), "utf8");

test("BotApp consumes the typed backend projection without recomputing runtime state", () => {
  assert.match(types, /latestBusinessTransition\?: ProfileBusinessTransition \| null/);
  assert.match(main, /latestBusinessTransition: account\?\.latestBusinessTransition/);
  assert.match(view, /Transition \{transition\.state\}/);
  assert.doesNotMatch(view, /follow_to_unfollow_time_handoff.*\?.*partial/);
});

test("a normal transition is informational and only a projected blocker changes tone", () => {
  assert.match(view, /transition\.state === "blocked" \? "warning" : "neutral"/);
  assert.doesNotMatch(view, /operator review/i);
});

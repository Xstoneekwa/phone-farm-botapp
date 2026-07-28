import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const main = readFileSync(new globalThis.URL("./main.cjs", import.meta.url), "utf8");
const view = readFileSync(new globalThis.URL("../src/views/profiles/ProfilesView.tsx", import.meta.url), "utf8");

test("successful Profiles payload remains distinct from an empty successful list", () => {
  assert.match(main, /if \(!Array\.isArray\(payload\?\.profiles\)\)/);
  assert.match(main, /ok: true,[\s\S]*profiles: payload\.profiles/);
});

test("cached Profiles data exposes timestamp, Retry and mutation lock", () => {
  assert.match(view, /profiles-cached-stale-banner/);
  assert.match(view, /last update/);
  assert.match(view, />Retry</);
  assert.match(view, /mutations disabled/);
});

test("a Profiles read failure has no dispatcher side effect", () => {
  const start = main.indexOf("async function botappProfilesLiveData");
  const end = main.indexOf("function probeRelayUrlRedacted", start);
  const section = main.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(section, /dispatcher|ensureDispatcher|restart/i);
});

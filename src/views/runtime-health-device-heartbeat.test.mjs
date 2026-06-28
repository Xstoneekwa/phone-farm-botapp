import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("runtime health exposes additive device heartbeat service card", () => {
  const runtimeHealth = readFileSync(new URL("./RuntimeHealth.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("./runtime-health.css", import.meta.url), "utf8");
  assert.match(runtimeHealth, /Device heartbeat service/);
  assert.match(runtimeHealth, /deviceHeartbeatHealth/);
  assert.match(runtimeHealth, /Opérationnel|operatorLabelFr/);
  assert.match(runtimeHealth, /Run Control Dispatcher/);
  assert.match(css, /\.runtime-device-heartbeat-banner/);
  assert.doesNotMatch(runtimeHealth, /SUPABASE_SERVICE_ROLE_KEY/);
});

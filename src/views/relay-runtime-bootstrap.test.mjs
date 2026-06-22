import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  bootstrapRelayRuntime,
  canonicalUserDataDir,
  resolveRepairState,
} from "../../electron/relay-runtime-bootstrap.cjs";

test("canonical userData resolves to Application Support/BotApp", () => {
  assert.match(canonicalUserDataDir(), /Application Support\/BotApp$/);
});

test("bootstrap prefers production relay over localhost legacy config", () => {
  const tmp = `/tmp/botapp-bootstrap-test-${Date.now()}`;
  const legacy = `${tmp}/legacy`;
  const active = `${tmp}/BotApp`;
  fs.mkdirSync(legacy, { recursive: true });
  fs.mkdirSync(active, { recursive: true });
  fs.writeFileSync(path.join(legacy, "botapp-runtime-config.json"), JSON.stringify({
    compassAiRelayUrl: "https://www.boostmybusinesses.com/api/instagram-dashboard/compass/analyze",
    botappRelayKey: "legacy-production-key-value-01234567890123456789012345678901",
  }, null, 2));
  fs.writeFileSync(path.join(active, "botapp-runtime-config.json"), JSON.stringify({
    compassAiRelayUrl: "http://127.0.0.1:3000/api/instagram-dashboard/compass/analyze",
  }, null, 2));

  try {
    const secureStore = new Map();
    const status = bootstrapRelayRuntime({
      forceRestore: true,
      userDataDir: active,
      legacyDirs: [legacy],
      normalizeRelayUrl: (value) => String(value || "").trim(),
      secureStorage: {
        available: true,
        load: (dir) => secureStore.get(dir) || "",
        save: (dir, key) => {
          secureStore.set(dir, key);
          return true;
        },
      },
    });
    assert.equal(status.relayUrlConfigured, true);
    assert.equal(status.relayKeyConfigured, true);
    assert.equal(status.importedFrom, path.basename(legacy));
    assert.equal(status.repairState, "connection_restored");
    const saved = JSON.parse(fs.readFileSync(path.join(active, "botapp-runtime-config.json"), "utf8"));
    assert.match(saved.compassAiRelayUrl, /boostmybusinesses\.com/);
    assert.equal("botappRelayKey" in saved, false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("repair state mapping stays client-safe", () => {
  assert.equal(resolveRepairState({
    relayUrlConfigured: true,
    relayKeyConfigured: true,
    secureStorageAvailable: true,
    importedFrom: "botapp-mac-foundation",
    lastError: null,
  }), "connection_restored");
  assert.equal(resolveRepairState({
    relayUrlConfigured: false,
    relayKeyConfigured: false,
    secureStorageAvailable: false,
    importedFrom: null,
    lastError: "secure_storage_unavailable",
  }), "keychain_unavailable");
});

test("packaged main pins canonical userData and unified bootstrap", () => {
  const main = fs.readFileSync(new URL("../../electron/main.cjs", import.meta.url), "utf8");
  assert.match(main, /app\.setPath\("userData", canonicalUserDataDir\(\)\)/);
  assert.match(main, /relay-runtime-bootstrap\.cjs/);
  assert.match(main, /BOTAPP_STARTUP_DIAGNOSTICS/);
});

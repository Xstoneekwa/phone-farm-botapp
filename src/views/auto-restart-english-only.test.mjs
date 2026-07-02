import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const FRENCH_PATTERN = /Aperçu|Réglages|Désactivé|Rafraîchir|Surveillance|aperçu|désactivé|Garde-fous|Comptes concernés|Les réglages canoniques/i;

const BOTAPP_FILES = [
  new URL("./AutoRestart.tsx", import.meta.url),
  new URL("./AutoRestartSettingsDrawer.tsx", import.meta.url),
  new URL("./auto-restart-status.ts", import.meta.url),
  new URL("./auto-restart-labels.ts", import.meta.url),
];

test("BotApp Auto Restart surfaces remain English-only", () => {
  for (const fileUrl of BOTAPP_FILES) {
    const source = readFileSync(fileUrl, "utf8");
    assert.doesNotMatch(source, FRENCH_PATTERN, `${fileUrl.pathname} must not contain French UI copy`);
  }
});

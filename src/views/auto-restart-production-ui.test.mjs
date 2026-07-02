import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const FRENCH_PATTERN = /Aperçu|Réglages|Désactivé|Rafraîchir|Surveillance|aperçu|désactivé|Garde-fous|Comptes concernés|Les réglages canoniques/i;
const FORBIDDEN_COPY = /Preview only|Dry-run preview|Dry-run mode|Read-only — backend migration|Current mode: Dry-run/i;

const BOTAPP_FILES = [
  new URL("./AutoRestart.tsx", import.meta.url),
  new URL("./AutoRestartSettingsDrawer.tsx", import.meta.url),
  new URL("./auto-restart-status.ts", import.meta.url),
  new URL("./auto-restart-labels.ts", import.meta.url),
  new URL("./auto-restart.css", import.meta.url),
];

test("BotApp Auto Restart surfaces remain English-only without preview framing", () => {
  for (const fileUrl of BOTAPP_FILES) {
    const source = readFileSync(fileUrl, "utf8");
    assert.doesNotMatch(source, FRENCH_PATTERN, `${fileUrl.pathname} must not contain French UI copy`);
    assert.doesNotMatch(source, FORBIDDEN_COPY, `${fileUrl.pathname} must not contain preview framing copy`);
  }
});

test("BotApp Auto Restart layout avoids horizontal overflow patterns", () => {
  const css = readFileSync(new URL("./auto-restart.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /min-width:\s*640px/);
  assert.doesNotMatch(css, /repeat\(3,/);
  assert.match(css, /minmax\(min\(100%/);
  assert.match(css, /overflow-x:\s*clip/);
});

test("BotApp Auto Restart exposes production mode and dry-run action only", () => {
  const source = readFileSync(new URL("./AutoRestart.tsx", import.meta.url), "utf8");
  assert.match(source, /Production/);
  assert.match(source, /Run dry-run check/);
  assert.match(source, /Blocked — automation foundation is not available\./);
});

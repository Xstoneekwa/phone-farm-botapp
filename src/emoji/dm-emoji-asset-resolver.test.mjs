import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import emojiRegex from "emoji-regex";

const currentDir = dirname(fileURLToPath(import.meta.url));
const resolverSource = readFileSync(resolve(currentDir, "dm-emoji-asset-resolver.ts"), "utf8");
const manifestSource = readFileSync(resolve(currentDir, "twemoji-assets.json"), "utf8");
const manifest = JSON.parse(manifestSource);
const manifestSet = new Set(manifest);

const TWEMOJI_STRIP_VARIATION_SELECTORS = /-fe0f|-fe0e/g;

function emojiCodepointKey(emoji) {
  return Array.from(emoji)
    .map((char) => char.codePointAt(0)?.toString(16).toLowerCase())
    .filter(Boolean)
    .join("-");
}

function emojiAssetKey(emoji) {
  const exact = emojiCodepointKey(emoji);
  if (manifestSet.has(exact)) return exact;
  const withoutVariationSelectors = exact.replace(TWEMOJI_STRIP_VARIATION_SELECTORS, "");
  if (manifestSet.has(withoutVariationSelectors)) return withoutVariationSelectors;
  return exact;
}

function emojiAssetResolved(emoji) {
  return manifestSet.has(emojiAssetKey(emoji));
}

function emojiAssetSrc(emoji) {
  const key = emojiAssetKey(emoji);
  if (!manifestSet.has(key)) return "";
  return `./emoji/twemoji/${key}.svg`;
}

const matrixEmojis = Array.from(
  "Emoji matrix: ✅ ❤️ 🔄 🔥 🚀 🙏 😄 ✨ 👍 🥰 👨‍💻 👩‍💻 ❤️‍🔥 👍🏽 🙏🏾 🇫🇷 🇺🇸 👋 🎀".matchAll(emojiRegex()),
  (match) => match[0],
);

test("emoji asset resolver uses Electron-safe relative packaged URLs", () => {
  assert.match(resolverSource, /import\.meta\.env\.BASE_URL/);
  assert.match(resolverSource, /emoji\/twemoji\//);
  assert.doesNotMatch(resolverSource, /import\.meta\.glob/);
  assert.doesNotMatch(resolverSource, /"\/emoji\/twemoji\//);
  assert.match(resolverSource, /data:image\/svg\+xml/);
});

test("critical emoji filenames exist in local Twemoji manifest", () => {
  const critical = [
    ["❤️", "2764"],
    ["✅", "2705"],
    ["🔄", "1f504"],
    ["👋", "1f44b"],
    ["🎀", "1f380"],
    ["🇫🇷", "1f1eb-1f1f7"],
  ];

  for (const [emoji, expectedKey] of critical) {
    assert.equal(emojiAssetKey(emoji), expectedKey, `${emoji} should resolve to ${expectedKey}.svg`);
    assert.ok(emojiAssetResolved(emoji), `${emoji} should have a packaged asset`);
  }
});

test("full DM emoji matrix resolves to existing local assets with non-empty src", () => {
  const missing = matrixEmojis.filter((emoji) => !emojiAssetResolved(emoji));
  assert.deepEqual(missing, []);

  for (const emoji of matrixEmojis) {
    const src = emojiAssetSrc(emoji);
    assert.ok(src, `${emoji} should resolve to a non-empty src`);
    assert.match(src, /^\.\/emoji\/twemoji\/[a-z0-9-]+\.svg$/);
  }
});

test("renderer never references absolute /emoji public paths", () => {
  const settingsDrawerSource = readFileSync(resolve(currentDir, "../views/profiles/drawers/SettingsDrawer.tsx"), "utf8");
  assert.match(settingsDrawerSource, /from "\.\.\/\.\.\/\.\.\/emoji\/dm-emoji-asset-resolver"/);
  assert.doesNotMatch(settingsDrawerSource, /"\/emoji\/twemoji\//);
  assert.doesNotMatch(settingsDrawerSource, /EmojiAssetLoadDiagnostic/);
});

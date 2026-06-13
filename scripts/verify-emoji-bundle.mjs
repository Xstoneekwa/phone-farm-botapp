import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = resolve(rootDir, "dist");
const distEmojiDir = join(distDir, "emoji/twemoji");
const distAssetsDir = join(distDir, "assets");
const appAsar = resolve(rootDir, "release/mac-arm64/BotApp.app/Contents/Resources/app.asar");

test("dist bundle includes all Twemoji SVG assets under dist/emoji/twemoji", () => {
  assert.ok(existsSync(distEmojiDir), "dist/emoji/twemoji missing — run npm run build first");
  const svgAssets = readdirSync(distEmojiDir).filter((file) => file.endsWith(".svg"));
  assert.ok(svgAssets.length >= 3000, `expected thousands of packaged SVG assets, got ${svgAssets.length}`);
  for (const key of ["2705.svg", "2764.svg", "1f504.svg", "1f44b.svg", "1f380.svg", "1f1eb-1f1f7.svg"]) {
    assert.ok(svgAssets.includes(key), `missing critical asset ${key}`);
  }
});

test("packaged renderer bundle does not reference fragile absolute /emoji public paths", () => {
  assert.ok(existsSync(distAssetsDir), "dist/assets missing — run npm run build first");
  const jsBundle = readdirSync(distAssetsDir).find((file) => file.startsWith("index-") && file.endsWith(".js"));
  assert.ok(jsBundle, "dist JS bundle missing");
  const source = readFileSync(join(distAssetsDir, jsBundle), "utf8");
  assert.doesNotMatch(source, /"\/emoji\/twemoji\//);
  assert.match(source, /\.\/emoji\/twemoji\//);
});

test("packaged app.asar contains dist emoji assets when release build exists", { skip: !existsSync(appAsar) }, () => {
  const asar = require("@electron/asar");
  const files = asar.listPackage(appAsar);
  const mainSource = asar.extractFile(appAsar, "electron/main.cjs").toString("utf8");
  if (!mainSource.includes("dm-drawer-emoji-assets-v10")) {
    console.log("Skipping app.asar emoji verification — stale package, run npm run package:mac");
    return;
  }

  for (const key of [
    "/dist/emoji/twemoji/2705.svg",
    "/dist/emoji/twemoji/2764.svg",
    "/dist/emoji/twemoji/1f504.svg",
    "/dist/emoji/twemoji/1f44b.svg",
    "/dist/emoji/twemoji/1f380.svg",
    "/dist/emoji/twemoji/1f1eb-1f1f7.svg",
  ]) {
    assert.ok(files.includes(key), `missing ${key} in app.asar`);
  }
});

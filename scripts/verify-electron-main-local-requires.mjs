import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = new URL("..", import.meta.url).pathname;
const mainPath = join(repoRoot, "electron", "main.cjs");
const electronDir = dirname(mainPath);
const appAsarPath = join(repoRoot, "release", "mac-arm64", "BotApp.app", "Contents", "Resources", "app.asar");
const asarBin = join(repoRoot, "node_modules", ".bin", "asar");

function localMainRequires() {
  const source = readFileSync(mainPath, "utf8");
  const matches = [...source.matchAll(/require\(["'](\.\/[^"']+)["']\)/g)];
  return [...new Set(matches.map((match) => match[1]))].sort();
}

function resolveSourceRequire(relPath) {
  const resolved = join(electronDir, relPath);
  if (existsSync(resolved)) return resolved;
  if (existsSync(`${resolved}.cjs`)) return `${resolved}.cjs`;
  if (existsSync(`${resolved}.js`)) return `${resolved}.js`;
  return resolved;
}

const requires = localMainRequires();
assert.ok(requires.length > 0, "expected local main-process requires");

for (const relPath of requires) {
  const resolved = resolveSourceRequire(relPath);
  assert.ok(existsSync(resolved), `missing source module for require("${relPath}")`);
}

assert.ok(existsSync(join(electronDir, "ipc-structured-clone.cjs")), "ipc-structured-clone.cjs must exist in electron/");

if (existsSync(appAsarPath)) {
  assert.ok(existsSync(asarBin), "local asar binary is required to inspect app.asar");
  const result = spawnSync(asarBin, ["list", appAsarPath], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || "asar list failed");
  const entries = new Set(
    result.stdout
      .split(/\r?\n/)
      .map((line) => normalize(line.trim().replace(/^\/+/, "")))
      .filter(Boolean),
  );
  for (const relPath of requires) {
    const sourceResolved = resolveSourceRequire(relPath);
    const relativeEntry = normalize(sourceResolved.slice(repoRoot.length).replace(/^\/+/, ""));
    assert.ok(entries.has(relativeEntry), `missing packaged module in app.asar: ${relativeEntry}`);
  }
  assert.ok(entries.has("electron/ipc-structured-clone.cjs"), "app.asar must include electron/ipc-structured-clone.cjs");
}

console.log(`Verified ${requires.length} local electron/main.cjs require(s).`);

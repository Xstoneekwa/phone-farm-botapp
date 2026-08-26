import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const captureCriticalFiles = [
  "electron/main.cjs",
  "electron/preload.cjs",
  "src/app/App.tsx",
  "src/app/routes.tsx",
  "src/design/components/Button.tsx",
  "src/layout/Sidebar.tsx",
  "src/views/RuntimeHealth.tsx",
  "src/views/IncidentDrawer.tsx",
  "src/views/IncidentNotificationsSettings.tsx",
  "src/views/Devices.tsx",
  "src/views/Profiles.tsx",
  "src/views/profiles/ProfilesView.tsx",
];

function sha256File(relativePath) {
  return createHash("sha256").update(readFileSync(join(root, relativePath))).digest("hex");
}

function sha256Text(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function readBuildMarker() {
  const text = readFileSync(join(root, "electron/main.cjs"), "utf8");
  const match = text.match(/const botappIpcProbeBuildId = "([^"]+)"/);
  return match ? match[1] : null;
}

function distAssetHashes() {
  const assetsDir = join(root, "dist/assets");
  if (!existsSync(assetsDir)) return {};
  const entries = readdirSync(assetsDir)
    .filter((entry) => /\.(js|css)$/i.test(entry))
    .sort();
  return Object.fromEntries(entries.map((entry) => [`dist/assets/${entry}`, sha256File(`dist/assets/${entry}`)]));
}

const sourceHashes = Object.fromEntries(captureCriticalFiles.map((file) => [file, sha256File(file)]));
const sourceSha = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const trackedWorktreeStatus = execFileSync(
  "git",
  ["-C", root, "status", "--porcelain", "--untracked-files=no"],
  { encoding: "utf8" },
).trim();
const provenance = {
  generatedAt: new Date().toISOString(),
  sourceSha,
  trackedWorktreeClean: trackedWorktreeStatus === "",
  buildMarker: readBuildMarker(),
  captureCriticalFiles,
  sourceHashes,
  sourceFingerprint: sha256Text(JSON.stringify(sourceHashes)),
  distAssetHashes: distAssetHashes(),
};

writeFileSync(join(root, "package-provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`);
console.log(JSON.stringify({
  ok: true,
  sourceSha: provenance.sourceSha,
  trackedWorktreeClean: provenance.trackedWorktreeClean,
  buildMarker: provenance.buildMarker,
  sourceFingerprint: provenance.sourceFingerprint,
  captureCriticalFileCount: captureCriticalFiles.length,
}, null, 2));

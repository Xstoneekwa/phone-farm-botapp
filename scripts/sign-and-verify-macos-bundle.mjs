/**
 * Packaging gate: sign the macOS dir-target bundle inside-out, then verify it.
 *
 * Why: electron-builder runs with `identity: null` (no local Developer ID on this Mac),
 * which leaves only linker-ad-hoc signatures. That launches locally, but the bundle is
 * not verifiable (`codesign --verify --deep --strict` fails with "code has no resources").
 * This gate re-signs every nested code object ad hoc (deepest first, never a blind
 * `--deep` on the root only), then fails the build if any component is unsigned,
 * non-arm64, or if strict deep verification fails.
 *
 * No secret, certificate, or private key is used or printed. Signing identity is the
 * ad-hoc identity ("-"), matching the validated local launch model of the official app.
 * AMFI/Gatekeeper are never bypassed: no xattr stripping, no spctl overrides.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const repoRoot = new URL("..", import.meta.url).pathname;
const appBundle = join(repoRoot, "release", "mac-arm64", "BotApp.app");
const SIGN_IDENTITY = process.env.BOTAPP_MAC_SIGN_IDENTITY || "-";

function fail(message) {
  console.error(`[sign-gate] FAIL: ${message}`);
  process.exit(1);
}

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const stderr = error?.stderr ? String(error.stderr).slice(0, 500) : "";
    throw new Error(`${cmd} ${args.join(" ")} failed: ${stderr || error.message}`, { cause: error });
  }
}

function isMachO(filePath) {
  try {
    const stats = statSync(filePath);
    if (!stats.isFile() || stats.size < 4) return false;
    const buffer = readFileSync(filePath).subarray(0, 4);
    const magics = [
      Buffer.from([0xcf, 0xfa, 0xed, 0xfe]), // Mach-O 64 LE
      Buffer.from([0xca, 0xfe, 0xba, 0xbe]), // universal
      Buffer.from([0xfe, 0xed, 0xfa, 0xcf]), // Mach-O 64 BE
    ];
    return magics.some((magic) => buffer.equals(magic));
  } catch {
    return false;
  }
}

function signFlat(target) {
  run("codesign", ["--force", "--sign", SIGN_IDENTITY, "--timestamp=none", target]);
}

function verifyStrict(target) {
  run("codesign", ["--verify", "--strict", target]);
}

if (!existsSync(appBundle)) fail(`bundle not found: ${appBundle}`);

const frameworksDir = join(appBundle, "Contents", "Frameworks");
const electronFramework = join(frameworksDir, "Electron Framework.framework");
const electronVersionA = join(electronFramework, "Versions", "A");

// 1. Deepest code first: dylibs and helper executables inside Electron Framework.
const nestedLeaves = [];
const librariesDir = join(electronVersionA, "Libraries");
if (existsSync(librariesDir)) {
  for (const entry of readdirSync(librariesDir)) {
    const candidate = join(librariesDir, entry);
    if (isMachO(candidate)) nestedLeaves.push(candidate);
  }
}
const crashpad = join(electronVersionA, "Helpers", "chrome_crashpad_handler");
if (existsSync(crashpad)) nestedLeaves.push(crashpad);

// Squirrel ships the ShipIt helper executable inside its Resources.
const shipIt = join(frameworksDir, "Squirrel.framework", "Versions", "A", "Resources", "ShipIt");
if (existsSync(shipIt) && isMachO(shipIt)) nestedLeaves.push(shipIt);

for (const leaf of nestedLeaves) signFlat(leaf);

// 2. Frameworks (sign the versioned bundle, which seals its own resources).
const frameworkBundles = existsSync(frameworksDir)
  ? readdirSync(frameworksDir).filter((entry) => entry.endsWith(".framework")).map((entry) => join(frameworksDir, entry))
  : [];
if (!frameworkBundles.length) fail("no frameworks found in bundle (incomplete package)");
for (const framework of frameworkBundles) signFlat(framework);

// 3. Helper apps.
const helperApps = readdirSync(frameworksDir).filter((entry) => entry.endsWith(".app")).map((entry) => join(frameworksDir, entry));
if (!helperApps.length) fail("no helper apps found in bundle (incomplete package)");
for (const helper of helperApps) signFlat(helper);

// 4. Outer bundle last (never --deep: components above are already valid).
signFlat(appBundle);

// --- Verification gate ---
const mainBinary = join(appBundle, "Contents", "MacOS", "BotApp");
if (!existsSync(mainBinary)) fail("main executable missing");

const lipo = run("lipo", ["-info", mainBinary]);
if (!/arm64/.test(lipo)) fail(`main executable is not arm64: ${lipo.trim()}`);

const checks = [mainBinary, ...frameworkBundles, ...helperApps, appBundle];
for (const target of checks) {
  try {
    verifyStrict(target);
  } catch (error) {
    fail(`signature verification failed for ${target.replace(repoRoot, "")}: ${error.message}`);
  }
}

try {
  run("codesign", ["--verify", "--deep", "--strict", appBundle]);
} catch (error) {
  fail(`deep strict verification failed for bundle: ${error.message}`);
}

const display = run("codesign", ["--display", "--verbose=2", appBundle]);
const flagsLine = display.split("\n").find((line) => line.startsWith("CodeDirectory")) || "";
console.log(`[sign-gate] OK: bundle signed (${SIGN_IDENTITY === "-" ? "ad hoc local" : "identity"}), ${checks.length} components verified, arm64 confirmed.`);
console.log(`[sign-gate] ${flagsLine.trim()}`);

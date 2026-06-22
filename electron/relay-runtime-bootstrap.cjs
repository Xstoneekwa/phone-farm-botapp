const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  clearRelayKeyFromSecureStore,
  isEncryptionAvailable,
  loadRelayKeyFromSecureStore,
  readDisabledRuntimeConfigBackup,
  relayKeyBlobPath,
  saveRelayKeyToSecureStore,
} = require("./relay-credential-store.cjs");

const CANONICAL_USER_DATA_NAME = "BotApp";
const LEGACY_USER_DATA_DIR_NAMES = [
  "botapp-mac-foundation",
  "com.boostmybusinesses.botapp",
];

function applicationSupportRoot() {
  return path.join(os.homedir(), "Library", "Application Support");
}

function canonicalUserDataDir() {
  return path.join(applicationSupportRoot(), CANONICAL_USER_DATA_NAME);
}

function legacyUserDataDirs(activeDir = canonicalUserDataDir()) {
  const root = applicationSupportRoot();
  return LEGACY_USER_DATA_DIR_NAMES
    .map((name) => path.join(root, name))
    .filter((dir) => dir !== activeDir && fs.existsSync(dir));
}

function runtimeConfigPath(userDataDir) {
  return path.join(userDataDir, "botapp-runtime-config.json");
}

function readRuntimeConfigFile(userDataDir) {
  try {
    const parsed = JSON.parse(fs.readFileSync(runtimeConfigPath(userDataDir), "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function isLocalRelayHost(urlValue) {
  try {
    const hostname = new URL(String(urlValue || "").trim()).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function relayUrlScore(urlValue) {
  const normalized = String(urlValue || "").trim();
  if (!normalized) return 0;
  if (isLocalRelayHost(normalized)) return 1;
  return 2;
}

function readRelayCandidateFromDir(userDataDir) {
  const config = readRuntimeConfigFile(userDataDir);
  const disabled = readDisabledRuntimeConfigBackup(userDataDir);
  const secureKey = loadRelayKeyFromSecureStore(userDataDir);
  const jsonKey = typeof config.botappRelayKey === "string" ? config.botappRelayKey.trim() : "";
  const url = typeof config.compassAiRelayUrl === "string" ? config.compassAiRelayUrl.trim() : "";
  const disabledUrl = disabled?.compassAiRelayUrl || "";
  const disabledKey = disabled?.botappRelayKey || "";
  const bestUrl = relayUrlScore(url) >= relayUrlScore(disabledUrl) ? url : disabledUrl;
  const bestKey = secureKey || jsonKey || disabledKey;
  return {
    sourceDir: userDataDir,
    relayUrl: bestUrl,
    relayKey: bestKey,
    relayUrlScore: relayUrlScore(bestUrl),
    hasSecureBlob: fs.existsSync(relayKeyBlobPath(userDataDir)),
    hasJsonKey: Boolean(jsonKey),
    hasDisabledBackup: Boolean(disabled),
  };
}

function pickBestRelayCandidate(candidates) {
  return [...candidates]
    .filter((candidate) => candidate.relayUrl || candidate.relayKey)
    .sort((left, right) => {
      if (right.relayUrlScore !== left.relayUrlScore) return right.relayUrlScore - left.relayUrlScore;
      if (Boolean(right.relayKey) !== Boolean(left.relayKey)) return Number(Boolean(right.relayKey)) - Number(Boolean(left.relayKey));
      if (Boolean(right.hasSecureBlob) !== Boolean(left.hasSecureBlob)) {
        return Number(Boolean(right.hasSecureBlob)) - Number(Boolean(left.hasSecureBlob));
      }
      return 0;
    })[0] || null;
}

function copySecureBlobIfMissing(fromDir, toDir) {
  const source = relayKeyBlobPath(fromDir);
  const target = relayKeyBlobPath(toDir);
  if (!fs.existsSync(source) || fs.existsSync(target)) return false;
  fs.mkdirSync(toDir, { recursive: true });
  fs.copyFileSync(source, target);
  fs.chmodSync(target, 0o600);
  return true;
}

function writeRuntimeConfigFile(userDataDir, nextConfig) {
  const current = readRuntimeConfigFile(userDataDir);
  const merged = { ...current, ...nextConfig };
  for (const key of Object.keys(merged)) {
    if (merged[key] === undefined) delete merged[key];
  }
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(runtimeConfigPath(userDataDir), JSON.stringify(merged, null, 2), { mode: 0o600 });
  return merged;
}

function stripRelayKeyFromRuntimeConfig(userDataDir) {
  const current = readRuntimeConfigFile(userDataDir);
  if (!("botappRelayKey" in current)) return current;
  delete current.botappRelayKey;
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(runtimeConfigPath(userDataDir), JSON.stringify(current, null, 2), { mode: 0o600 });
  return current;
}

function clientSafeBootstrapState(input) {
  const {
    userDataDir,
    relayUrlConfigured,
    relayKeyConfigured,
    secureStorageAvailable,
    importedFrom,
    repairState,
    lastError,
  } = input;
  return {
    userDataDir,
    relayUrlConfigured,
    relayKeyConfigured,
    secureStorageAvailable,
    importedFrom: importedFrom || null,
    repairState,
    lastError: lastError || null,
    checkedAt: new Date().toISOString(),
  };
}

function resolveRepairState({ relayUrlConfigured, relayKeyConfigured, secureStorageAvailable, importedFrom, lastError }) {
  if (lastError === "secure_storage_unavailable" && !relayKeyConfigured) {
    return "keychain_unavailable";
  }
  if (relayUrlConfigured && relayKeyConfigured) {
    return importedFrom ? "connection_restored" : "connection_ready";
  }
  if (relayUrlConfigured && !relayKeyConfigured) {
    return "initial_association_required";
  }
  if (!relayUrlConfigured && relayKeyConfigured) {
    return "backend_unavailable";
  }
  return "initial_association_required";
}

function bootstrapRelayRuntime(options = {}) {
  const forceRestore = options.forceRestore === true;
  const userDataDir = options.userDataDir || canonicalUserDataDir();
  const envRelayUrl = String(options.envRelayUrl || "").trim();
  const envRelayKey = String(options.envRelayKey || "").trim();
  const secureStorageAvailable = (options.secureStorage?.available ?? isEncryptionAvailable()) === true;
  const secureStorage = options.secureStorage || {
    available: secureStorageAvailable,
    load: (dir) => loadRelayKeyFromSecureStore(dir),
    save: (dir, key) => saveRelayKeyToSecureStore(dir, key),
  };

  const searchDirs = [
    userDataDir,
    ...(Array.isArray(options.legacyDirs) ? options.legacyDirs : legacyUserDataDirs(userDataDir)),
  ].filter((dir, index, all) => dir && all.indexOf(dir) === index);
  const readCandidate = (dir) => {
    const config = readRuntimeConfigFile(dir);
    const disabled = readDisabledRuntimeConfigBackup(dir);
    const secureKey = secureStorage.load(dir);
    const jsonKey = typeof config.botappRelayKey === "string" ? config.botappRelayKey.trim() : "";
    const url = typeof config.compassAiRelayUrl === "string" ? config.compassAiRelayUrl.trim() : "";
    const disabledUrl = disabled?.compassAiRelayUrl || "";
    const disabledKey = disabled?.botappRelayKey || "";
    const bestUrl = relayUrlScore(url) >= relayUrlScore(disabledUrl) ? url : disabledUrl;
    const bestKey = secureKey || jsonKey || disabledKey;
    return {
      sourceDir: dir,
      relayUrl: bestUrl,
      relayKey: bestKey,
      relayUrlScore: relayUrlScore(bestUrl),
      hasSecureBlob: fs.existsSync(relayKeyBlobPath(dir)),
      hasJsonKey: Boolean(jsonKey),
      hasDisabledBackup: Boolean(disabled),
    };
  };
  const candidates = searchDirs.map((dir) => readCandidate(dir));
  let current = readCandidate(userDataDir);
  let importedFrom = null;

  if (forceRestore || !current.relayUrl || !current.relayKey || isLocalRelayHost(current.relayUrl)) {
    const best = pickBestRelayCandidate(candidates);
    if (best && (best.relayUrlScore > current.relayUrlScore || !current.relayKey || !current.relayUrl || forceRestore)) {
      if (best.sourceDir !== userDataDir) {
        copySecureBlobIfMissing(best.sourceDir, userDataDir);
        importedFrom = path.basename(best.sourceDir);
      }
      current = {
        ...current,
        relayUrl: best.relayUrl || current.relayUrl,
        relayKey: best.relayKey || current.relayKey,
        relayUrlScore: Math.max(current.relayUrlScore, best.relayUrlScore),
      };
    }
  }

  const relayUrl = options.normalizeRelayUrl(envRelayUrl || current.relayUrl || "");
  let relayKey = envRelayKey || secureStorage.load(userDataDir) || current.relayKey || "";
  if (!relayKey) {
    relayKey = readCandidate(userDataDir).relayKey || "";
  }

  if (relayUrl) {
    writeRuntimeConfigFile(userDataDir, { compassAiRelayUrl: relayUrl });
  }

  if (relayKey) {
    if (secureStorage.save(userDataDir, relayKey)) {
      stripRelayKeyFromRuntimeConfig(userDataDir);
    } else {
      writeRuntimeConfigFile(userDataDir, { botappRelayKey: relayKey });
    }
  }

  const finalConfig = readRuntimeConfigFile(userDataDir);
  const finalKey = envRelayKey
    || secureStorage.load(userDataDir)
    || (typeof finalConfig.botappRelayKey === "string" ? finalConfig.botappRelayKey.trim() : "");
  const finalUrl = options.normalizeRelayUrl(envRelayUrl || finalConfig.compassAiRelayUrl || "");
  const relayUrlConfigured = Boolean(finalUrl);
  const relayKeyConfigured = Boolean(finalKey);
  const repairState = resolveRepairState({
    relayUrlConfigured,
    relayKeyConfigured,
    secureStorageAvailable,
    importedFrom,
    lastError: relayKeyConfigured || !secureStorageAvailable ? null : "secure_storage_unavailable",
  });

  return clientSafeBootstrapState({
    userDataDir,
    relayUrlConfigured,
    relayKeyConfigured,
    secureStorageAvailable,
    importedFrom,
    repairState,
    lastError: repairState === "keychain_unavailable" ? "secure_storage_unavailable" : null,
  });
}

function writeBootstrapStatus(userDataDir, status) {
  try {
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(
      path.join(userDataDir, "botapp-relay-bootstrap.status.json"),
      JSON.stringify(status, null, 2),
      { mode: 0o600 },
    );
  } catch {
    // Non-blocking diagnostics only.
  }
}

module.exports = {
  CANONICAL_USER_DATA_NAME,
  bootstrapRelayRuntime,
  canonicalUserDataDir,
  clearRelayKeyFromSecureStore,
  clientSafeBootstrapState,
  isEncryptionAvailable,
  legacyUserDataDirs,
  loadRelayKeyFromSecureStore,
  readRuntimeConfigFile,
  relayKeyBlobPath,
  resolveRepairState,
  runtimeConfigPath,
  saveRelayKeyToSecureStore,
  stripRelayKeyFromRuntimeConfig,
  writeBootstrapStatus,
  writeRuntimeConfigFile,
};

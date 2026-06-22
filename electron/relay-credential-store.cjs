const fs = require("node:fs");
const path = require("node:path");
const { safeStorage } = require("electron");

const RELAY_KEY_BLOB = "botapp-relay-key.enc";
const DISABLED_PREFIX = "botapp-runtime-config.json.disabled.";

function isEncryptionAvailable() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function relayKeyBlobPath(userDataDir) {
  return path.join(userDataDir, RELAY_KEY_BLOB);
}

function loadRelayKeyFromSecureStore(userDataDir) {
  const blobPath = relayKeyBlobPath(userDataDir);
  if (!fs.existsSync(blobPath) || !isEncryptionAvailable()) return "";
  try {
    const encrypted = fs.readFileSync(blobPath);
    return safeStorage.decryptString(encrypted).trim();
  } catch {
    return "";
  }
}

function saveRelayKeyToSecureStore(userDataDir, relayKey) {
  const normalized = String(relayKey || "").trim();
  if (!normalized || !isEncryptionAvailable()) return false;
  try {
    const encrypted = safeStorage.encryptString(normalized);
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(relayKeyBlobPath(userDataDir), encrypted, { mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

function clearRelayKeyFromSecureStore(userDataDir) {
  try {
    fs.unlinkSync(relayKeyBlobPath(userDataDir));
  } catch {
    // Ignore missing blob.
  }
}

function listDisabledRuntimeConfigBackups(userDataDir) {
  try {
    return fs.readdirSync(userDataDir)
      .filter((name) => name.startsWith(DISABLED_PREFIX))
      .map((name) => path.join(userDataDir, name))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

function readDisabledRuntimeConfigBackup(userDataDir) {
  for (const backupPath of listDisabledRuntimeConfigBackups(userDataDir)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(backupPath, "utf8"));
      if (parsed && typeof parsed === "object") {
        return {
          backupPath,
          compassAiRelayUrl: typeof parsed.compassAiRelayUrl === "string" ? parsed.compassAiRelayUrl.trim() : "",
          botappRelayKey: typeof parsed.botappRelayKey === "string" ? parsed.botappRelayKey.trim() : "",
        };
      }
    } catch {
      // Try the next backup.
    }
  }
  return null;
}

module.exports = {
  DISABLED_PREFIX,
  clearRelayKeyFromSecureStore,
  isEncryptionAvailable,
  listDisabledRuntimeConfigBackups,
  loadRelayKeyFromSecureStore,
  readDisabledRuntimeConfigBackup,
  relayKeyBlobPath,
  saveRelayKeyToSecureStore,
};

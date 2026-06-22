const BOTAPP_OPEN_DEVICE_HOST = "open-device-view";

function parseOpenDeviceViewDeepLink(rawUrl) {
  try {
    const url = new URL(String(rawUrl || ""));
    if (url.protocol !== "botapp:" || url.hostname !== BOTAPP_OPEN_DEVICE_HOST) {
      return { ok: false, reason: "unsupported_botapp_link" };
    }
    const intent = url.searchParams.get("intent");
    if (!intent) return { ok: false, reason: "missing_intent" };
    return { ok: true, intent };
  } catch {
    return { ok: false, reason: "malformed_botapp_link" };
  }
}

function findOpenDeviceViewDeepLink(argv = []) {
  for (const entry of argv) {
    const value = String(entry || "");
    if (value.startsWith("botapp://open-device-view")) {
      return value;
    }
  }
  return null;
}

module.exports = {
  BOTAPP_OPEN_DEVICE_HOST,
  parseOpenDeviceViewDeepLink,
  findOpenDeviceViewDeepLink,
};

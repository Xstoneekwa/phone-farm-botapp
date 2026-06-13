export type AddProfileCredentialsPayload = {
  credentials_status?: string | null;
  status?: string | null;
  reauth_required?: boolean | null;
};

export type AddProfileCreatePayload = {
  credentials_configured?: boolean;
  credential_status?: string | null;
  credential_save_status?: string | null;
  credentials?: AddProfileCredentialsPayload | null;
};

export type AddProfileCredentialsResolution = {
  saveStepStatus: "done" | "failed" | "skipped";
  credentialsConfigured: boolean;
  loginVerificationPending: boolean;
  globalStatus: "done" | "partial" | "failed";
  credentialsLogMessage: string;
  footerMessage: string;
};

const savedCredentialStatuses = new Set(["active", "saved_pending_verification"]);

function readString(value: unknown, fallback = "") {
  if (typeof value === "string") return value.trim() || fallback;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function normalizeStatus(value: unknown) {
  return readString(value).toLowerCase();
}

function readCredentials(data: Record<string, unknown> | undefined) {
  const credentials = data?.credentials;
  if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)) return null;
  return credentials as AddProfileCredentialsPayload;
}

function credentialsSavedFromPayload(data: Record<string, unknown> | undefined) {
  if (!data) return false;
  if (data.credentials_configured === true) return true;
  if (normalizeStatus(data.credential_save_status) === "saved") return true;

  const credentialStatus = normalizeStatus(data.credential_status);
  if (savedCredentialStatuses.has(credentialStatus)) return true;

  const credentials = readCredentials(data);
  if (!credentials) return false;

  const rowStatus = normalizeStatus(credentials.status);
  const credentialsStatus = normalizeStatus(credentials.credentials_status);
  if (rowStatus === "active" && savedCredentialStatuses.has(credentialsStatus)) return true;
  return rowStatus === "active" && credentials.reauth_required === true;
}

export function resolveAddProfileCredentialsState(
  data: Record<string, unknown> | undefined,
  credentialsRequested: boolean,
  username: string,
): AddProfileCredentialsResolution {
  const normalizedUsername = username.trim().replace(/^@+/, "") || "unknown";

  if (!credentialsRequested) {
    return {
      saveStepStatus: "skipped",
      credentialsConfigured: false,
      loginVerificationPending: false,
      globalStatus: "done",
      credentialsLogMessage: "Credentials skipped by manual login mode.",
      footerMessage: `Profile created: @${normalizedUsername}`,
    };
  }

  const credentialsConfigured = credentialsSavedFromPayload(data);
  const credentials = readCredentials(data);
  const loginVerificationPending = credentialsConfigured && (
    credentials?.reauth_required === true
    || normalizeStatus(data?.credential_status) === "saved_pending_verification"
    || normalizeStatus(credentials?.credentials_status) === "saved_pending_verification"
  );

  if (!credentialsConfigured) {
    return {
      saveStepStatus: "failed",
      credentialsConfigured: false,
      loginVerificationPending: false,
      globalStatus: "partial",
      credentialsLogMessage: "Credentials not saved - update required.",
      footerMessage: `Profile created, but credentials were not saved. Update credentials before Auto Login.`,
    };
  }

  if (loginVerificationPending) {
    return {
      saveStepStatus: "done",
      credentialsConfigured: true,
      loginVerificationPending: true,
      globalStatus: "done",
      credentialsLogMessage: "Credentials saved to secure backend.",
      footerMessage: `Profile created · @${normalizedUsername} · credentials saved · login verification required`,
    };
  }

  return {
    saveStepStatus: "done",
    credentialsConfigured: true,
    loginVerificationPending: false,
    globalStatus: "done",
    credentialsLogMessage: "Credentials saved to secure backend.",
    footerMessage: `Profile created: @${normalizedUsername} · credentials saved`,
  };
}

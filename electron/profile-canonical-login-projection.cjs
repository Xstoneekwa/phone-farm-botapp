function normalized(value) {
  return String(value ?? "").trim().toLowerCase();
}

function first(account, keys) {
  for (const key of keys) {
    const value = account?.[key];
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function readCanonicalLoginIdentity(account) {
  const proofStatus = normalized(first(account, ["loginIdentityProofStatus", "login_identity_proof_status"]));
  const profileOpened = first(account, ["loginIdentityProfileOpened", "login_identity_profile_opened"]) === true;
  const usernameMatch = first(account, ["loginIdentityUsernameMatch", "login_identity_username_match"]) === true;
  const verifiedAt = String(first(account, ["loginIdentityVerifiedAt", "login_identity_verified_at"]) ?? "").trim();
  return {
    proofStatus: proofStatus || "missing",
    profileOpened,
    usernameMatch,
    verifiedAt: verifiedAt || null,
    verified: proofStatus === "verified" && profileOpened && usernameMatch && Boolean(verifiedAt),
  };
}

function readCanonicalReadinessStatus(account) {
  const nested = account?.readinessProjection || account?.readiness_projection || {};
  return normalized(
    nested?.overall_readiness_status
      || nested?.overallReadinessStatus
      || account?.readiness
      || account?.readinessStatus
      || account?.readiness_status,
  );
}

function readCanonicalLoginStatus(account) {
  const raw = normalized(account?.loginStatus || account?.login_status || account?.credentialsStatus);
  if (raw.includes("challenge") || raw.includes("verification_code")) return "challenge_required";
  if (raw.includes("2fa")) return "needs_2fa";
  if (raw.includes("checkpoint")) return "checkpoint";
  if (raw.includes("password_invalid")) return "password_invalid";
  if (raw.includes("missing")) return "missing_credentials";
  if (raw.includes("logged_out")) return "logged_out";
  if (!readCanonicalLoginIdentity(account).verified) return "unknown";
  return raw === "connected" ? "connected" : "unknown";
}

function canonicalIdentityBlockReason(account) {
  const identity = readCanonicalLoginIdentity(account);
  if (identity.verified) return "";
  if (identity.proofStatus === "failed" || identity.proofStatus === "proven_false_ready") {
    return "login_identity_mismatch";
  }
  return identity.proofStatus === "missing"
    ? "login_identity_proof_missing"
    : `login_identity_${identity.proofStatus}`;
}

module.exports = {
  canonicalIdentityBlockReason,
  readCanonicalLoginIdentity,
  readCanonicalLoginStatus,
  readCanonicalReadinessStatus,
};

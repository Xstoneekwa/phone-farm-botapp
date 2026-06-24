import type { BotProfile, ProfileRestoreLoginScreenPayload } from "../../api/types";

export function buildRestoreLoginScreenPayload(profile: BotProfile): ProfileRestoreLoginScreenPayload {
  return {
    account_id: profile.id,
    source: "BotApp",
    idempotency_key: `botapp:${profile.username}:restore-login-screen:${Date.now()}`,
  };
}

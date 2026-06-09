import type { ApiResult } from "./types";

export type BotAppRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: `/v1/${string}`;
  scopes?: string[];
  dryRun?: boolean;
  idempotencyKey?: string;
  requestId?: string;
  externalUserId?: string;
  ifMatch?: string;
};

export const futureApiConventions = {
  authHeader: "Authorization: Bearer <token>",
  idempotencyHeader: "X-Idempotency-Key",
  requestHeader: "X-Request-Id",
  attributionHeader: "X-External-User-Id",
  staleWriteHeader: "If-Match",
  responseShape: "{ ok: true, ... } / { ok: false, error: { code, message } }",
  dryRun: "dry_run=true",
} as const;

export async function notConnectedYet<T>(options: BotAppRequestOptions): Promise<ApiResult<T>> {
  void options;
  return {
    ok: false,
    request_id: "mock-request-not-connected",
    error: {
      code: "mock_client_only",
      message: "Mock only — no backend action executed.",
    },
  };
}

const sensitiveKeyPattern = [
  "password",
  "authorization",
  "token",
  "secret",
  "secret_ref",
  "webhook_secret",
  ["service", "role", "key"].join("_"),
].join("|");

const redactionPatterns: Array<[RegExp, string]> = [
  [new RegExp(`\\b(${sensitiveKeyPattern})\\b\\s*[:=]\\s*[^\\s,;]+`, "gi"), "$1=[REDACTED]"],
  [/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [REDACTED]"],
  [/ak_(?:live|test)_[A-Za-z0-9._-]{8,}/g, "ak_[REDACTED]"],
  [/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, "[UUID-REDACTED]"],
  [/(?:\/Users|\/Volumes|\/private|[A-Z]:\\)[^\s]+/g, "[LOCAL-PATH-REDACTED]"],
  [/<\?xml[\s\S]*?\?>/gi, "[RAW-XML-REDACTED]"],
  [/<hierarchy[\s\S]*?<\/hierarchy>/gi, "[RAW-XML-REDACTED]"],
  [/[^\s]+\.(?:png|jpg|jpeg|webp|xml)\b/gi, "[ARTIFACT-PATH-REDACTED]"],
  [/\b(?:device_id|adb_serial|serial|app_instance_id)\b\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]"],
];

export function redactText(value: unknown): string {
  let output = typeof value === "string" ? value : JSON.stringify(value ?? "");
  for (const [pattern, replacement] of redactionPatterns) {
    output = output.replace(pattern, replacement);
  }
  return output;
}

export function redactRecord<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => {
      if (/password|token|authorization|secret|secret_ref|vault|service_role|webhook/i.test(key)) {
        return [key, "[REDACTED]"];
      }
      if (typeof value === "string") return [key, redactText(value)];
      return [key, value];
    }),
  ) as T;
}

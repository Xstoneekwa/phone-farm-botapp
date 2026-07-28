import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const contract = require("./relay-read-contract.cjs");

test("Profiles timeout is classified independently", () => {
  assert.equal(contract.normalizeRelayReadError({ name: "TimeoutError" }).kind, "timeout");
});

test("Profiles 401 is classified as relay authentication failure", () => {
  assert.equal(contract.relayErrorKindForStatus(401), "auth_failed");
});

test("Profiles transient 500 is classified as backend unavailable", () => {
  assert.equal(contract.relayErrorKindForStatus(503), "backend_unavailable");
});

test("Profiles malformed payload is not presented as no profiles", () => {
  assert.equal(contract.normalizeRelayReadError(new SyntaxError("invalid JSON payload")).kind, "payload_malformed");
});

test("only transient reads receive one bounded retry", () => {
  assert.equal(contract.relayReadRetryable("timeout"), true);
  assert.equal(contract.relayReadRetryable("backend_unavailable"), true);
  assert.equal(contract.relayReadRetryable("auth_failed"), false);
  assert.equal(contract.relayReadRetryable("payload_malformed"), false);
  assert.equal(contract.RELAY_READ_TIMEOUT_MS, 8000);
});

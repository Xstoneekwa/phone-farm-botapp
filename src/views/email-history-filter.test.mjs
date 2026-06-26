import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const emailHistoryView = readFileSync(
  new URL("../../src/views/EmailHistory.tsx", import.meta.url),
  "utf8",
);

test("email history ui exposes client email filter only", () => {
  assert.match(emailHistoryView, /label="Client email"/);
  assert.match(emailHistoryView, /placeholder="client@example.com"/);
  assert.match(emailHistoryView, /client_email:/);
  assert.doesNotMatch(emailHistoryView, /Client ID/);
  assert.doesNotMatch(emailHistoryView, /Account ID/);
  assert.doesNotMatch(emailHistoryView, /client_id:/);
  assert.doesNotMatch(emailHistoryView, /account_id:/);
});

test("email history table and drawer show recipient snapshot without internal ids", () => {
  assert.match(emailHistoryView, /<th>Client email<\/th>/);
  assert.match(emailHistoryView, /<th>Instagram<\/th>/);
  assert.match(emailHistoryView, /<strong>Client email<\/strong>/);
  assert.doesNotMatch(emailHistoryView, /item\.clientId/);
  assert.doesNotMatch(emailHistoryView, /item\.accountId/);
});

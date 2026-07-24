import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { URL } from "node:url";

const source = readFileSync(new URL("./main.cjs", import.meta.url), "utf8");
const start = source.indexOf("async function incidentsOverview");
const end = source.indexOf("async function incidentsDetail", start);
const handler = source.slice(start, end);

test("incident relay sends filter, search, stable cursor and page size", () => {
  assert.match(handler, /filter:/);
  assert.match(handler, /search:/);
  assert.match(handler, /cursor:/);
  assert.match(handler, /limit:/);
  assert.match(handler, /include_test: "1"/);
});

test("incident relay distinguishes permission, invalid contract and backend unavailable", () => {
  assert.match(handler, /response\.status === 401 \|\| response\.status === 403/);
  assert.match(handler, /errorKind: "invalid_contract"/);
  assert.match(handler, /errorKind: "backend_unavailable"/);
  assert.doesNotMatch(handler, /response_body|JSON\.stringify\(body\)/);
});

test("incident relay accepts legacy and v2 successful payloads", () => {
  assert.match(handler, /Array\.isArray\(data\.incidents\)/);
  assert.match(handler, /incidents_overview_legacy/);
  assert.match(handler, /globalCounters/);
  assert.match(handler, /nextCursor/);
});

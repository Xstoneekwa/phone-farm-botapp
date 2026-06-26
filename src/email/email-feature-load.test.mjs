import assert from "node:assert/strict";
import test from "node:test";
import {
  canBrowseEmailHistory,
  canEditEmailTemplates,
  resolveEmailHistoryLoad,
  resolveEmailTemplatesLoad,
} from "./email-feature-load.ts";

const readyTemplates = {
  featureAvailable: true,
  fromEmail: "growth@boostmybusinesses.com",
  categories: ["account_paused"],
  templates: [{
    id: "",
    category: "account_paused",
    categoryLabel: "Account paused",
    version: 0,
    status: "retired",
    subject: "",
    bodyText: "",
    bodyHtml: "",
    allowedVariables: ["client_name"],
    configured: false,
    fromEmail: "growth@boostmybusinesses.com",
    createdAt: "",
    updatedAt: "",
    createdBy: "",
    updatedBy: "",
  }],
};

const pendingTemplates = { ...readyTemplates, featureAvailable: false };

const readyHistory = {
  featureAvailable: true,
  fromEmail: "growth@boostmybusinesses.com",
  page: 1,
  pageSize: 25,
  totalCount: 0,
  totalPages: 0,
  items: [],
};

test("missing table keeps templates pending and edit disabled", () => {
  const state = resolveEmailTemplatesLoad({ ok: true, data: pendingTemplates });
  assert.equal(state.status, "infrastructure_pending");
  assert.equal(canEditEmailTemplates(state), false);
});

test("tables present with zero templates keeps edit enabled and not configured", () => {
  const state = resolveEmailTemplatesLoad({ ok: true, data: readyTemplates });
  assert.equal(state.status, "ready");
  assert.equal(canEditEmailTemplates(state), true);
  assert.equal(state.projection.templates[0].configured, false);
});

test("truthy relay error body is not treated as ready projection", () => {
  const state = resolveEmailTemplatesLoad({
    ok: false,
    data: { ok: false, error: "relay auth failed" },
    error: "relay auth failed",
  });
  assert.equal(state.status, "relay_error");
  assert.equal(canEditEmailTemplates(state), false);
});

test("history ready with zero intents is active but empty", () => {
  const state = resolveEmailHistoryLoad({ ok: true, data: readyHistory });
  assert.equal(state.status, "ready");
  assert.equal(canBrowseEmailHistory(state), true);
  assert.equal(state.projection.totalCount, 0);
});

test("history missing table stays infrastructure pending", () => {
  const state = resolveEmailHistoryLoad({
    ok: true,
    data: { ...readyHistory, featureAvailable: false },
  });
  assert.equal(state.status, "infrastructure_pending");
  assert.equal(canBrowseEmailHistory(state), false);
});

test("real relay failure is distinct from missing table", () => {
  const state = resolveEmailHistoryLoad({ ok: false, error: "Email history unavailable." });
  assert.equal(state.status, "relay_error");
});

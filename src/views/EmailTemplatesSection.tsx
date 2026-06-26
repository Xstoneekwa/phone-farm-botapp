import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Drawer, Input } from "../design/components";
import type { BotAppEmailTemplateRow, BotAppEmailTemplatesProjection, BotAppEmailTestDeliveryStatus } from "../api/types";
import {
  canEditEmailTemplates,
  readEmailFeatureProjection,
  resolveEmailTemplatesLoad,
  type EmailFeatureLoadState,
} from "../email/email-feature-load";
import "./email-templates-section.css";

const LOCKED_FROM = "growth@boostmybusinesses.com";

const fallbackProjection = (): BotAppEmailTemplatesProjection => ({
  featureAvailable: false,
  fromEmail: LOCKED_FROM,
  categories: [
    "account_paused",
    "account_canceled",
    "needs_assistance",
    "needs_more_target_accounts",
  ],
  templates: [
    "account_paused",
    "account_canceled",
    "needs_assistance",
    "needs_more_target_accounts",
  ].map((category) => ({
    id: "",
    category: category as BotAppEmailTemplateRow["category"],
    categoryLabel: category.replaceAll("_", " "),
    version: 0,
    status: "retired",
    subject: "",
    bodyText: "",
    bodyHtml: "",
    allowedVariables: [],
    configured: false,
    fromEmail: LOCKED_FROM,
    createdAt: "",
    updatedAt: "",
    createdBy: "",
    updatedBy: "",
  })),
});

export function EmailTemplatesSection() {
  const [loadState, setLoadState] = useState<EmailFeatureLoadState<BotAppEmailTemplatesProjection>>({
    status: "infrastructure_pending",
    projection: fallbackProjection(),
    message: "Email infrastructure not enabled yet.",
  });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<BotAppEmailTemplateRow | null>(null);
  const [subjectDraft, setSubjectDraft] = useState("");
  const [bodyDraft, setBodyDraft] = useState("");
  const [previewSubject, setPreviewSubject] = useState("");
  const [previewBody, setPreviewBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [testStatus, setTestStatus] = useState<BotAppEmailTestDeliveryStatus | null>(null);
  const [testStatusLoading, setTestStatusLoading] = useState(false);
  const [testConfirmOpen, setTestConfirmOpen] = useState(false);
  const [testSending, setTestSending] = useState(false);

  const projection = readEmailFeatureProjection(loadState, fallbackProjection);
  const canEdit = canEditEmailTemplates(loadState);

  async function refresh() {
    setLoading(true);
    try {
      const result = await window.botappDesktop?.email?.listTemplates?.();
      const nextState = resolveEmailTemplatesLoad(result);
      if (nextState.status === "ready") {
        setLoadState(nextState);
      } else if (nextState.status === "infrastructure_pending") {
        setLoadState({
          ...nextState,
          projection: nextState.projection ?? fallbackProjection(),
        });
      } else {
        setLoadState(nextState);
      }
      setMessage(nextState.status === "ready" ? null : nextState.message);
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "Email templates unavailable.";
      setLoadState({ status: "relay_error", message: nextMessage });
      setMessage(nextMessage);
    } finally {
      setLoading(false);
    }
  }

  async function loadTestDeliveryStatus() {
    setTestStatusLoading(true);
    try {
      const result = await window.botappDesktop?.email?.testDeliveryStatus?.();
      if (result?.ok && result.data) setTestStatus(result.data);
      else setTestStatus(null);
    } finally {
      setTestStatusLoading(false);
    }
  }

  async function sendTestDelivery() {
    if (!editing || !testStatus?.canSendTest) return;
    setTestSending(true);
    try {
      const result = await window.botappDesktop?.email?.sendTestDelivery?.({ category: editing.category });
      if (!result?.ok) {
        setMessage(result?.error ?? "Test delivery could not be sent.");
        return;
      }
      setMessage(result.data?.action === "already_sent"
        ? "Test delivery was already sent for this template key."
        : "Test delivery accepted by Postmark.");
      setTestConfirmOpen(false);
    } finally {
      setTestSending(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!editing) {
      setTestConfirmOpen(false);
      setTestStatus(null);
      return;
    }
    void loadTestDeliveryStatus();
  }, [editing?.category]);

  async function runPreview() {
    if (!editing) return;
    const result = await window.botappDesktop?.email?.previewTemplate?.({
      subject: subjectDraft,
      bodyText: bodyDraft,
    });
    if (!result?.ok || !result.data?.preview) {
      setMessage(result?.error ?? "Preview unavailable.");
      return;
    }
    setPreviewSubject(result.data.preview.subject);
    setPreviewBody(result.data.preview.bodyText);
    setMessage("Preview generated with safe demonstration values.");
  }

  async function saveTemplate() {
    if (!editing || !canEdit) return;
    setSaving(true);
    try {
      const result = await window.botappDesktop?.email?.saveTemplate?.({
        category: editing.category,
        subject: subjectDraft,
        bodyText: bodyDraft,
      });
      if (!result?.ok) {
        setMessage(result?.error ?? "Template could not be saved.");
        return;
      }
      if (result.data?.template) {
        setLoadState({
          status: "ready",
          projection: {
            ...projection,
            featureAvailable: true,
            templates: projection.templates.map((row) => (
              row.category === result.data!.template!.category ? result.data!.template! : row
            )),
          },
        });
      }
      setMessage(result.data?.created_new_version
        ? `Saved ${editing.categoryLabel} as version ${result.data.template?.version}.`
        : `No changes detected for ${editing.categoryLabel}.`);
      setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  const helperText = useMemo(() => {
    if (loadState.status === "ready") {
      return "Templates are versioned in the canonical backend. Saving creates a new active version and retires the previous one.";
    }
    if (loadState.status === "infrastructure_pending") {
      return "Email infrastructure not enabled yet. No writes are attempted until the backend migration is applied.";
    }
    return loadState.message;
  }, [loadState]);

  const badgeLabel = loadState.status === "ready"
    ? "Ready"
    : loadState.status === "infrastructure_pending"
      ? "Infrastructure pending"
      : "Relay unavailable";

  const testDeliveryDisabled = !editing?.configured
    || testStatusLoading
    || !testStatus?.canSendTest;

  const testDeliveryDisabledReason = editing && !editing.configured
    ? "Configure an active template before sending a test delivery."
    : testStatus?.disabledReason ?? "Test delivery gates are closed.";

  return (
    <Card title="Transactional Email Templates" subtitle="Edit subject and plain-text body from BotApp. Sender is locked server-side.">
      <div className="email-templates-section">
        <div className="email-templates-toolbar">
          <Badge tone={loadState.status === "ready" ? "success" : "warning"} dot>
            {badgeLabel}
          </Badge>
          <label>
            <span>Locked sender</span>
            <code>{LOCKED_FROM}</code>
          </label>
          <Button onClick={() => void refresh()} disabled={loading}>Refresh templates</Button>
        </div>
        <p className="email-templates-helper">{helperText}</p>
        {message ? <div className="email-templates-message">{message}</div> : null}
        <div className="email-templates-grid">
          {projection.templates.map((template) => (
            <article key={template.category} className="email-template-card">
              <div className="email-template-card-head">
                <div>
                  <h4>{template.categoryLabel}</h4>
                  <p>{template.configured ? `Version ${template.version}` : "Not configured yet"}</p>
                </div>
                <Badge tone={template.configured ? "success" : "neutral"}>
                  {template.configured ? "Configured" : "Not configured"}
                </Badge>
              </div>
              <dl>
                <div><dt>Last updated</dt><dd>{template.updatedAt || "—"}</dd></div>
                <div><dt>Subject preview</dt><dd>{template.subject || "—"}</dd></div>
                <div><dt>Allowed variables</dt><dd>{template.allowedVariables.map((v) => `{{${v}}}`).join(", ")}</dd></div>
              </dl>
              <Button
                disabled={!canEdit}
                onClick={() => {
                  setEditing(template);
                  setSubjectDraft(template.subject);
                  setBodyDraft(template.bodyText);
                  setPreviewSubject("");
                  setPreviewBody("");
                }}
              >
                Edit template
              </Button>
            </article>
          ))}
        </div>
      </div>

      {editing ? (
        <Drawer
          title="Transactional template"
          subtitle={editing.categoryLabel}
          wide
          onClose={() => setEditing(null)}
          footer={(
            <>
              <Button variant="ghost" onClick={() => void runPreview()}>Preview with demo values</Button>
              <Button variant="primary" disabled={saving || !canEdit} onClick={() => void saveTemplate()}>
                {saving ? "Saving…" : "Save new version"}
              </Button>
            </>
          )}
        >
          <div className="email-template-editor">
            <label>
              <span>Locked sender</span>
              <Input value={LOCKED_FROM} onChange={() => undefined} readOnly mono />
            </label>
            <label>
              <span>Subject</span>
              <Input value={subjectDraft} onChange={setSubjectDraft} />
            </label>
            <label>
              <span>Body (plain text)</span>
              <textarea value={bodyDraft} onChange={(event) => setBodyDraft(event.target.value)} rows={12} />
            </label>
            <div className="email-template-variables">
              <strong>Allowed variables</strong>
              <p>{editing.allowedVariables.map((v) => `{{${v}}}`).join(" · ")}</p>
            </div>
            {previewSubject ? (
              <div className="email-template-preview">
                <strong>Preview</strong>
                <p><span>Subject</span> {previewSubject}</p>
                <pre>{previewBody}</pre>
              </div>
            ) : null}
            <section className="email-template-test-delivery" aria-label="Internal test delivery">
              <strong>Send test delivery</strong>
              <p className="email-template-test-note">
                This sends one real test email to the configured test recipient.
              </p>
              <dl className="email-template-test-gates">
                <div><dt>Template</dt><dd>{editing.categoryLabel}</dd></div>
                <div><dt>Locked sender</dt><dd><code>{LOCKED_FROM}</code></dd></div>
                <div><dt>Test recipient</dt><dd>{testStatus?.testRecipientMasked ?? "Not configured"}</dd></div>
                <div><dt>Test gate</dt><dd>{testStatus?.testSendingEnabled ? "Enabled" : "Disabled"}</dd></div>
                <div><dt>Provider</dt><dd>{testStatus?.providerReady ? "Postmark ready" : "Not ready"}</dd></div>
                <div><dt>Schema</dt><dd>{testStatus?.testSchemaReady ? "Ready" : "Migration pending"}</dd></div>
              </dl>
              {!testStatus?.canSendTest ? (
                <p className="email-template-test-disabled">{testDeliveryDisabledReason}</p>
              ) : null}
              {testConfirmOpen ? (
                <div className="email-template-test-confirm">
                  <p>Confirm one internal test delivery to {testStatus?.testRecipientMasked ?? "the configured recipient"}?</p>
                  <div className="email-template-test-actions">
                    <Button variant="ghost" onClick={() => setTestConfirmOpen(false)} disabled={testSending}>Cancel</Button>
                    <Button variant="primary" disabled={testSending} onClick={() => void sendTestDelivery()}>
                      {testSending ? "Sending…" : "Confirm test delivery"}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  disabled={testDeliveryDisabled}
                  onClick={() => setTestConfirmOpen(true)}
                >
                  Send test delivery
                </Button>
              )}
            </section>
          </div>
        </Drawer>
      ) : null}
    </Card>
  );
}

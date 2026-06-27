import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Input } from "../design/components";
import type {
  BotAppEmailDeliverySettingsAudit,
  BotAppEmailDeliverySettingsProjection,
} from "../api/types";
import {
  deliverySettingsBadgeTone,
  formatDeliverySettingsSaveError,
  formatDeliverySettingsUxState,
} from "../email/delivery-settings-labels";
import "./email-delivery-settings-section.css";

const fallbackProjection = (): BotAppEmailDeliverySettingsProjection => ({
  schemaReady: false,
  settings: {
    activeFromEmail: "growth@boostmybusinesses.com",
    supportEmail: "growth@boostmybusinesses.com",
    configVersion: 1,
    source: "legacy_default",
    updatedAt: null,
  },
  senderSync: {
    status: "not_configured",
    message: "Sender identity sync is not configured.",
    lastRefreshedAt: null,
    confirmedSenders: [],
  },
  uxState: "schema_migration_pending",
  supportEmailEditable: false,
  senderChangeAllowed: false,
  senderRefreshAllowed: false,
  accountTokenConfigured: false,
});

export function EmailDeliverySettingsSection() {
  const [projection, setProjection] = useState<BotAppEmailDeliverySettingsProjection>(fallbackProjection());
  const [audit, setAudit] = useState<BotAppEmailDeliverySettingsAudit | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingSenders, setRefreshingSenders] = useState(false);
  const [savingSupport, setSavingSupport] = useState(false);
  const [savingSender, setSavingSender] = useState(false);
  const [supportDraft, setSupportDraft] = useState("growth@boostmybusinesses.com");
  const [selectedSender, setSelectedSender] = useState("growth@boostmybusinesses.com");
  const [senderConfirmOpen, setSenderConfirmOpen] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refreshSettings() {
    setLoading(true);
    try {
      const result = await window.botappDesktop?.email?.deliverySettings?.();
      if (result?.ok && result.data) {
        setProjection(result.data);
        setSupportDraft(result.data.settings.supportEmail);
        setSelectedSender(result.data.settings.activeFromEmail);
        setMessage(null);
      } else {
        setMessage(result?.error ?? "Delivery settings unavailable.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Delivery settings unavailable.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshSenderIdentities() {
    setRefreshingSenders(true);
    try {
      const result = await window.botappDesktop?.email?.refreshDeliverySenders?.();
      const projectionFromResponse = result?.data?.projection;
      if (projectionFromResponse) {
        setProjection(projectionFromResponse);
        setSelectedSender(projectionFromResponse.settings.activeFromEmail);
      }
      if (!result?.ok) {
        setMessage(result?.error ?? "Sender identities could not be refreshed.");
        return;
      }
      setMessage("Sender identities refreshed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sender identities could not be refreshed.");
    } finally {
      setRefreshingSenders(false);
    }
  }

  async function saveSupportEmail() {
    if (!projection.supportEmailEditable) return;
    setSavingSupport(true);
    try {
      const result = await window.botappDesktop?.email?.saveDeliverySettings?.({
        supportEmail: supportDraft,
        configVersion: projection.settings.configVersion,
      });
      if (!result?.ok || !result.data?.projection) {
        setMessage(formatDeliverySettingsSaveError(result?.error));
        return;
      }
      setProjection(result.data.projection);
      setMessage("Support email saved.");
    } catch (error) {
      setMessage(formatDeliverySettingsSaveError(error instanceof Error ? error.message : "Save failed."));
    } finally {
      setSavingSupport(false);
    }
  }

  async function saveActiveSender() {
    if (!projection.senderChangeAllowed) return;
    setSavingSender(true);
    try {
      const result = await window.botappDesktop?.email?.saveDeliverySettings?.({
        activeFromEmail: selectedSender,
        configVersion: projection.settings.configVersion,
        confirmed: true,
      });
      if (!result?.ok || !result.data?.projection) {
        setMessage(formatDeliverySettingsSaveError(result?.error));
        return;
      }
      setProjection(result.data.projection);
      setSenderConfirmOpen(false);
      setMessage("Active sender saved.");
    } catch (error) {
      setMessage(formatDeliverySettingsSaveError(error instanceof Error ? error.message : "Save failed."));
    } finally {
      setSavingSender(false);
    }
  }

  async function loadAudit() {
    const result = await window.botappDesktop?.email?.deliverySettingsAudit?.();
    if (result?.ok && result.data) {
      setAudit(result.data);
      setShowAudit(true);
      return;
    }
    setMessage(result?.error ?? "Audit unavailable.");
  }

  useEffect(() => {
    void refreshSettings();
  }, []);

  const badgeLabel = useMemo(
    () => formatDeliverySettingsUxState(projection.uxState),
    [projection.uxState],
  );

  const badgeTone = useMemo(
    () => deliverySettingsBadgeTone(projection.uxState),
    [projection.uxState],
  );

  const confirmedSenders = projection.senderSync.confirmedSenders;

  return (
    <Card
      title="Transactional delivery settings"
      subtitle="Manage the active sender and central {{support_email}} without sending email from this panel."
    >
      <div className="email-delivery-settings-section">
        <div className="email-delivery-settings-toolbar">
          <Badge tone={badgeTone} dot>
            {badgeLabel}
          </Badge>
          <Button onClick={() => void refreshSettings()} disabled={loading}>
            Refresh settings
          </Button>
          <Button variant="ghost" onClick={() => void loadAudit()}>
            View recent configuration changes
          </Button>
        </div>

        {message ? <div className="email-delivery-settings-message">{message}</div> : null}

        <div className="email-delivery-settings-grid">
          <section className="email-delivery-settings-panel" aria-label="Sender identity">
            <strong>Sender identity</strong>
            <dl>
              <div><dt>Active sender address</dt><dd><code>{projection.settings.activeFromEmail}</code></dd></div>
              <div><dt>Provider status</dt><dd>{projection.senderSync.message}</dd></div>
              <div><dt>Last refresh</dt><dd>{projection.senderSync.lastRefreshedAt ?? "Not refreshed yet"}</dd></div>
            </dl>
            <p className="email-delivery-settings-note">
              Add and verify a new sender in Postmark, then refresh here.
            </p>
            <p className="email-delivery-settings-note">
              Client lifecycle sending remains disabled.
            </p>
            <div className="email-delivery-settings-actions">
              <Button
                variant="ghost"
                disabled={!projection.senderRefreshAllowed || refreshingSenders}
                onClick={() => void refreshSenderIdentities()}
              >
                {refreshingSenders ? "Refreshing…" : "Refresh sender identities"}
              </Button>
            </div>
            <label>
              <span>Confirmed sender identities</span>
              <select
                value={selectedSender}
                disabled={!projection.senderChangeAllowed || confirmedSenders.length === 0}
                onChange={(event) => setSelectedSender(event.target.value)}
              >
                {confirmedSenders.length === 0 ? (
                  <option value={projection.settings.activeFromEmail}>{projection.settings.activeFromEmail}</option>
                ) : confirmedSenders.map((sender) => (
                  <option key={sender.email} value={sender.email}>
                    {sender.name ? `${sender.name} · ${sender.email}` : sender.email}
                  </option>
                ))}
              </select>
            </label>
            {senderConfirmOpen ? (
              <div className="email-delivery-settings-confirm">
                <p>Confirm active sender change to <code>{selectedSender}</code>?</p>
                <div className="email-delivery-settings-actions">
                  <Button variant="ghost" onClick={() => setSenderConfirmOpen(false)} disabled={savingSender}>Cancel</Button>
                  <Button variant="primary" disabled={savingSender || !projection.senderChangeAllowed} onClick={() => void saveActiveSender()}>
                    {savingSender ? "Saving…" : "Confirm sender change"}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                disabled={!projection.senderChangeAllowed || selectedSender === projection.settings.activeFromEmail}
                onClick={() => setSenderConfirmOpen(true)}
              >
                Save active sender
              </Button>
            )}
          </section>

          <section className="email-delivery-settings-panel" aria-label="Support email">
            <strong>Support email</strong>
            <p className="email-delivery-settings-note">
              Used for {"{{support_email}}"} in previews and future transactional messages.
            </p>
            <label>
              <span>Current support email</span>
              <Input
                value={supportDraft}
                onChange={setSupportDraft}
                readOnly={!projection.supportEmailEditable}
                mono
              />
            </label>
            <Button
              disabled={!projection.supportEmailEditable || savingSupport || supportDraft === projection.settings.supportEmail}
              onClick={() => void saveSupportEmail()}
            >
              {savingSupport ? "Saving…" : "Save support email"}
            </Button>
          </section>
        </div>

        {showAudit ? (
          <section className="email-delivery-settings-audit" aria-label="Recent configuration changes">
            <strong>Recent configuration changes</strong>
            {!audit?.schemaReady ? (
              <p className="email-delivery-settings-note">Delivery settings migration is not applied yet.</p>
            ) : audit.items.length === 0 ? (
              <p className="email-delivery-settings-note">No configuration changes recorded yet.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Sender</th>
                    <th>Support email</th>
                    <th>Author</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.items.map((row) => (
                    <tr key={`${row.changedAt}-${row.newConfigVersion}`}>
                      <td>{row.changedAt || "—"}</td>
                      <td>{row.previousActiveFromEmail} → {row.newActiveFromEmail}</td>
                      <td>{row.previousSupportEmail} → {row.newSupportEmail}</td>
                      <td>{row.changedBy || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ) : null}
      </div>
    </Card>
  );
}

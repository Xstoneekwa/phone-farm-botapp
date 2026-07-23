import { useEffect, useMemo, useState } from "react";
import { mockClient } from "../../../api/mock-client";
import { loadProfileDetails, mapApiTargetRow, type ProfileDetailsPayload } from "../../../api/profile-details";
import { formatTargetFbrDisplay } from "../../../api/target-fbr-display";
import type {
  BotProfile,
  ProfileTarget,
  ProfileTargetBulkImportResult,
  ProfileTargetEligibility,
  ProfileTargetExportFormat,
  ProfileTargetListFilter,
  ProfileTargetPerformance,
} from "../../../api/types";
import { Badge, Button, Drawer, Input } from "../../../design/components";
import { redactText } from "../../../security/redaction";

type TargetFeedbackTone = "info" | "success" | "warning" | "error";

type TargetFeedback = {
  tone: TargetFeedbackTone;
  message: string;
};

export function TargetsDrawer({ profile, onClose, onAction }: { profile: BotProfile; onClose: () => void; onAction: (label: string) => void }) {
  const [targets, setTargets] = useState<ProfileTarget[]>([]);
  const [query, setQuery] = useState("");
  const [listFilter, setListFilter] = useState<ProfileTargetListFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [singleUsername, setSingleUsername] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [message, setMessage] = useState("");
  const [targetFeedback, setTargetFeedback] = useState<TargetFeedback | null>(null);
  const [singleAddLoading, setSingleAddLoading] = useState(false);
  const [bulkAddLoading, setBulkAddLoading] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  async function loadTargetsFromBackend() {
    const result = await loadProfileDetails(profile.id);
    const payload = result.data as ProfileDetailsPayload | undefined;
    const targets = payload?.targets;
    if (result.ok && targets?.status === "connected") {
      const items = (targets.items ?? []) as Record<string, unknown>[];
      setTargets(items.map((row) => mapApiTargetRow(profile.id, row)));
      setLastUpdatedAt(formatDateTime(new Date().toISOString()));
      setMessage(items.length ? "" : "No targets returned from DB for this account.");
      return { ok: true, count: items.length };
    }
    const error = result.error ?? targets?.error ?? "Targets backend pending.";
    setTargets([]);
    setMessage(error);
    return { ok: false, error };
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (window.botappDesktop?.profiles?.details) {
        const result = await loadProfileDetails(profile.id);
        if (cancelled) return;
        const payload = result.data as ProfileDetailsPayload | undefined;
        const targets = payload?.targets;
        if (result.ok && targets?.status === "connected") {
          const items = (targets.items ?? []) as Record<string, unknown>[];
          setTargets(items.map((row) => mapApiTargetRow(profile.id, row)));
          setLastUpdatedAt(formatDateTime(new Date().toISOString()));
          setMessage(items.length ? "" : "No targets returned from DB for this account.");
          return;
        }
        setTargets([]);
        setMessage(result.error ?? targets?.error ?? "Targets backend pending.");
        return;
      }
      const result = await mockClient.getProfileTargets(profile.id);
      if (!cancelled && result.ok) {
        setTargets(result.data);
        setLastUpdatedAt(formatDateTime(new Date().toISOString()));
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [profile.id]);

  const filteredTargets = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return targets.filter((target) => {
      if (!matchesListFilter(target, listFilter)) return false;
      if (!needle) return true;
      return [
        target.username,
        target.canonicalUsername,
        target.status,
        target.verification,
        eligibilityLabel(target.eligibility),
        performanceLabel(target.performance),
        target.source,
        target.reason,
        target.verificationReason,
      ].filter(Boolean).join(" ").toLowerCase().includes(needle);
    });
  }, [listFilter, query, targets]);

  const counts = useMemo(() => ({
    total: targets.length,
    validEligible: targets.filter(isValidEligibleTarget).length,
    archived: targets.filter(isArchivedOrDeletedTarget).length,
    pendingReview: targets.filter(isPendingReviewTarget).length,
    rejected: targets.filter(isRejectedTarget).length,
  }), [targets]);

  const selectedVisible = filteredTargets.length > 0 && filteredTargets.every((target) => selected.has(target.id));
  const bulkResult = useMemo(() => parseBulkTargets(bulkText, targets), [bulkText, targets]);

  function notifyAction(label: string) {
    setMessage(label);
    onAction(label);
    setLastUpdatedAt(formatDateTime(new Date().toISOString()));
  }

  function refreshTargets() {
    if (window.botappDesktop?.profiles?.details) {
      void loadTargetsFromBackend().then((result) => {
        if (result.ok) {
          setSelected(new Set());
          notifyAction(`Targets refreshed from DB (${result.count}).`);
        }
      });
      return;
    }
    void mockClient.getProfileTargets(profile.id).then((result) => {
      if (result.ok) {
        setTargets(result.data);
        setSelected(new Set());
        notifyAction("Targets refreshed from local data.");
      }
    });
  }

  function toggleSelect(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelected(() => selectedVisible ? new Set() : new Set(filteredTargets.map((target) => target.id)));
  }

  function addTarget() {
    const username = normalizeUsername(singleUsername);
    if (!isValidUsername(username)) {
      setTargetFeedback({ tone: "error", message: "Error adding target · invalid username" });
      return;
    }
    if (targets.some((target) => !isArchivedOrDeletedTarget(target) && target.username === username)) {
      setTargetFeedback({ tone: "warning", message: `Duplicate @${username} · already exists` });
      return;
    }
    if (window.botappDesktop?.profiles?.addTarget) {
      setSingleAddLoading(true);
      setTargetFeedback({ tone: "info", message: `Adding @${username}...` });
      void window.botappDesktop.profiles.addTarget({ accountId: profile.id, username }).then(async (result) => {
        if (!result.ok) {
          setTargetFeedback(formatTargetAddError(username, result.error));
          return;
        }
        setSingleUsername("");
        await loadTargetsFromBackend();
        const row = (result.data?.row ?? {}) as Record<string, unknown>;
        setTargetFeedback(formatTargetAddSuccess(username, row, result.data as Record<string, unknown> | undefined));
      }).finally(() => {
        setSingleAddLoading(false);
      });
      return;
    }
    setTargets((current) => [{
      id: `${profile.id}_ct_mock_${Date.now()}`,
      accountId: profile.id,
      username,
      status: "pending_verification",
      verification: "pending",
      verificationReason: "queued_for_future_verification",
      eligibility: "unknown",
      followersCount: null,
      performance: "pending",
      followbackRatio: null,
      followsSent: null,
      followbacks: null,
      lastUsedAt: null,
      addedAt: new Date().toISOString(),
      source: "botapp",
      syncStatus: "pending",
    }, ...current]);
    setSingleUsername("");
    setTargetFeedback({ tone: "success", message: `Added @${username} · pending verification` });
  }

  function importBulk() {
    if (bulkResult.acceptedForVerification === 0) {
      setTargetFeedback({ tone: bulkResult.duplicates + bulkResult.alreadyExisting > 0 ? "warning" : "error", message: bulkEmptyMessage(bulkResult) });
      return;
    }
    if (window.botappDesktop?.profiles?.bulkAddTargets) {
      const usernames = bulkResult.normalizedUsernames;
      setBulkAddLoading(true);
      setTargetFeedback({ tone: "info", message: `Importing ${usernames.length} target${usernames.length === 1 ? "" : "s"}...` });
      void window.botappDesktop.profiles.bulkAddTargets({ accountId: profile.id, usernames }).then(async (result) => {
        if (!result.ok) {
          setTargetFeedback({ tone: "error", message: `Error importing targets · ${result.error ?? "backend unavailable"}` });
          return;
        }
        setBulkText("");
        await loadTargetsFromBackend();
        setTargetFeedback(formatBulkImportSuccess(result.data as Record<string, unknown> | undefined));
      }).finally(() => {
        setBulkAddLoading(false);
      });
      return;
    }
    const now = new Date().toISOString();
    const imported = bulkResult.normalizedUsernames.map((username, index): ProfileTarget => ({
      id: `${profile.id}_ct_bulk_${Date.now()}_${index}`,
      accountId: profile.id,
      username,
      status: "pending_verification",
      verification: "pending",
      verificationReason: "queued_for_future_verification",
      eligibility: "unknown",
      followersCount: null,
      performance: "pending",
      followbackRatio: null,
      followsSent: null,
      followbacks: null,
      lastUsedAt: null,
      addedAt: now,
      source: "botapp",
      batchId: "batch_mock_botapp",
      syncStatus: "pending",
    }));
    setTargets((current) => [...imported, ...current]);
    setBulkText("");
    setTargetFeedback({
      tone: "success",
      message: `Bulk import complete · accepted ${bulkResult.acceptedForVerification} · rejected ${bulkResult.invalid} · duplicates ${bulkResult.duplicates + bulkResult.alreadyExisting} · queued ${bulkResult.acceptedForVerification}`,
    });
  }

  function archiveTargets(ids: string[]) {
    if (!ids.length) return;
    if (!window.confirm(`${ids.length} target(s) will be archived. Continue?`)) return;
    if (window.botappDesktop?.profiles?.deleteTargets) {
      setMessage(`Archiving ${ids.length} target(s) through shared backend...`);
      void window.botappDesktop.profiles.deleteTargets({ accountId: profile.id, ids }).then(async (result) => {
        if (!result.ok) {
          setMessage(result.error ?? "Target archive failed.");
          return;
        }
        setSelected(new Set());
        await loadTargetsFromBackend();
        const archived = Number(result.data?.archived ?? ids.length);
        notifyAction(archived === 1 ? "Target archived in shared backend." : `${archived} targets archived in shared backend.`);
      });
      return;
    }
    const now = new Date().toISOString();
    setTargets((current) => current.map((target) => ids.includes(target.id) ? { ...target, status: "archived", archivedAt: now, reason: "backend_archive" } : target));
    setSelected(new Set());
    notifyAction(ids.length === 1 ? "Target archived locally." : `${ids.length} targets archived locally.`);
  }

  function resetTarget(id: string) {
    if (window.botappDesktop?.profiles?.resetTargets) {
      setMessage("Resetting target and requeueing verification through shared backend...");
      void window.botappDesktop.profiles.resetTargets({ accountId: profile.id, ids: [id], mode: "reset_and_requeue_verification" }).then(async (result) => {
        if (!result.ok) {
          setMessage(result.error ?? "Target reset failed.");
          return;
        }
        await loadTargetsFromBackend();
        const reset = Number(result.data?.reset ?? 1);
        const jobsQueued = Number(result.data?.jobs_queued ?? 0);
        notifyAction(reset === 1 ? `Target reset and verification requeued (${jobsQueued}).` : `${reset} targets reset and verification requeued (${jobsQueued}).`);
      });
      return;
    }
    setTargets((current) => current.map((target) => target.id === id ? {
      ...target,
      status: "pending_verification",
      verification: "pending",
      verificationReason: "manual_reset",
      eligibility: "unknown",
      reason: "manual_reset",
      syncStatus: "pending",
    } : target));
    notifyAction("Target reset to pending verification locally.");
  }

  function restoreTarget(id: string) {
    setMessage(`Restore target ${id.slice(0, 8)} backend pending. No changes were saved.`);
  }

  function exportTargets(format: ProfileTargetExportFormat) {
    const rows = filteredTargets.map(safeExportRow);
    const content = format === "json"
      ? JSON.stringify(rows, null, 2)
      : [
        "target_username,eligibility,performance,followers_count,fbr,added_at",
        ...rows.map((row) => [
          row.target_username,
          row.eligibility,
          row.performance,
          row.followers_count ?? "",
          row.fbr ?? "",
          row.added_at ?? "",
        ].map(csvEscape).join(",")),
      ].join("\n");
    const blob = new Blob([redactText(content)], { type: format === "json" ? "application/json" : "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `botapp-targets-${safeFilePart(profile.username)}-${new Date().toISOString().slice(0, 10)}.${format}`;
    link.click();
    URL.revokeObjectURL(url);
    notifyAction(`Exported ${rows.length} visible targets as ${format.toUpperCase()}.`);
  }

  return (
    <Drawer title="Targets" subtitle={`@${profile.username}`} wide panelClassName="drawer-panel-targets" onClose={onClose}>
      <div className="targets-panel">
        <div className="targets-stats-grid">
          <StatCard label="Total" value={counts.total} />
          <StatCard label="Valid / eligible" value={counts.validEligible} tone="success" />
          <StatCard label="Archived" value={counts.archived} tone="info" />
          <StatCard label="Pending / review" value={counts.pendingReview} tone="warning" />
          <StatCard label="Rejected" value={counts.rejected} tone="danger" />
        </div>

        <div className="targets-toolbar">
          <Input value={query} onChange={setQuery} placeholder="Filter by username, health, status..." />
          <div className="targets-filter-row" aria-label="Target status filters">
            {targetFilters.map((item) => (
              <button key={item.key} type="button" className={listFilter === item.key ? "target-filter active" : "target-filter"} onClick={() => setListFilter(item.key)}>
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="targets-actions-row">
          <Button variant="ghost" onClick={refreshTargets}>Refresh</Button>
          <Button variant="ghost" onClick={() => exportTargets("csv")} disabled={!filteredTargets.length}>Export CSV</Button>
          <Button variant="ghost" onClick={() => exportTargets("json")} disabled={!filteredTargets.length}>Export JSON</Button>
          <Button variant="danger" onClick={() => archiveTargets([...selected])} disabled={selected.size === 0}>Delete selected{selected.size ? ` (${selected.size})` : ""}</Button>
          <span className="subtle">Last update: <span className="mono">{lastUpdatedAt ?? "loading"}</span></span>
        </div>

        {message ? <div className="panel-message">{message}</div> : null}

        <div className="targets-form-grid">
          <section className="target-form-card">
            <h3>Add target</h3>
            <div className="target-add-row">
              <Input value={singleUsername} onChange={setSingleUsername} placeholder="Instagram username" />
              <Button variant="primary" onClick={addTarget} disabled={!singleUsername.trim() || singleAddLoading}>{singleAddLoading ? "Adding..." : "+ Add"}</Button>
            </div>
            {targetFeedback ? <InlineTargetFeedback feedback={targetFeedback} /> : null}
          </section>
          <section className="target-form-card">
            <h3>Bulk add (one per line)</h3>
            <textarea className="target-bulk-input" value={bulkText} onChange={(event) => setBulkText(event.target.value)} placeholder={"user_one\n@user_two\nuser_three"} rows={4} />
            <div className="target-bulk-footer">
              <span className="subtle">Parsed {bulkResult.totalSubmitted} · accepted {bulkResult.acceptedForVerification} · invalid {bulkResult.invalid} · duplicates {bulkResult.duplicates + bulkResult.alreadyExisting}</span>
              <Button variant="primary" onClick={importBulk} disabled={bulkAddLoading || bulkResult.totalSubmitted === 0}>{bulkAddLoading ? "Importing..." : "Import"}</Button>
            </div>
          </section>
        </div>

        <p className="targets-sync-note">
          Targets are added through the shared backend. BotApp never exposes provider credentials, local logs, or raw avatar URLs in the renderer.
        </p>

        <div className="targets-table-wrap">
          {filteredTargets.length ? (
            <table className="targets-table">
              <thead>
                <tr>
                  <th><input type="checkbox" checked={selectedVisible} onChange={toggleSelectAllVisible} aria-label="Select all visible targets" /></th>
                  <th>Username</th>
                  <th>Verification</th>
                  <th>Eligibility</th>
                  <th>Followers</th>
                  <th>Perf</th>
                  <th>FBR</th>
                  <th>Sent</th>
                  <th>Last used</th>
                  <th>Added</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTargets.map((target) => {
                  const archived = isArchivedOrDeletedTarget(target);
                  return (
                  <tr key={target.id}>
                    <td><input type="checkbox" checked={selected.has(target.id)} onChange={() => toggleSelect(target.id)} aria-label={`Select ${target.username}`} /></td>
                    <td>
                      <div className="target-user-cell">
                        <TargetAvatar target={target} />
                        <div><strong>@{redactText(target.username)}</strong>{target.canonicalUsername && target.canonicalUsername !== target.username ? <small>canonical @{redactText(target.canonicalUsername)}</small> : null}</div>
                      </div>
                    </td>
                    <td>
                      <span className="mono" title={target.verificationReason ?? undefined}>{target.verification}</span>
                      <small>{target.verificationReason || target.jobStatus || "verification pending"}</small>
                    </td>
                    <td><EligibilityBadge status={target.eligibility} /><small>{target.providerCheckedAt ? `checked ${formatShortDate(target.providerCheckedAt)}` : pendingReasonLabel(target)}</small></td>
                    <td className="mono">{metricText(target.followersCount)}</td>
                    <td><PerformanceBadge status={target.performance} /></td>
                    <td className="mono" title={target.fbrMetricsReliable ? "Followback ratio (measured)" : "Followback ratio not yet measured"}>{formatTargetFbrDisplay(target)}</td>
                    <td className="mono" title={target.followbacks !== null ? `${metricText(target.followbacks)} followbacks attributed` : "Followbacks pending attribution"}>{metricText(target.followsSent)}</td>
                    <td><span className="mono">{formatShortDate(target.lastUsedAt)}</span><small>{target.lastExhaustedAt ? "exhausted" : target.cooldownUntil ? "cooldown set" : target.metricsUpdatedAt ? "metrics" : "pending"}</small></td>
                    <td><span className="mono">{formatShortDate(target.addedAt)}</span><small title={target.batchId ?? target.source}>{compactSourceLabel(target.source)}{target.batchId ? ` · ${shortId(target.batchId)}` : ""}</small></td>
                    <td className="target-actions">
                      <Button variant="ghost" onClick={() => resetTarget(target.id)} disabled={archived}>Reset</Button>
                      {archived ? <Button variant="ghost" onClick={() => restoreTarget(target.id)}>Restore</Button> : null}
                      <Button variant="danger" onClick={() => archiveTargets([target.id])}>Delete</Button>
                    </td>
                  </tr>
                );})}
              </tbody>
            </table>
          ) : <div className="targets-empty">No targets match this filter.</div>}
        </div>
      </div>
    </Drawer>
  );
}

const targetFilters: Array<{ key: ProfileTargetListFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "active", label: "Active / valid" },
  { key: "pending", label: "Pending / review" },
  { key: "rejected", label: "Rejected" },
  { key: "archived", label: "Archived / deleted" },
];

function InlineTargetFeedback({ feedback }: { feedback: TargetFeedback }) {
  return <div className={`target-inline-feedback tone-${feedback.tone}`} role="status">{feedback.message}</div>;
}

function StatCard({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "success" | "warning" | "danger" | "info" }) {
  return <div className={`targets-stat-card tone-${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

function EligibilityBadge({ status }: { status: ProfileTargetEligibility }) {
  return <span className={`target-pill eligibility-${status}`}>{eligibilityLabel(status)}</span>;
}

function PerformanceBadge({ status }: { status: ProfileTargetPerformance }) {
  return <Badge tone={status === "good" ? "success" : status === "avg" || status === "insufficient_data" ? "warning" : status === "bad" ? "error" : "neutral"}>{performanceLabel(status)}</Badge>;
}

function TargetAvatar({ target }: { target: ProfileTarget }) {
  const [imageFailed, setImageFailed] = useState(false);
  const avatarSrc = imageFailed ? null : safeTargetAvatarSrc(target.avatarUrl);
  const initial = target.username.slice(0, 1).toUpperCase() || "?";

  if (!avatarSrc) {
    return <span className="target-avatar" aria-hidden>{initial}</span>;
  }

  return <img className="target-avatar target-avatar-img" src={avatarSrc} alt="" onError={() => {
    console.warn("target_avatar_proxy_failed", { target_id: target.id, status: target.status });
    setImageFailed(true);
  }} />;
}

function safeTargetAvatarSrc(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length > 512) return null;
  if (trimmed.includes("\\") || trimmed.includes("..") || trimmed.includes("#")) return null;

  // Match admin behavior: raw external avatar URLs must be proxied/sanitized server-side.
  if (
    /^\/api\/instagram-dashboard\/avatar\?kind=target&[A-Za-z0-9=&_%.-]+$/.test(trimmed) ||
    /^\/api\/botapp\/instagram-dashboard\/avatar\?kind=target&[A-Za-z0-9=&_%.-]+$/.test(trimmed) ||
    /^https?:\/\/[^/]+\/api\/instagram-dashboard\/avatar\?kind=target&[A-Za-z0-9=&_%.-]+$/.test(trimmed) ||
    /^\/avatars\/[A-Za-z0-9._-]+\.svg$/.test(trimmed)
  ) {
    return trimmed;
  }
  return null;
}

function normalizeUsername(value: string) {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

function isValidUsername(value: string) {
  return /^[a-z0-9._]{2,30}$/.test(value);
}

function isArchivedOrDeletedTarget(target: ProfileTarget) {
  return target.status === "archived" || target.status === "deleted" || Boolean(target.archivedAt || target.deletedAt);
}

function isValidEligibleTarget(target: ProfileTarget) {
  return !isArchivedOrDeletedTarget(target) && target.eligibility === "eligible" && (target.status === "valid" || target.status === "active");
}

function isPendingReviewTarget(target: ProfileTarget) {
  return !isArchivedOrDeletedTarget(target) && (target.status === "pending_verification" || target.status === "review" || target.status === "active" && target.eligibility === "unknown" || target.eligibility === "unknown" || target.eligibility.startsWith("review_"));
}

function isRejectedTarget(target: ProfileTarget) {
  return !isArchivedOrDeletedTarget(target) && (target.status === "rejected" || target.eligibility.startsWith("rejected_"));
}

function matchesListFilter(target: ProfileTarget, filter: ProfileTargetListFilter) {
  if (filter === "all") return true;
  if (filter === "active") return isValidEligibleTarget(target);
  if (filter === "pending") return isPendingReviewTarget(target);
  if (filter === "rejected") return isRejectedTarget(target);
  return isArchivedOrDeletedTarget(target);
}

function eligibilityLabel(status: ProfileTargetEligibility) {
  if (status === "eligible") return "Eligible";
  if (status === "rejected_low_followers") return "Low";
  if (status === "rejected_verified") return "Verified";
  if (status === "rejected_private") return "Private";
  if (status === "rejected_not_found") return "Not found";
  if (status === "review_provider_unavailable" || status === "review_username_changed") return "Review";
  return "Pending";
}

function pendingReasonLabel(target: ProfileTarget) {
  if (target.jobStatus === "pending" || target.jobStatus === "retry_scheduled") return target.jobStatus;
  if (target.verification === "pending") return target.verificationReason || "verification pending";
  if (target.verification === "provider_error" || target.verification === "unavailable" || target.verification === "rate_limited") return target.verificationReason || "provider_error";
  if (target.eligibility === "unknown") return target.followersCount === null ? "missing_followers_count" : "backend_pending";
  return target.reason || "ready";
}

function performanceLabel(status: ProfileTargetPerformance) {
  if (status === "good") return "Good";
  if (status === "avg") return "Avg";
  if (status === "bad") return "Bad";
  if (status === "insufficient_data") return "Insufficient";
  if (status === "pending") return "Pending";
  return "—";
}

function metricText(value: number | null | undefined) {
  return typeof value === "number" ? new Intl.NumberFormat("en").format(value) : "—";
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", { month: "short", day: "2-digit" }).format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function compactSourceLabel(value: string) {
  if (value.includes("bulk")) return "Bulk";
  if (value.includes("manual")) return "Manual";
  if (value.includes("client")) return "Client";
  if (value.includes("botapp")) return "BotApp";
  if (value.includes("automation")) return "Auto";
  return value;
}

function shortId(value: string | null | undefined) {
  return value ? value.slice(0, 8) : "—";
}

function safeFilePart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "profile";
}

function csvEscape(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function safeExportRow(target: ProfileTarget) {
  return {
    target_username: redactText(target.username),
    eligibility: eligibilityLabel(target.eligibility),
    performance: performanceLabel(target.performance),
    followers_count: target.followersCount,
    fbr: formatTargetFbrDisplay(target),
    added_at: target.addedAt,
  };
}

function parseBulkTargets(text: string, existingTargets: ProfileTarget[]): ProfileTargetBulkImportResult {
  const existing = new Set(existingTargets.filter((target) => !isArchivedOrDeletedTarget(target)).map((target) => target.username));
  const seen = new Set<string>();
  const accepted: string[] = [];
  let invalid = 0;
  let duplicates = 0;
  let alreadyExisting = 0;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const username = normalizeUsername(raw);
    if (!isValidUsername(username)) {
      invalid += 1;
      continue;
    }
    if (seen.has(username)) {
      duplicates += 1;
      continue;
    }
    seen.add(username);
    if (existing.has(username)) {
      alreadyExisting += 1;
      continue;
    }
    accepted.push(username);
  }
  return {
    totalSubmitted: invalid + duplicates + alreadyExisting + accepted.length,
    acceptedForVerification: accepted.length,
    invalid,
    duplicates,
    alreadyExisting,
    normalizedUsernames: accepted,
  };
}

function readPayloadString(payload: Record<string, unknown> | undefined, keys: string[], fallback = "") {
  if (!payload) return fallback;
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

function formatTargetAddSuccess(username: string, row: Record<string, unknown>, payload: Record<string, unknown> | undefined): TargetFeedback {
  const targetUsername = readPayloadString(row, ["target_username", "normalized_username", "username"], username);
  const verification = readPayloadString(payload, ["verification_status"], readPayloadString(row, ["verification_status"], "pending"));
  const quality = readPayloadString(payload, ["quality_status"], readPayloadString(row, ["quality_status"], "unknown"));
  const reason = readPayloadString(row, ["verification_reason", "rejected_reason", "reason"], verification);

  if (verification === "not_found" || quality === "rejected_not_found") {
    return { tone: "warning", message: `Rejected @${targetUsername} · not_found` };
  }
  if (quality.startsWith("rejected_")) {
    return { tone: "warning", message: `Rejected @${targetUsername} · ${quality.replace(/^rejected_/, "")}` };
  }
  if (verification === "pending" || quality === "unknown") {
    return { tone: "success", message: `Added @${targetUsername} · pending verification` };
  }
  return { tone: "success", message: `Added @${targetUsername} · ${reason || verification} · ${quality}` };
}

function formatTargetAddError(username: string, error: string | null | undefined): TargetFeedback {
  const detail = error || "backend unavailable";
  if (/already|duplicate|database/i.test(detail)) return { tone: "warning", message: `Duplicate @${username} · already exists` };
  if (/not[_ -]?found/i.test(detail)) return { tone: "warning", message: `Rejected @${username} · not_found` };
  return { tone: "error", message: `Error adding @${username} · ${detail}` };
}

function bulkEmptyMessage(result: ProfileTargetBulkImportResult) {
  const duplicateCount = result.duplicates + result.alreadyExisting;
  if (duplicateCount > 0 && result.invalid === 0) return `Duplicate targets · ${duplicateCount} already exist`;
  if (duplicateCount > 0) return `Nothing imported · duplicates ${duplicateCount} · rejected ${result.invalid}`;
  return "Add one valid Instagram username per line before importing.";
}

function formatBulkImportSuccess(payload: Record<string, unknown> | undefined): TargetFeedback {
  const rows = Array.isArray(payload?.rows) ? payload.rows as Record<string, unknown>[] : [];
  const inserted = numberFromPayload(payload, "inserted");
  const duplicates = numberFromPayload(payload, "skipped_duplicates");
  const invalid = numberFromPayload(payload, "skipped_invalid");
  const queued = numberFromPayload(payload, "jobs_queued");
  const rejected = rows.filter((row) => readPayloadString(row, ["quality_status"], "").startsWith("rejected_") || readPayloadString(row, ["verification_status"], "") === "not_found").length + invalid;
  const accepted = Math.max(0, inserted - rejected);

  return {
    tone: inserted > 0 ? "success" : duplicates > 0 ? "warning" : "error",
    message: `Bulk import complete · accepted ${accepted} · rejected ${rejected} · duplicates ${duplicates} · queued ${queued}`,
  };
}

function numberFromPayload(payload: Record<string, unknown> | undefined, key: string) {
  const value = payload?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

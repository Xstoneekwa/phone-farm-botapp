import { useEffect, useMemo, useState } from "react";
import { mockClient } from "../../../api/mock-client";
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

export function TargetsDrawer({ profile, onClose, onAction }: { profile: BotProfile; onClose: () => void; onAction: (label: string) => void }) {
  const [targets, setTargets] = useState<ProfileTarget[]>([]);
  const [query, setQuery] = useState("");
  const [listFilter, setListFilter] = useState<ProfileTargetListFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [singleUsername, setSingleUsername] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [message, setMessage] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void mockClient.getProfileTargets(profile.id).then((result) => {
      if (!cancelled && result.ok) {
        setTargets(result.data);
        setLastUpdatedAt(formatDateTime(new Date().toISOString()));
      }
    });
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

  function refreshMock() {
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
      setMessage("Invalid Instagram username.");
      return;
    }
    if (targets.some((target) => !isArchivedOrDeletedTarget(target) && target.username === username)) {
      setMessage("Duplicate target already visible in this list.");
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
    notifyAction(`Target @${username} queued locally for verification.`);
  }

  function importBulk() {
    if (bulkResult.acceptedForVerification === 0) {
      setMessage("Add one valid, non-duplicate Instagram username per line before importing.");
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
    notifyAction(`Bulk import parsed ${bulkResult.totalSubmitted}; accepted ${bulkResult.acceptedForVerification}, invalid ${bulkResult.invalid}, duplicates ${bulkResult.duplicates + bulkResult.alreadyExisting}.`);
  }

  function archiveTargets(ids: string[]) {
    if (!ids.length) return;
    if (!window.confirm(`${ids.length} target(s) will be archived in the local view. Continue?`)) return;
    const now = new Date().toISOString();
    setTargets((current) => current.map((target) => ids.includes(target.id) ? { ...target, status: "archived", archivedAt: now, reason: "dashboard_archive" } : target));
    setSelected(new Set());
    notifyAction(ids.length === 1 ? "Target archived locally." : `${ids.length} targets archived locally.`);
  }

  function resetTarget(id: string) {
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
    setTargets((current) => current.map((target) => target.id === id ? {
      ...target,
      status: target.eligibility === "eligible" ? "valid" : "pending_verification",
      archivedAt: null,
      deletedAt: null,
      reason: target.eligibility === "eligible" ? "restored_eligible" : "restored_pending_verification",
      syncStatus: "pending",
    } : target));
    notifyAction("Target restored locally; secure relay will queue verification when quality is stale.");
  }

  function exportTargets(format: ProfileTargetExportFormat) {
    const rows = filteredTargets.map(safeExportRow);
    const content = format === "json"
      ? JSON.stringify(rows, null, 2)
      : [
        "target_username,eligibility,performance,followers_count,followback_ratio,added_at",
        ...rows.map((row) => [
          row.target_username,
          row.eligibility,
          row.performance,
          row.followers_count ?? "",
          row.followback_ratio ?? "",
          row.added_at,
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
          <Button variant="ghost" onClick={refreshMock}>Refresh</Button>
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
              <Button variant="primary" onClick={addTarget} disabled={!singleUsername.trim()}>+ Add</Button>
            </div>
          </section>
          <section className="target-form-card">
            <h3>Bulk add (one per line)</h3>
            <textarea className="target-bulk-input" value={bulkText} onChange={(event) => setBulkText(event.target.value)} placeholder={"user_one\n@user_two\nuser_three"} rows={4} />
            <div className="target-bulk-footer">
              <span className="subtle">Parsed {bulkResult.totalSubmitted} · accepted {bulkResult.acceptedForVerification} · invalid {bulkResult.invalid} · duplicates {bulkResult.duplicates + bulkResult.alreadyExisting}</span>
              <Button variant="primary" onClick={importBulk} disabled={bulkResult.acceptedForVerification === 0}>Import</Button>
            </div>
          </section>
        </div>

        <p className="targets-sync-note">
          CT validation will reuse the admin-backed target contract through a secure BotApp API relay. BotApp does not access the DB, Supabase secrets, local scraping, local logs, or raw avatar URLs from the renderer.
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
                    <td><span className="mono" title={target.verificationReason ?? undefined}>{target.verification}</span></td>
                    <td><EligibilityBadge status={target.eligibility} /></td>
                    <td className="mono">{metricText(target.followersCount)}</td>
                    <td><PerformanceBadge status={target.performance} /></td>
                    <td className="mono" title="Followback Ratio: followers gained / follows sent from this CT">{fbrText(target)}</td>
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

  return <img className="target-avatar target-avatar-img" src={avatarSrc} alt="" onError={() => setImageFailed(true)} />;
}

function safeTargetAvatarSrc(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length > 512) return null;
  if (trimmed.includes("\\") || trimmed.includes("..") || trimmed.includes("#")) return null;

  // Match admin behavior: raw external avatar URLs must be proxied/sanitized server-side.
  if (/^\/api\/botapp\/instagram-dashboard\/avatar\?kind=target&[A-Za-z0-9=&_%.-]+$/.test(trimmed) || /^\/avatars\/[A-Za-z0-9._-]+\.svg$/.test(trimmed)) {
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

function fbrText(target: ProfileTarget) {
  if (target.followbackRatio === null) return "—";
  if (typeof target.followsSent === "number" && target.followsSent > 0 && target.followsSent < 100) return "Insufficient";
  return `${new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(target.followbackRatio)}%`;
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
    followback_ratio: target.followbackRatio,
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

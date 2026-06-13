import type { BotProfile, ProfileFiltersSavePayload, ProfileSettings } from "../../../api/types";
import { Badge } from "../../../design/components";

function Field({ label, value, mono = false }: { label: string; value: string | number | boolean | string[]; mono?: boolean }) {
  return <div className="settings-field"><span>{label}</span><strong className={mono ? "mono" : ""}>{Array.isArray(value) ? value.join(", ") : String(value)}</strong></div>;
}

function ToggleLine({ label, checked }: { label: string; checked: boolean }) {
  return <label className="checkbox-row"><input type="checkbox" checked={checked} readOnly /> {label}</label>;
}

function EditableToggleLine({ label, checked, disabled = false, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return <label className="checkbox-row"><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} /> {label}</label>;
}

function NullableNumberField({
  label,
  value,
  helper,
  onChange,
}: {
  label: string;
  value: number | null;
  helper: string;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="settings-edit-field">
      <span>{label}</span>
      <input
        className="input"
        type="number"
        min={0}
        step={1}
        value={value ?? ""}
        onChange={(event) => onChange(event.currentTarget.value === "" ? null : Number(event.currentTarget.value))}
      />
      <small>{helper}</small>
    </label>
  );
}

function Section({
  title,
  badge,
  tone = "neutral",
  children,
  full = false,
}: {
  title: string;
  badge: string;
  tone?: "neutral" | "success" | "warning" | "info";
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <section className={`settings-card${full ? " full" : ""}`}>
      <header>
        <h4>{title}</h4>
        <Badge tone={tone}>{badge}</Badge>
      </header>
      {children}
    </section>
  );
}

export function sameFiltersDraft(left: ProfileSettings["filters"], right: ProfileSettings["filters"]) {
  return (
    left.skipPrivateProfiles === right.skipPrivateProfiles &&
    left.minFollowers === right.minFollowers &&
    left.maxFollowers === right.maxFollowers &&
    left.minPosts === right.minPosts
  );
}

export function filtersValidationError(filters: ProfileSettings["filters"]) {
  for (const [label, value] of [
    ["Min followers", filters.minFollowers],
    ["Max followers", filters.maxFollowers],
    ["Min posts", filters.minPosts],
  ] as const) {
    if (value !== null && (!Number.isInteger(value) || value < 0)) {
      return `${label} must be a whole number greater than or equal to 0.`;
    }
  }
  if (filters.minFollowers !== null && filters.maxFollowers !== null && filters.minFollowers > filters.maxFollowers) {
    return "Min followers cannot be greater than Max followers.";
  }
  return "";
}

export function buildFiltersSavePayload(
  profile: BotProfile,
  filters: ProfileSettings["filters"],
): ProfileFiltersSavePayload {
  return {
    account_id: profile.id,
    source: "botapp",
    requested_by: null,
    idempotency_key: `botapp:filters:${profile.id}:save`,
    endpoint: "/api/instagram-dashboard/settings/follow-filters",
    patch: {
      account_id: profile.id,
      skip_private_profiles: filters.skipPrivateProfiles,
      min_followers: filters.minFollowers,
      max_followers: filters.maxFollowers,
      min_posts: filters.minPosts,
    },
    metadata_safe: {
      account_username: profile.username,
      runtime_ready_fields: filters.runtimeReadyFields,
      planned_fields: filters.plannedFields,
      source_status: filters.sourceStatus,
      sensitive_values_excluded: true,
    },
  };
}

function previewPayload(payload: ProfileFiltersSavePayload) {
  return JSON.stringify(payload, (key, value) => key === "mock_only" ? undefined : value, 2);
}

export function FilterSettingsPanel({
  profile,
  filters,
  validationError,
  onChange,
  showPayload = true,
}: {
  profile: BotProfile;
  filters: ProfileSettings["filters"];
  validationError: string;
  onChange: (filters: ProfileSettings["filters"]) => void;
  showPayload?: boolean;
}) {
  const payload = buildFiltersSavePayload(profile, filters);
  return (
    <div className="settings-grid">
      <Section title="Runtime-ready Follow filters" badge={filters.runtimeStatus} tone="success" full>
        <p className="muted">These settings are applied by the worker before a follow attempt.</p>
        <EditableToggleLine label="Skip private profiles" checked={filters.skipPrivateProfiles} onChange={(checked) => onChange({ ...filters, skipPrivateProfiles: checked, followPrivate: !checked })} />
        <NullableNumberField label="Min followers" value={filters.minFollowers} helper="Off when empty. Candidates below this follower count are skipped." onChange={(value) => onChange({ ...filters, minFollowers: value })} />
        <NullableNumberField label="Max followers" value={filters.maxFollowers} helper="Off when empty. Candidates above this follower count are skipped." onChange={(value) => onChange({ ...filters, maxFollowers: value })} />
        <NullableNumberField label="Min posts" value={filters.minPosts} helper="Off when empty. Candidates below this post count are skipped." onChange={(value) => onChange({ ...filters, minPosts: value })} />
      </Section>
      <Section title="Automatic runtime protections" badge="Read-only" tone="info" full>
        <p className="muted">Already interacted accounts, accounts already followed, and interaction blacklist status are enforced automatically.</p>
        <Field label="Source status" value={filters.sourceStatus} />
        <Field label="Runtime-ready fields" value={filters.runtimeReadyFields} />
        <Field label="Validation" value={validationError || "Filters draft is valid."} />
      </Section>
      <Section title="Planned filters" badge="Planned" tone="warning">
        <p className="muted">These groups become configurable after worker and domain wiring is complete.</p>
        <ToggleLine label="Skip follower" checked={filters.skipFollower} />
        <ToggleLine label="Skip following" checked={filters.skipFollowing} />
        <ToggleLine label="Skip non-business profiles" checked={filters.skipNonBusiness} />
        <ToggleLine label="Skip business profiles" checked={filters.skipBusiness} />
        <ToggleLine label="Follow private profiles" checked={filters.followPrivate} />
        <ToggleLine label="Follow only private profiles" checked={filters.followOnlyPrivate} />
        <ToggleLine label="DM private profiles" checked={filters.dmPrivate} />
        <Field label="Min following" value={filters.minFollowing} />
        <Field label="Max following" value={filters.maxFollowing} />
      </Section>
      <Section title="Bio & name" badge="Planned" tone="warning">
        <p className="muted">The audited admin Filters flow hides legacy draft filters. BotApp keeps safe local word lists read-only for future planning only.</p>
        <Field label="Planned groups" value={filters.plannedFields} />
        <label>Blacklisted words</label>
        <textarea className="input settings-textarea" readOnly value={filters.blacklistedWords} />
        <label>Mandatory words</label>
        <textarea className="input settings-textarea" readOnly value={filters.mandatoryWords || ""} />
      </Section>
      {showPayload ? (
        <section className="settings-card full settings-payload-card">
          <header>
            <h4>Filters payload</h4>
            <Badge tone="success">Backend ready</Badge>
          </header>
          <p className="muted">Saved through the secure BotApp relay to the Follow runtime settings table. Planned legacy filters stay read-only until worker/domain wiring exists.</p>
          <pre className="payload-preview">{previewPayload(payload)}</pre>
        </section>
      ) : null}
    </div>
  );
}

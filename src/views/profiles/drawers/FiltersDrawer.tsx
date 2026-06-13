import { Button, Drawer } from "../../../design/components";
import type { BotProfile } from "../../../api/types";
import { sourceLabel, useProfileDetails } from "../use-profile-details";

function Field({ label, value }: { label: string; value: unknown }) {
  return <div className="settings-field"><span>{label}</span><strong className="mono">{value === null || value === undefined || value === "" ? "—" : String(value)}</strong></div>;
}

export function FiltersDrawer({ profile, onClose, onSave }: { profile: BotProfile; onClose: () => void; onSave: () => void }) {
  const { loading, error, data } = useProfileDetails(profile.id);
  const filters = data?.filters?.data ?? {};

  return (
    <Drawer title="Filters" subtitle={profile.username} wide onClose={onClose} footer={<>
      <span className="subtle">{sourceLabel(data, "filters")}</span>
      <Button onClick={onSave} disabled>Save Filters · backend pending</Button>
    </>}>
      {loading ? <div className="empty-state">Loading filters from shared backend…</div> : null}
      {!loading && error ? <div className="empty-state"><strong>Filters unavailable</strong><span>{error}</span></div> : null}
      {!loading && !error && data?.filters?.status === "not_available" ? (
        <div className="empty-state"><strong>No filters row in DB</strong><span>Backend pending or account not initialized.</span></div>
      ) : null}
      {!loading && !error && data?.filters?.status === "backend_pending" ? (
        <div className="empty-state"><strong>Backend endpoint pending</strong><span>{data.filters.error ?? "ig_account_filters"}</span></div>
      ) : null}
      {!loading && !error && data?.filters?.status === "connected" ? (
        <div className="detail-list">
          <Field label="Disable filters" value={filters.disable_filters} />
          <Field label="Min followers" value={filters.min_followers} />
          <Field label="Max followers" value={filters.max_followers} />
          <Field label="Min following" value={filters.min_following} />
          <Field label="Max following" value={filters.max_following} />
          <Field label="Skip followers" value={filters.skip_followers} />
          <Field label="Skip following" value={filters.skip_following} />
          <Field label="Follow private profiles" value={filters.follow_private_profiles} />
          <Field label="Blacklist words" value={filters.blacklisted_words} />
          <Field label="Mandatory words" value={filters.mandatory_words} />
        </div>
      ) : null}
    </Drawer>
  );
}

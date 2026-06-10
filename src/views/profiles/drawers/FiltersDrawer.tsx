import { useEffect, useState } from "react";
import { mockClient } from "../../../api/mock-client";
import type { BotProfile, ProfileFilters } from "../../../api/types";
import { Button, Drawer, Input } from "../../../design/components";

export function FiltersDrawer({ profile, onClose, onSave }: { profile: BotProfile; onClose: () => void; onSave: () => void }) {
  const [filters, setFilters] = useState<ProfileFilters | null>(null);

  useEffect(() => {
    let cancelled = false;
    void mockClient.getProfileFilters(profile.id).then((result) => {
      if (!cancelled && result.ok) setFilters(result.data);
    });
    return () => { cancelled = true; };
  }, [profile.id]);

  if (!filters) return <Drawer title="Filters" subtitle={profile.username} wide onClose={onClose}><div className="empty-state">Loading mock filters…</div></Drawer>;

  return (
    <Drawer title="Filters" subtitle={profile.username} wide onClose={onClose} footer={<>
      <div className="drawer-footer-left">
        <select className="input" defaultValue={filters.templateName ?? ""}><option value="">Select template</option><option value="FILTRE 2025">FILTRE 2025</option></select>
        <Button variant="ghost" onClick={onSave}>Save as template</Button>
      </div>
      <Button onClick={onSave}>Save mock</Button>
    </>}>
      <section className="drawer-section">
        <h4>Filters · {profile.platform}</h4>
        <div className="filters-grid">
          <label className="checkbox-row"><input type="checkbox" checked={filters.skipFollower} readOnly /> Skip follower</label>
          <label className="checkbox-row"><input type="checkbox" checked={filters.skipFollowing} readOnly /> Skip following</label>
          <label className="checkbox-row"><input type="checkbox" checked={filters.skipNonBusiness} readOnly /> Skip non-business profiles</label>
          <label className="checkbox-row"><input type="checkbox" checked={filters.skipBusiness} readOnly /> Skip business profiles</label>
          <label className="checkbox-row"><input type="checkbox" checked={filters.followPrivate} readOnly /> Follow private profiles</label>
          <label className="checkbox-row"><input type="checkbox" checked={filters.followOnlyPrivate} readOnly /> Follow ONLY private profiles</label>
          <label className="checkbox-row"><input type="checkbox" checked={filters.dmPrivate} readOnly /> DM private profiles</label>
        </div>
        <div className="filters-numbers">
          <label>Minimum followers<Input value={String(filters.minFollowers)} readOnly /></label>
          <label>Maximum followers<Input value={String(filters.maxFollowers)} readOnly /></label>
          <label>Minimum following<Input value={String(filters.minFollowing)} readOnly /></label>
          <label>Maximum following<Input value={String(filters.maxFollowing)} readOnly /></label>
          <label>Minimum posts<Input value={String(filters.minPosts)} readOnly /></label>
        </div>
      </section>
      <section className="drawer-section">
        <h4>Bio & name</h4>
        <label>Blacklisted words</label>
        <textarea className="input settings-textarea" readOnly value={filters.blacklistedWords} />
        <label>Mandatory words</label>
        <textarea className="input settings-textarea" readOnly value={filters.mandatoryWords || "Mandatory words"} />
      </section>
    </Drawer>
  );
}

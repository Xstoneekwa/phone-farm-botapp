import { useEffect, useState } from "react";
import { mockClient } from "../../../api/mock-client";
import type { BotProfile, ProfileFilters } from "../../../api/types";
import { Button, Drawer } from "../../../design/components";
import { FilterSettingsPanel, filtersValidationError, sameFiltersDraft } from "./FilterSettingsPanel";

export function FiltersDrawer({ profile, onClose, onSave }: { profile: BotProfile; onClose: () => void; onSave: () => void }) {
  const [filters, setFilters] = useState<ProfileFilters | null>(null);
  const [baseline, setBaseline] = useState<ProfileFilters | null>(null);

  useEffect(() => {
    let cancelled = false;
    void mockClient.getProfileFilters(profile.id).then((result) => {
      if (!cancelled && result.ok) {
        setFilters(result.data);
        setBaseline(result.data);
      }
    });
    return () => { cancelled = true; };
  }, [profile.id]);

  if (!filters) return <Drawer title="Filters" subtitle={profile.username} wide onClose={onClose}><div className="empty-state">Loading filters...</div></Drawer>;

  const validationError = filtersValidationError(filters);
  const isDirty = baseline ? !sameFiltersDraft(filters, baseline) : false;
  const saveDisabled = !isDirty || Boolean(validationError) || !filters.saveReady;

  return (
    <Drawer title="Filters" subtitle={profile.username} wide onClose={onClose} footer={<>
      <div className="drawer-footer-left" />
      <Button onClick={onSave} disabled={saveDisabled}>Save Filters</Button>
    </>}>
      <FilterSettingsPanel profile={profile} filters={filters} validationError={validationError} onChange={setFilters} />
    </Drawer>
  );
}

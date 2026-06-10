import type { DeviceProfileGroup } from "../api/types";
import { ProfilesView } from "./profiles/ProfilesView";

export function Profiles({
  groups,
  onSelect,
  onAction,
  onMockSubmit,
}: {
  groups: DeviceProfileGroup[];
  onSelect: (id: string) => void;
  onAction: (action: string, target: string, danger?: boolean) => void;
  onMockSubmit: (message: string) => void;
}) {
  return <ProfilesView groups={groups} onSelect={onSelect} onAction={onAction} onMockSubmit={onMockSubmit} />;
}

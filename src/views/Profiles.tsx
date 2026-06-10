import type { DeviceProfileGroup } from "../api/types";
import { ProfilesView } from "./profiles/ProfilesView";

export function Profiles({
  groups,
  onSelect,
  onAction,
}: {
  groups: DeviceProfileGroup[];
  onSelect: (id: string) => void;
  onAction: (action: string, target: string, danger?: boolean) => void;
}) {
  return <ProfilesView groups={groups} onSelect={onSelect} onAction={onAction} />;
}

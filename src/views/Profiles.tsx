import type { BotAppDispatcherHealth, BotProfile, DeviceProfileGroup } from "../api/types";
import { ProfilesView } from "./profiles/ProfilesView";

export type ProfilesMeta = {
  source: string;
  accountsCount: number;
  counts: Record<string, number>;
};

export function Profiles({
  profiles,
  groups,
  dispatcherHealth,
  syncError,
  profilesMeta,
  loading,
  onRefresh,
  onSelect,
  onAction,
  onMockSubmit,
}: {
  profiles: BotProfile[];
  groups: DeviceProfileGroup[];
  dispatcherHealth: BotAppDispatcherHealth | null;
  syncError: string | null;
  profilesMeta: ProfilesMeta | null;
  loading: boolean;
  onRefresh: () => Promise<void> | void;
  onSelect: (id: string) => void;
  onAction: (action: string, target: string, danger?: boolean) => void;
  onMockSubmit: (message: string, tone?: "success" | "error" | "info") => void;
}) {
  return (
    <ProfilesView
      profiles={profiles}
      groups={groups}
      dispatcherHealth={dispatcherHealth}
      syncError={syncError}
      profilesMeta={profilesMeta}
      loading={loading}
      onRefresh={onRefresh}
      onSelect={onSelect}
      onAction={onAction}
      onMockSubmit={onMockSubmit}
    />
  );
}

export type SnapshotSourceStatus = {
  source_status?: {
    followers?: { status?: string };
    followings?: { status?: string };
  };
  missing_sources?: string[];
};

export function snapshotStatusSummary(data: SnapshotSourceStatus) {
  const followers = data.source_status?.followers?.status
    ?? (data.missing_sources?.some((source) => source.includes("follower_snapshots")) ? "no_data" : "available");
  const followings = data.source_status?.followings?.status
    ?? (data.missing_sources?.includes("account_following_snapshots") ? "unavailable" : "available");
  const followerLabel = followers === "stale" ? "Followers snapshot stale" : followers === "no_data" ? "Followers snapshot pending" : "Followers snapshots available";
  const followingLabel = followings === "unavailable" ? "Followings unavailable" : followings === "stale" ? "Followings snapshot stale" : followings === "no_data" ? "Followings snapshot pending" : "Followings snapshots available";
  return `${followerLabel} · ${followingLabel}`;
}

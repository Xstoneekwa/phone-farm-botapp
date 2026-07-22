export type SnapshotSourceStatus = {
  source_status?: {
    followers?: { status?: string };
    followings?: { status?: string };
    posts?: { status?: string };
  };
  missing_sources?: string[];
};

export function snapshotStatusSummary(data: SnapshotSourceStatus) {
  const followers = data.source_status?.followers?.status
    ?? (data.missing_sources?.some((source) => source.includes("follower_snapshots")) ? "no_data" : "available");
  const followings = data.source_status?.followings?.status
    ?? (data.missing_sources?.includes("followings_snapshot") ? "no_data" : "available");
  const posts = data.source_status?.posts?.status
    ?? (data.missing_sources?.includes("posts_snapshot") ? "no_data" : "available");
  const followerLabel = followers === "stale" ? "Followers snapshot stale" : followers === "no_data" ? "Followers snapshot pending" : "Followers snapshots available";
  const followingLabel = followings === "stale" ? "Followings snapshot stale" : followings === "no_data" ? "Followings snapshot pending" : "Followings snapshots available";
  const postsLabel = posts === "stale" ? "Posts snapshot stale" : posts === "no_data" ? "Posts snapshot pending" : "Posts snapshots available";
  return `${followerLabel} · ${followingLabel} · ${postsLabel}`;
}

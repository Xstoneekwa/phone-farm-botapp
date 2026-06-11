import { useEffect, useState } from "react";
import { loadProfileDetails, type ProfileDetailsPayload } from "../../api/profile-details";

export function useProfileDetails(accountId: string) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ProfileDetailsPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadProfileDetails(accountId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setData(null);
        setError(result.error ?? "Profile details unavailable.");
        setLoading(false);
        return;
      }
      setData((result.data ?? null) as ProfileDetailsPayload | null);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [accountId]);

  return { loading, error, data };
}

export function sourceLabel(data: ProfileDetailsPayload | null, key: keyof ProfileDetailsPayload) {
  const section = data?.[key] as { status?: string } | undefined;
  const status = section && typeof section === "object" && "status" in section ? section.status : undefined;
  const source = data?.source?.[key as string];
  if (status === "backend_pending") return `Backend pending · ${source ?? key}`;
  if (status === "not_available") return `Not available · ${source ?? key}`;
  return `DB / Manage · ${source ?? key}`;
}

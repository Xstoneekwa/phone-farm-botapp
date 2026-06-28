import type { Device } from "../api/types";

export const DELETE_PREFLIGHT_MISMATCH_FR =
  "Les informations de vérification ne correspondent pas au téléphone sélectionné. Veuillez réessayer.";

export function preflightDeviceId(preflight: Record<string, unknown> | null | undefined): string {
  return String(preflight?.deviceId || preflight?.device_id || "").trim();
}

export function preflightDisplayName(preflight: Record<string, unknown> | null | undefined): string {
  return String(preflight?.displayName || preflight?.display_name || "").trim();
}

export function resolveDeleteModalDeviceId(physicalDevices: Device[], initialDevice: Device): string {
  const initialId = String(initialDevice?.id || "").trim();
  if (initialId && physicalDevices.some((device) => device.id === initialId)) {
    return initialId;
  }
  return String(physicalDevices[0]?.id || initialId);
}

export function isDeletePreflightAligned(
  selectedId: string,
  selectedDeviceName: string,
  preflight: Record<string, unknown> | null | undefined,
): boolean {
  if (!preflight) return false;
  const deviceId = preflightDeviceId(preflight);
  if (!deviceId || deviceId !== selectedId) return false;
  const displayName = preflightDisplayName(preflight);
  if (displayName && displayName !== selectedDeviceName) return false;
  return true;
}

export function canConfirmDeviceDelete(input: {
  loading: boolean;
  preflight: Record<string, unknown> | null | undefined;
  selectedId: string;
  selectedDeviceName: string;
  confirmationName: string;
  deleteAvailable: boolean;
}): boolean {
  if (input.loading || !input.deleteAvailable) return false;
  if (!isDeletePreflightAligned(input.selectedId, input.selectedDeviceName, input.preflight)) return false;
  if (input.preflight?.deletable !== true) return false;
  const expectedName = preflightDisplayName(input.preflight) || input.selectedDeviceName;
  return input.confirmationName === expectedName;
}

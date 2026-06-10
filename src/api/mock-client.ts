import {
  buildDeviceProfileGroups,
  getMockProfileFilters,
  getMockProfileLogs,
  getMockProfileSettings,
  getMockProfileStats,
  getMockProfileTargets,
} from "../data/profile-mock-data";
import { mockActivityLogs, mockApiKeys, mockDevices, mockDmTemplates, mockNotifications, mockProfiles, mockSettings, mockTargets, mockWebhooks } from "../data/mock-data";
import type { ActionPreview, ApiResult, BotAppClient } from "./types";

function ok<T>(data: T): ApiResult<T> {
  return { ok: true, data, request_id: `mock_${Date.now().toString(36)}` };
}

function delay<T>(value: T, ms = 80): Promise<T> {
  return new Promise((resolve) => window.setTimeout(() => resolve(value), ms));
}

export const mockClient: BotAppClient = {
  listProfiles: () => delay(ok(mockProfiles)),
  getProfileDetail: (profileId) => delay(ok(mockProfiles.find((profile) => profile.id === profileId) ?? mockProfiles[0])),
  listDeviceProfileGroups: () => delay(ok(buildDeviceProfileGroups(mockProfiles, mockDevices))),
  getProfileStats: (profileId) => {
    const profile = mockProfiles.find((item) => item.id === profileId) ?? mockProfiles[0];
    return delay(ok(getMockProfileStats(profile)));
  },
  getProfileLogs: (profileId) => {
    const profile = mockProfiles.find((item) => item.id === profileId) ?? mockProfiles[0];
    return delay(ok(getMockProfileLogs(profile)));
  },
  getProfileTargets: (profileId) => {
    const profile = mockProfiles.find((item) => item.id === profileId) ?? mockProfiles[0];
    return delay(ok(getMockProfileTargets(profile)));
  },
  getProfileSettings: (profileId) => {
    const profile = mockProfiles.find((item) => item.id === profileId) ?? mockProfiles[0];
    return delay(ok(getMockProfileSettings(profile)));
  },
  getProfileFilters: (profileId) => {
    const profile = mockProfiles.find((item) => item.id === profileId) ?? mockProfiles[0];
    return delay(ok(getMockProfileFilters(profile)));
  },
  listDevices: () => delay(ok(mockDevices)),
  listNotifications: () => delay(ok(mockNotifications)),
  listActivityLogs: () => delay(ok(mockActivityLogs)),
  listTargets: () => delay(ok(mockTargets)),
  listDmTemplates: () => delay(ok(mockDmTemplates)),
  listApiKeys: () => delay(ok(mockApiKeys)),
  listWebhooks: () => delay(ok(mockWebhooks)),
  listSettings: () => delay(ok(mockSettings)),
  previewAction: (action, target) => delay(ok<ActionPreview>({
    action,
    target,
    dry_run: true,
    message: "Mock only — no backend action executed.",
  })),
};

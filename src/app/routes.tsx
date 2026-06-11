export type RouteId = "overview" | "profiles" | "account" | "devices" | "activity" | "targets" | "templates" | "notifications" | "api" | "settings";

export const routes: Array<{ id: RouteId; label: string; group: string; shortcut: string }> = [
  { id: "overview", label: "Overview", group: "Ops", shortcut: "O" },
  { id: "profiles", label: "Profiles", group: "Ops", shortcut: "P" },
  { id: "account", label: "Client Accounts", group: "Ops", shortcut: "C" },
  { id: "devices", label: "Devices", group: "Ops", shortcut: "V" },
  { id: "activity", label: "Activity Log", group: "Monitoring", shortcut: "L" },
  { id: "targets", label: "Targets / CT", group: "Growth", shortcut: "T" },
  { id: "templates", label: "DM Templates", group: "Growth", shortcut: "M" },
  { id: "notifications", label: "Notifications", group: "Monitoring", shortcut: "N" },
  { id: "api", label: "API / Webhooks / Keys", group: "Admin", shortcut: "A" },
  { id: "settings", label: "Settings", group: "Admin", shortcut: "S" },
];

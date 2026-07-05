export type RouteId = "overview" | "profiles" | "account" | "credentials" | "devices" | "activity" | "email-history" | "runtime" | "incident-notifications" | "compass" | "auto-restart" | "api" | "settings";

export const routes: Array<{ id: RouteId; label: string; group: string; shortcut: string }> = [
  { id: "overview", label: "Overview", group: "Ops", shortcut: "O" },
  { id: "profiles", label: "Profiles", group: "Ops", shortcut: "P" },
  { id: "account", label: "Client Accounts", group: "Ops", shortcut: "C" },
  { id: "credentials", label: "Credentials", group: "Ops", shortcut: "K" },
  { id: "devices", label: "Devices", group: "Ops", shortcut: "V" },
  { id: "activity", label: "Activity Log", group: "Monitoring", shortcut: "L" },
  { id: "email-history", label: "Email History", group: "Monitoring", shortcut: "E" },
  { id: "runtime", label: "Runtime Health", group: "Monitoring", shortcut: "H" },
  { id: "incident-notifications", label: "Incident Notifications", group: "Monitoring", shortcut: "N" },
  { id: "compass", label: "Compass", group: "Monitoring", shortcut: "X" },
  { id: "auto-restart", label: "Auto Restart", group: "Automation", shortcut: "R" },
  { id: "api", label: "API / Webhooks / Keys", group: "Admin", shortcut: "A" },
  { id: "settings", label: "Settings", group: "Admin", shortcut: "S" },
];

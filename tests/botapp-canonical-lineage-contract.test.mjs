import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("canonical navigation keeps Incidents, Notifications and warning icon", () => {
  const routes = read("src/app/routes.tsx");
  const sidebar = read("src/layout/Sidebar.tsx");
  assert.match(routes, /id: "incidents", label: "Incidents"/);
  assert.match(routes, /id: "incident-notifications", label: "Incident Notifications"/);
  assert.match(sidebar, /incidents: "⚠"/);
});

test("canonical Devices keeps refresh, heartbeat recovery, occupants and clones", () => {
  const devices = read("src/views/Devices.tsx");
  assert.match(devices, />Refresh<\/button>/);
  assert.match(devices, /Relancer les heartbeats/);
  assert.match(devices, /appInstances\.filter\(\(app\) => app\.occupant\)/);
  assert.match(devices, /appInstance/);
});

test("canonical Profiles does not regress to the literal social blocked badge", () => {
  const growth = read("src/views/profiles/profile-growth-badge.ts");
  assert.doesNotMatch(growth, /label: "social blocked:"/);
  assert.match(growth, /operator review required/);
});

test("packaging keeps the signed macOS verification path", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.match(pkg.scripts["package:mac"], /verify-electron-main-local-requires/);
  assert.match(pkg.scripts["package:mac"], /sign-and-verify-macos-bundle/);
});

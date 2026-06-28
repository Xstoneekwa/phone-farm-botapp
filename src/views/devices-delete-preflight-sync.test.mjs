import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canConfirmDeviceDelete,
  DELETE_PREFLIGHT_MISMATCH_FR,
  isDeletePreflightAligned,
  preflightDeviceId,
  resolveDeleteModalDeviceId,
} from "./devices-delete-preflight-sync.ts";

const physicalPhone = {
  id: "00000000-0000-4000-8000-00000022c002",
  name: "Entry 2C Physical Outreach Phone",
  deviceKind: "physical_phone",
};
const emulator = {
  id: "00000000-0000-4000-8000-00000022c001",
  name: "Entry 2C Emulator Full Cycle",
  deviceKind: "emulator",
};
const physicalPreflight = {
  deviceId: physicalPhone.id,
  displayName: physicalPhone.name,
  deviceKind: "physical_phone",
  deletable: true,
  occupiedCloneCount: 0,
  activeAssignmentCount: 0,
  releasedAssignmentCount: 5,
  releasedAssignmentsInfoFr: "5 anciennes assignations terminées seront conservées dans l'historique.",
  blockingReasonsFr: [],
};
const emulatorPreflight = {
  deviceId: emulator.id,
  displayName: emulator.name,
  deviceKind: "emulator",
  deletable: false,
  cloneCount: 4,
  blockingReasonsFr: ["Seuls les téléphones physiques peuvent être retirés de l'inventaire"],
};

test("resolveDeleteModalDeviceId ignores non-physical initial device", () => {
  assert.equal(
    resolveDeleteModalDeviceId([physicalPhone], emulator),
    physicalPhone.id,
  );
});

test("aligned preflight requires matching deviceId and displayName", () => {
  assert.equal(isDeletePreflightAligned(physicalPhone.id, physicalPhone.name, physicalPreflight), true);
  assert.equal(isDeletePreflightAligned(physicalPhone.id, physicalPhone.name, emulatorPreflight), false);
  assert.equal(isDeletePreflightAligned(emulator.id, emulator.name, emulatorPreflight), true);
});

test("canConfirmDeviceDelete stays disabled on mismatch, loading, or missing confirmation", () => {
  assert.equal(canConfirmDeviceDelete({
    loading: false,
    preflight: physicalPreflight,
    selectedId: physicalPhone.id,
    selectedDeviceName: physicalPhone.name,
    confirmationName: "",
    deleteAvailable: true,
  }), false);
  assert.equal(canConfirmDeviceDelete({
    loading: true,
    preflight: physicalPreflight,
    selectedId: physicalPhone.id,
    selectedDeviceName: physicalPhone.name,
    confirmationName: physicalPhone.name,
    deleteAvailable: true,
  }), false);
  assert.equal(canConfirmDeviceDelete({
    loading: false,
    preflight: emulatorPreflight,
    selectedId: physicalPhone.id,
    selectedDeviceName: physicalPhone.name,
    confirmationName: emulator.name,
    deleteAvailable: true,
  }), false);
  assert.equal(canConfirmDeviceDelete({
    loading: false,
    preflight: physicalPreflight,
    selectedId: physicalPhone.id,
    selectedDeviceName: physicalPhone.name,
    confirmationName: physicalPhone.name,
    deleteAvailable: true,
  }), true);
});

test("Delete modal wiring cancels stale async and blocks mismatched preflight", () => {
  const source = readFileSync(new URL("./Devices.tsx", import.meta.url), "utf8");
  assert.match(source, /resolveDeleteModalDeviceId/);
  assert.match(source, /requestDeviceId !== selectedId/);
  assert.match(source, /DELETE_PREFLIGHT_MISMATCH_FR/);
  assert.match(source, /preflightAligned/);
  assert.match(source, /deviceKind === "physical_phone"/);
  assert.match(source, /physicalFallback = devices\.find\(\(item\) => item\.deviceKind === "physical_phone"\)/);
});

test("Delete modal shows mismatch message constant", () => {
  assert.match(DELETE_PREFLIGHT_MISMATCH_FR, /ne correspondent pas au téléphone sélectionné/);
  assert.equal(preflightDeviceId(physicalPreflight), physicalPhone.id);
});

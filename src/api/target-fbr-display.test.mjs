import assert from "node:assert/strict";
import test from "node:test";
import {
  FBR_NOT_MEASURED_EN,
  formatTargetFbrDisplay,
  resolveTargetFbrFromApiRow,
} from "./target-fbr-display.ts";

function displayFromRow(row) {
  const fbr = resolveTargetFbrFromApiRow(row);
  return formatTargetFbrDisplay({
    fbrMetricsReliable: fbr.fbrMetricsReliable,
    fbrPercent: fbr.fbrPercent,
    fbrLabel: fbr.fbrLabel,
    followsSent: fbr.followsSent,
  });
}

test("reliable true + fbrPercent displays measured FBR", () => {
  const row = {
    fbrMetricsReliable: true,
    fbrPercent: 21.43,
    fbrLabel: "21.4%",
    followbacks_metrics_reliable_at: "2026-06-15T12:00:00.000Z",
    follows_sent_count: 14,
    followbacks_count: 3,
  };
  const resolved = resolveTargetFbrFromApiRow(row);
  assert.equal(resolved.fbrMetricsReliable, true);
  assert.equal(resolved.fbrPercent, 21.43);
  assert.equal(resolved.fbrLabel, "21.4%");
  assert.equal(displayFromRow(row), "21.4%");
});

test("reliable false + followback_ratio_db=0 displays Not measured", () => {
  const row = {
    fbrMetricsReliable: false,
    fbrPercent: null,
    fbrLabel: "Not measured",
    followbacks_metrics_reliable_at: null,
    followback_ratio: null,
    followback_ratio_db: 0,
    follows_sent_count: 0,
    followbacks_count: 0,
  };
  const resolved = resolveTargetFbrFromApiRow(row);
  assert.equal(resolved.fbrMetricsReliable, false);
  assert.equal(resolved.fbrPercent, null);
  assert.equal(resolved.fbrLabel, FBR_NOT_MEASURED_EN);
  assert.equal(displayFromRow(row), FBR_NOT_MEASURED_EN);
});

test("missing relay fields fallback to Not measured without using raw followback_ratio", () => {
  const row = {
    followback_ratio: 0,
    followback_ratio_db: 0,
    follows_sent_count: 12,
    followbacks_count: 0,
  };
  const resolved = resolveTargetFbrFromApiRow(row);
  assert.equal(resolved.fbrMetricsReliable, false);
  assert.equal(resolved.fbrPercent, null);
  assert.equal(displayFromRow(row), FBR_NOT_MEASURED_EN);
});

test("does not prefer followback_ratio_db over fbrPercent when reliable", () => {
  const row = {
    fbrMetricsReliable: true,
    fbrPercent: 46.2,
    fbrLabel: "46.2%",
    followbacks_metrics_reliable_at: "2026-06-15T12:00:00.000Z",
    followback_ratio: 46.2,
    followback_ratio_db: 0,
    follows_sent_count: 13,
    followbacks_count: 6,
  };
  const resolved = resolveTargetFbrFromApiRow(row);
  assert.equal(resolved.fbrPercent, 46.2);
  assert.equal(displayFromRow(row), "46.2%");
});

test("true zero FBR displays 0% only when reliable", () => {
  const row = {
    fbrMetricsReliable: true,
    fbrPercent: 0,
    followbacks_metrics_reliable_at: "2026-06-15T12:00:00.000Z",
    follows_sent_count: 100,
    followbacks_count: 0,
  };
  assert.equal(displayFromRow(row), "0%");
});

test("French locale shows Non mesuré when unreliable", () => {
  const fbr = resolveTargetFbrFromApiRow({
    fbrMetricsReliable: false,
    follows_sent_count: 5,
  });
  assert.equal(formatTargetFbrDisplay({
    fbrMetricsReliable: fbr.fbrMetricsReliable,
    fbrPercent: fbr.fbrPercent,
    fbrLabel: fbr.fbrLabel,
    followsSent: fbr.followsSent,
  }, "fr"), "Non mesuré");
});

export type EmailTestDeliveryReadinessInput = {
  templateConfigured: boolean;
  statusLoading: boolean;
  testSchemaReady?: boolean;
  testSendingEnabled?: boolean;
  testRecipientConfigured?: boolean;
  providerReady?: boolean;
  clientSendingEnabled?: boolean;
  canSendTest?: boolean;
  disabledReason?: string | null;
  readinessLabel?: string | null;
};

export function formatReadinessFlag(value: boolean | undefined, positive = "Ready", negative = "Not ready") {
  if (value === true) return positive;
  if (value === false) return negative;
  return "Unknown";
}

export function resolveTestDeliverySendDisabled(input: EmailTestDeliveryReadinessInput) {
  return !input.templateConfigured || input.statusLoading || !input.canSendTest;
}

export function resolveTestDeliveryReadinessLabel(input: EmailTestDeliveryReadinessInput) {
  if (input.readinessLabel) return input.readinessLabel;
  if (input.canSendTest) return "Ready for one controlled test";
  if (!input.templateConfigured) return "Configure an active template before sending a test delivery.";
  if (input.disabledReason) return input.disabledReason;
  return "Test delivery prerequisites are not ready yet.";
}

export function shouldLoadTestDeliveryStatusOnDrawerOpen() {
  return true;
}

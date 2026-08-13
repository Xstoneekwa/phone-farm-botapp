const excludedStatuses = new Set([
  "archived",
  "trashed",
  "trash",
  "deleted",
  "cancelled",
  "canceled",
  "deactivated",
  "rolled_back_test_onboarding",
  "onboarding_rollback",
]);

function normalized(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isVisibleProfileAccount(account) {
  if (account?.active === false || account?.clientActive === false || account?.client_active === false) return false;
  const statuses = [
    account?.accountLifecycleStatus,
    account?.account_lifecycle_status,
    account?.adminStatus,
    account?.admin_status,
    account?.status,
  ].map(normalized).filter(Boolean);
  return !statuses.some((status) => excludedStatuses.has(status));
}

module.exports = { isVisibleProfileAccount };

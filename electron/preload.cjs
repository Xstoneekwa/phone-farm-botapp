const { contextBridge, ipcRenderer } = require("electron");

const DEVICE_VIEW_STATE = "botapp:device-views:state";

contextBridge.exposeInMainWorld("botappDesktop", {
  platform: process.platform,
  mode: process.env.NODE_ENV === "development" ? "development" : "packaged",
  runtime: {
    status: () => ipcRenderer.invoke("botapp:runtime:status"),
  },
  diagnostics: {
    provenance: () => ipcRenderer.invoke("botapp:diagnostics:provenance"),
  },
  dispatcher: {
    status: () => ipcRenderer.invoke("botapp:dispatcher:status"),
    action: (action) => ipcRenderer.invoke("botapp:dispatcher:action", action),
    ensure: () => ipcRenderer.invoke("botapp:dispatcher:ensure"),
  },
  deviceHeartbeat: {
    status: () => ipcRenderer.invoke("botapp:device-heartbeat:status"),
    action: (action) => ipcRenderer.invoke("botapp:device-heartbeat:action", action),
    ensure: () => ipcRenderer.invoke("botapp:device-heartbeat:ensure"),
  },
  schedulerRuntime: {
    status: () => ipcRenderer.invoke("botapp:scheduler-runtime:status"),
    ensure: () => ipcRenderer.invoke("botapp:scheduler-runtime:ensure"),
  },
  compass: {
    status: () => ipcRenderer.invoke("botapp:compass:ai-status"),
    saveRelayConfig: (input) => ipcRenderer.invoke("botapp:compass:save-relay-config", input),
    removeRelayConfig: () => ipcRenderer.invoke("botapp:compass:remove-relay-config"),
    analyze: (input) => ipcRenderer.invoke("botapp:compass:analyze", input),
  },
  targetingAi: {
    status: () => ipcRenderer.invoke("botapp:targeting-ai:status"),
    saveConfig: (input) => ipcRenderer.invoke("botapp:targeting-ai:save-config", input),
    resetConfig: () => ipcRenderer.invoke("botapp:targeting-ai:reset-config"),
    testConfig: (input) => ipcRenderer.invoke("botapp:targeting-ai:test-config", input),
  },
  autoRestart: {
    overview: () => ipcRenderer.invoke("botapp:auto-restart:overview"),
    dryRun: () => ipcRenderer.invoke("botapp:auto-restart:dry-run"),
    actionPreview: (input) => ipcRenderer.invoke("botapp:auto-restart:action-preview", input),
    loadSettings: () => ipcRenderer.invoke("botapp:auto-restart:settings-load"),
    saveSettings: (patch) => ipcRenderer.invoke("botapp:auto-restart:settings-save", patch),
    execute: (input) => ipcRenderer.invoke("botapp:auto-restart:execute", input),
  },
  incidents: {
    list: (input) => ipcRenderer.invoke("botapp:incidents:list", input),
    detail: (incidentId) => ipcRenderer.invoke("botapp:incidents:detail", incidentId),
    action: (input) => ipcRenderer.invoke("botapp:incidents:action", input),
    notificationSettings: () => ipcRenderer.invoke("botapp:incidents:notification-settings"),
    patchNotificationSettings: (input) => ipcRenderer.invoke("botapp:incidents:notification-settings-patch", input),
    testNotification: (input) => ipcRenderer.invoke("botapp:incidents:notification-test", input),
    notificationOutbox: (input) => ipcRenderer.invoke("botapp:incidents:notification-outbox", input),
  },
  data: {
    overview: () => ipcRenderer.invoke("botapp:data:overview"),
  },
  relay: {
    health: () => ipcRenderer.invoke("botapp:relay:health"),
    repair: () => ipcRenderer.invoke("botapp:relay:repair"),
  },
  clientAccounts: {
    applyStatus: (input) => ipcRenderer.invoke("botapp:client-accounts:status", input),
    applyNeedsMoreTargets: (input) => ipcRenderer.invoke("botapp:client-accounts:needs-more-targets", input),
  },
  devices: {
    list: (input) => ipcRenderer.invoke("botapp:devices:list", input),
    deletePreflight: (input) => ipcRenderer.invoke("botapp:devices:delete-preflight", input),
    delete: (input) => ipcRenderer.invoke("botapp:devices:delete", input),
    restartHeartbeatPublisher: () => ipcRenderer.invoke("botapp:devices:restart-heartbeat-publisher"),
    subscribeHeartbeatRecovery: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on("botapp:devices:heartbeat-recovery", handler);
      return () => ipcRenderer.removeListener("botapp:devices:heartbeat-recovery", handler);
    },
  },
  profiles: {
    details: (accountId) => ipcRenderer.invoke("botapp:profiles:details", accountId),
    statsHistory: (input) => ipcRenderer.invoke("botapp:profiles:stats-history", input),
    createDryRun: (input) => ipcRenderer.invoke("botapp:profiles:create-dry-run", input),
    create: (input) => ipcRenderer.invoke("botapp:profiles:create", input),
    scheduleSlots: (input) => ipcRenderer.invoke("botapp:profiles:schedule-slots", input),
    schedule: {
      get: (accountId) => ipcRenderer.invoke("botapp:profiles:schedule:get", accountId),
      save: (input) => ipcRenderer.invoke("botapp:profiles:schedule:save", input),
    },
    verifyUsername: (input) => ipcRenderer.invoke("botapp:profiles:verify-username", input),
    credentials: {
      submit: (input) => ipcRenderer.invoke("botapp:profiles:credentials:submit", input),
    },
    settings: {
      save: (input) => ipcRenderer.invoke("botapp:profiles:settings:save", input),
    },
    actions: {
      perform: (input) => ipcRenderer.invoke("botapp:profiles:action", input),
    },
    assignNow: (input) => ipcRenderer.invoke("botapp:profiles:assign-now", input),
    readinessNow: (input) => ipcRenderer.invoke("botapp:profiles:readiness-now", input),
    autoLogin: (input) => ipcRenderer.invoke("botapp:profiles:auto-login", input),
    restoreLoginScreen: (input) => ipcRenderer.invoke("botapp:profiles:restore-login-screen", input),
    startRun: (input) => ipcRenderer.invoke("botapp:profiles:run-start", input),
    stopRun: (input) => ipcRenderer.invoke("botapp:profiles:run-stop", input),
    runProgress: (input) => ipcRenderer.invoke("botapp:profiles:run-progress", input),
    addTarget: (input) => ipcRenderer.invoke("botapp:profiles:targets:add", input),
    bulkAddTargets: (input) => ipcRenderer.invoke("botapp:profiles:targets:bulk-add", input),
    deleteTargets: (input) => ipcRenderer.invoke("botapp:profiles:targets:delete", input),
    resetTargets: (input) => ipcRenderer.invoke("botapp:profiles:targets:reset", input),
  },
  endpoints: {
    list: () => ipcRenderer.invoke("botapp:endpoints:list"),
    test: (input) => ipcRenderer.invoke("botapp:endpoints:test", input),
    testAll: () => ipcRenderer.invoke("botapp:endpoints:test-all"),
    exportProfile: () => ipcRenderer.invoke("botapp:endpoints:export-profile"),
  },
  integrations: {
    list: () => ipcRenderer.invoke("botapp:integrations:list"),
    saveWebhook: (input) => ipcRenderer.invoke("botapp:integrations:save-webhook", input),
    removeWebhook: (input) => ipcRenderer.invoke("botapp:integrations:remove-webhook", input),
  },
  email: {
    listTemplates: () => ipcRenderer.invoke("botapp:email:list-templates"),
    saveTemplate: (input) => ipcRenderer.invoke("botapp:email:save-template", input),
    previewTemplate: (input) => ipcRenderer.invoke("botapp:email:preview-template", input),
    listHistory: (input) => ipcRenderer.invoke("botapp:email:list-history", input),
    historyDetail: (intentId) => ipcRenderer.invoke("botapp:email:history-detail", intentId),
    testDeliveryStatus: () => ipcRenderer.invoke("botapp:email:test-delivery-status"),
    sendTestDelivery: (input) => ipcRenderer.invoke("botapp:email:send-test-delivery", input),
    needsMoreTargetsPreview: () => ipcRenderer.invoke("botapp:email:needs-more-targets-preview"),
    accountLifecyclePreview: () => ipcRenderer.invoke("botapp:email:account-lifecycle-preview"),
    outboxPreview: () => ipcRenderer.invoke("botapp:email:outbox-preview"),
    deliverySettings: () => ipcRenderer.invoke("botapp:email:delivery-settings"),
    deliverySettingsAudit: () => ipcRenderer.invoke("botapp:email:delivery-settings-audit"),
    refreshDeliverySenders: () => ipcRenderer.invoke("botapp:email:refresh-delivery-senders"),
    saveDeliverySettings: (input) => ipcRenderer.invoke("botapp:email:save-delivery-settings", input),
  },
  deviceViews: {
    list: () => ipcRenderer.invoke("botapp:device-views:list"),
    open: (input) => ipcRenderer.invoke("botapp:device-views:open", input),
    focus: (deviceSerial) => ipcRenderer.invoke("botapp:device-views:focus", deviceSerial),
    close: (deviceSerial) => ipcRenderer.invoke("botapp:device-views:close", deviceSerial),
    subscribe: (callback) => {
      const handler = (_event, state) => callback(state);
      ipcRenderer.on(DEVICE_VIEW_STATE, handler);
      return () => ipcRenderer.off(DEVICE_VIEW_STATE, handler);
    },
  },
});

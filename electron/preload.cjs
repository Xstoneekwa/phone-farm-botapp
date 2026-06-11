const { contextBridge, ipcRenderer } = require("electron");

const DEVICE_VIEW_STATE = "botapp:device-views:state";

contextBridge.exposeInMainWorld("botappDesktop", {
  platform: process.platform,
  mode: process.env.NODE_ENV === "development" ? "development" : "packaged",
  runtime: {
    status: () => ipcRenderer.invoke("botapp:runtime:status"),
  },
  compass: {
    status: () => ipcRenderer.invoke("botapp:compass:ai-status"),
    saveRelayConfig: (input) => ipcRenderer.invoke("botapp:compass:save-relay-config", input),
    removeRelayConfig: () => ipcRenderer.invoke("botapp:compass:remove-relay-config"),
    analyze: (input) => ipcRenderer.invoke("botapp:compass:analyze", input),
  },
  autoRestart: {
    overview: () => ipcRenderer.invoke("botapp:auto-restart:overview"),
    dryRun: () => ipcRenderer.invoke("botapp:auto-restart:dry-run"),
    actionPreview: (input) => ipcRenderer.invoke("botapp:auto-restart:action-preview", input),
  },
  data: {
    overview: () => ipcRenderer.invoke("botapp:data:overview"),
  },
  profiles: {
    details: (accountId) => ipcRenderer.invoke("botapp:profiles:details", accountId),
    createDryRun: (input) => ipcRenderer.invoke("botapp:profiles:create-dry-run", input),
    create: (input) => ipcRenderer.invoke("botapp:profiles:create", input),
    credentials: {
      submit: (input) => ipcRenderer.invoke("botapp:profiles:credentials:submit", input),
    },
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

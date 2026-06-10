const { contextBridge, ipcRenderer } = require("electron");

const DEVICE_VIEW_STATE = "botapp:device-views:state";

contextBridge.exposeInMainWorld("botappDesktop", {
  platform: process.platform,
  mode: process.env.NODE_ENV === "development" ? "development" : "packaged",
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

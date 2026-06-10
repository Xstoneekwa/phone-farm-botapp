/* global setTimeout */

const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");
const { closeAllDeviceViews, registerDeviceViewIpc, runDeviceViewSelfTest } = require("./device-view-manager.cjs");

const isDev = !app.isPackaged;
const devServerUrl = process.env.BOTAPP_DEV_SERVER_URL || "http://127.0.0.1:5173";

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    title: "BotApp",
    backgroundColor: "#0B1020",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error("[BotApp] renderer load failed", { errorCode, errorDescription, validatedURL });
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) {
      shell.openExternal(url);
    }

    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const allowedOrigin = isDev ? devServerUrl : `file://${path.join(__dirname, "../dist/index.html")}`;

    if (!url.startsWith(allowedOrigin)) {
      event.preventDefault();
    }
  });

  const indexPath = path.join(__dirname, "../dist/index.html");

  if (isDev) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(indexPath);
  }
}

app.whenReady().then(() => {
  registerDeviceViewIpc();
  createMainWindow();

  if (process.env.BOTAPP_DEVICE_VIEW_SELF_TEST) {
    setTimeout(() => {
      runDeviceViewSelfTest()
        .catch((error) => {
          console.error("[BotApp device-view self-test]", error);
        })
        .finally(() => {
          if (process.env.BOTAPP_DEVICE_VIEW_SELF_TEST_QUIT !== "0") {
            app.quit();
          }
        });
    }, 1500);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  closeAllDeviceViews();
});

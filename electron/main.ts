import { app, BrowserWindow, Menu, shell, session } from "electron";
import path from "node:path";

const APP_HASH_ROUTE = "/editor";
const BLOCKED_REMOTE_SERVICE_PATH_PATTERNS = [
  /\/api\/ai(?:\/|$)/i,
  /\/api\/auth\/google(?:\/|$)/i,
  /\/api\/internal\/ai(?:\/|$)/i,
  /\/api\/share(?:\/|$)/i,
  /\/api\/tex(?:\/|$)/i,
  /\/api\/workspace(?:\/|$)/i,
];
const BLOCKED_REMOTE_SERVICE_HOST_PATTERNS = [
  /(^|\.)generativelanguage\.googleapis\.com$/i,
  /(^|\.)aiplatform\.googleapis\.com$/i,
  /(^|\.)googleapis\.com$/i,
];

const isAllowedExternalUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
};

const shouldBlockRequest = (url: string) => {
  try {
    const parsed = new URL(url);
    return BLOCKED_REMOTE_SERVICE_HOST_PATTERNS.some((pattern) => pattern.test(parsed.hostname))
      || BLOCKED_REMOTE_SERVICE_PATH_PATTERNS.some((pattern) => pattern.test(parsed.pathname));
  } catch {
    return false;
  }
};

const installNetworkGuards = () => {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: shouldBlockRequest(details.url) });
  });
};

const createMainWindow = async () => {
  const mainWindow = new BrowserWindow({
    backgroundColor: "#0f172a",
    height: 900,
    minHeight: 720,
    minWidth: 1080,
    show: false,
    title: "Docsy",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
      sandbox: true,
      webSecurity: true,
    },
    width: 1440,
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }

    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const currentUrl = mainWindow.webContents.getURL();

    if (url !== currentUrl && isAllowedExternalUrl(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL?.trim();

  if (!app.isPackaged && rendererUrl) {
    await mainWindow.loadURL(`${rendererUrl.replace(/\/$/, "")}/#${APP_HASH_ROUTE}`);
    mainWindow.webContents.openDevTools({ mode: "detach" });
    return;
  }

  await mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"), {
    hash: APP_HASH_ROUTE,
  });
};

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  installNetworkGuards();
  await createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

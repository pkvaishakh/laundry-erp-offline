// Electron main process for the LaundryPro desktop build.
//
// This does not reimplement the app — it spawns the same Next.js
// `output: "standalone"` server bundle used by `npm run build`, waits for it
// to come up on a free local port, then shows it in a native window. All
// business logic still lives in src/app/**; this file only exists to make
// that server feel like an installed desktop app instead of something you
// have to open a terminal for.
const { app, BrowserWindow, Menu, ipcMain, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const { spawn } = require("node:child_process");

let serverProcess = null;
let mainWindow = null;

function getStandaloneDir() {
  // Packaged app: electron-builder copies .next/standalone into
  // resources/standalone (see the "extraResources" build config).
  // Dev/test run (`npm run electron:dev`, after `npm run build`): read the
  // standalone output straight out of the project tree.
  return app.isPackaged
    ? path.join(process.resourcesPath, "standalone")
    : path.join(__dirname, "..", ".next", "standalone");
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function waitForServer(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get({ host: "127.0.0.1", port, path: "/", timeout: 1500 }, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() > deadline) reject(new Error("LaundryPro server did not start in time"));
        else setTimeout(tryOnce, 300);
      });
      req.on("timeout", () => req.destroy());
    };
    tryOnce();
  });
}

async function startServer() {
  const standaloneDir = getStandaloneDir();
  const serverEntry = path.join(standaloneDir, "server.js");
  if (!fs.existsSync(serverEntry)) {
    throw new Error(
      `Could not find the app server at ${serverEntry}. Run "npm run build" (and the standalone asset copy step) before launching Electron.`
    );
  }

  // Business data (laundrypro.db, read in src/db/index.ts) lives in a FIXED
  // folder, %APPDATA%\LaundryPro. Not app.getPath("userData"): that folder is
  // named after package.json "name", so renaming the package silently
  // switched the app to a new, empty data folder.
  const dataDir = path.join(app.getPath("appData"), "LaundryPro");
  fs.mkdirSync(dataDir, { recursive: true });

  // Old JSON stores from earlier versions, imported once into the new
  // database on first launch (and never modified or deleted).
  const legacyFiles = [
    path.join(app.getPath("userData"), "data", ".offline-data.json"),
    ...["nextjs-postgresql-template", "nextjs-nodejs", "LaundryPro", "Electron"].map((name) =>
      path.join(app.getPath("appData"), name, "data", ".offline-data.json")
    ),
  ].filter((file, i, all) => all.indexOf(file) === i);

  const port = await getFreePort();

  serverProcess = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
      LAUNDRYPRO_DATA_DIR: dataDir,
      LAUNDRYPRO_LEGACY_FILES: JSON.stringify(legacyFiles),
      // The bundled Electron Node binary otherwise tries to run in Electron
      // mode when invoked directly; this makes it behave like plain Node.
      ELECTRON_RUN_AS_NODE: "1",
    },
    stdio: "pipe",
    windowsHide: true,
  });

  serverProcess.stdout.on("data", (d) => process.stdout.write(`[server] ${d}`));
  serverProcess.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));

  await waitForServer(port);
  return port;
}

function stopServer() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
    serverProcess = null;
  }
}

async function createWindow() {
  const port = await startServer();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: "LaundryPro",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Links to other sites (wa.me, etc.) open in the user's normal browser
  // rather than a bare Electron window; custom schemes (whatsapp://, tel:)
  // go to whatever app Windows has registered for them.
  const appOrigin = `http://127.0.0.1:${port}`;
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(appOrigin)) return { action: "allow" };
    if (/^(https?|whatsapp|tel|mailto):/i.test(url)) shell.openExternal(url).catch(() => {});
    return { action: "deny" };
  });

  mainWindow.loadURL(appOrigin);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// WhatsApp share: unlike a browser, the main process can ask Windows whether
// an app is registered for whatsapp:// links, so it opens exactly one of the
// desktop app or WhatsApp Web — never both.
ipcMain.handle("open-whatsapp", async (_event, appUrl, webUrl) => {
  if (typeof appUrl !== "string" || !appUrl.startsWith("whatsapp://send?")) throw new Error("Invalid WhatsApp app URL");
  if (typeof webUrl !== "string" || !webUrl.startsWith("https://wa.me/")) throw new Error("Invalid WhatsApp web URL");
  if (app.getApplicationNameForProtocol("whatsapp://")) {
    await shell.openExternal(appUrl);
    return "app";
  }
  await shell.openExternal(webUrl);
  return "web";
});

// Only one LaundryPro may run at a time. A second copy would spawn a second
// server with its own in-memory snapshot of .offline-data.json, and whichever
// server saved last would overwrite the file with its stale snapshot —
// silently deleting orders created in the other window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
}

app.whenReady().then(() => {
  if (!app.hasSingleInstanceLock()) return;
  Menu.setApplicationMenu(null);
  createWindow().catch((err) => {
    console.error(err);
    app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  stopServer();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", stopServer);
app.on("will-quit", stopServer);

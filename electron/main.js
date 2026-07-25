/**
 * Electron main process for RTL-SDR V3 Console.
 * Spawns Next.js + SDR bridge + rtl_tcp automatically.
 */

const { app, BrowserWindow, ipcMain } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");
const net = require("node:net");
const http = require("node:http");

let nextServer = null;
let bridgeProcess = null;
let rtlTcpProcess = null;
let bridgePort = 8080;
let nextPort = 3000;

function findFreePort(start) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(start, () => {
      const addr = server.address();
      server.close(() => resolve(addr && addr.port ? addr.port : start));
    });
    server.on("error", () => resolve(start + 1));
  });
}

async function startNextServer(isDev) {
  nextPort = await findFreePort(3000);
  const cwd = path.resolve(__dirname, "..");

  if (isDev) {
    nextServer = spawn("npx", ["next", "dev", "-p", String(nextPort)], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });
  } else {
    nextServer = spawn("node", ["standalone/server.js"], {
      cwd: path.join(cwd, ".next"),
      env: { ...process.env, PORT: String(nextPort) },
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  nextServer.stdout?.on("data", (data) => {
    const msg = data.toString();
    if (msg.includes("Ready") || msg.includes("ready")) {
      console.log("[electron] Next.js ready on port", nextPort);
    }
  });
  nextServer.stderr?.on("data", (data) => {
    console.error("[electron] Next.js:", data.toString().trim());
  });
}

async function startBridge(bridgePath) {
  bridgePort = await findFreePort(8080);
  const bridgeDir = path.dirname(bridgePath);
  const projectRoot = path.resolve(__dirname, "..");
  const projectNodeModules = path.join(projectRoot, "node_modules");

  bridgeProcess = spawn("node", [path.basename(bridgePath), "--ws-port", String(bridgePort)], {
    cwd: bridgeDir,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_PATH: projectNodeModules + ":" + (process.env.NODE_PATH || ""),
    },
  });

  bridgeProcess.stdout?.on("data", (data) => {
    console.log("[bridge]", data.toString().trim());
  });
  bridgeProcess.stderr?.on("data", (data) => {
    console.error("[bridge]", data.toString().trim());
  });
}

function tryStartRtlTcp() {
  try {
    rtlTcpProcess = spawn("rtl_tcp", ["-s", "2400000"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    rtlTcpProcess.stdout?.on("data", (data) => {
      console.log("[rtl_tcp]", data.toString().trim());
    });
    rtlTcpProcess.stderr?.on("data", (data) => {
      const msg = data.toString();
      if (msg.includes("Listening on TCP port")) {
        console.log("[rtl_tcp] ready on port 1234");
      } else if (msg.includes("usb_open error") || msg.includes("Failed to open")) {
        console.log("[rtl_tcp] USB error — simulated mode or fix permissions");
      }
    });
    rtlTcpProcess.on("error", () => {
      console.log("[rtl_tcp] not found — install rtl-sdr for hardware support");
      rtlTcpProcess = null;
    });
  } catch {
    rtlTcpProcess = null;
  }
}

async function waitForUrl(url, maxWaitMs) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          res.destroy();
          resolve(true);
        });
        req.on("error", reject);
        req.setTimeout(1000, () => { req.destroy(); reject(new Error("timeout")); });
      });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return false;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1024,
    minHeight: 700,
    title: "RTL-SDR V3 Console",
    backgroundColor: "#0a0e1a",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const loadWithRetry = async () => {
    const url = "http://localhost:" + nextPort;
    console.log("[electron] waiting for Next.js at", url, "...");
    const ready = await waitForUrl(url, 60000);
    if (ready) {
      console.log("[electron] Next.js is ready, loading window");
      win.loadURL(url);
    } else {
      console.log("[electron] Next.js didn't start in 60s, loading anyway");
      win.loadURL(url);
    }
  };
  loadWithRetry();

  if (process.env.ELECTRON_DEV) {
    win.webContents.openDevTools();
  }

  return win;
}

app.whenReady().then(async () => {
  const isDev = !!process.env.ELECTRON_DEV || !app.isPackaged;
  const cwd = path.resolve(__dirname, "..");

  console.log("[electron] starting in", isDev ? "dev" : "production", "mode");

  const bridgePath = path.join(cwd, "download", "sdr-bridge", "bridge.mjs");
  await startBridge(bridgePath);
  console.log("[electron] bridge started on port", bridgePort);

  tryStartRtlTcp();

  await startNextServer(isDev);
  console.log("[electron] Next.js started on port", nextPort);

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

ipcMain.handle("get-bridge-url", () => "ws://localhost:" + bridgePort);
ipcMain.handle("get-next-url", () => "http://localhost:" + nextPort);
ipcMain.handle("is-desktop", () => true);
ipcMain.handle("restart-rtl-tcp", () => {
  if (rtlTcpProcess) rtlTcpProcess.kill();
  tryStartRtlTcp();
  return true;
});

app.on("window-all-closed", () => {
  if (nextServer) nextServer.kill();
  if (bridgeProcess) bridgeProcess.kill();
  if (rtlTcpProcess) rtlTcpProcess.kill();
  app.quit();
});

app.on("before-quit", () => {
  if (nextServer) nextServer.kill();
  if (bridgeProcess) bridgeProcess.kill();
  if (rtlTcpProcess) rtlTcpProcess.kill();
});

process.on("exit", () => {
  if (nextServer) nextServer.kill();
  if (bridgeProcess) bridgeProcess.kill();
  if (rtlTcpProcess) rtlTcpProcess.kill();
});

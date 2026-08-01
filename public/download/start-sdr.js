#!/usr/bin/env node
/**
 * RTL-SDR V3 Console — Cross-platform launcher.
 *
 * Usage:
 *   node start-sdr.js              # desktop app (Electron)
 *   node start-sdr.js --web        # web app (opens browser)
 *   node start-sdr.js --update     # pull latest + reinstall + launch
 *
 * Works on Windows, macOS, and Linux. Place in the project root
 * and run with Node.js 20+.
 */

const { execSync, spawn, exec } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const REPO_URL = "https://github.com/jwfrancois/rtl-sdr-v3-console.git";
const args = process.argv.slice(2);
let MODE = "desktop";
let DO_UPDATE = false;

for (const arg of args) {
  if (arg === "--web") MODE = "web";
  else if (arg === "--update") DO_UPDATE = true;
  else if (arg === "--help" || arg === "-h") {
    console.log(`
RTL-SDR V3 Console Launcher

Usage: node start-sdr.js [options]

Options:
  (none)    Launch desktop app (Electron)
  --web     Launch web app (opens browser at localhost:3000)
  --update  Pull latest code + reinstall before launching
`);
    process.exit(0);
  }
}

// ANSI colors
const C = {
  red: "\x1b[31m", green: "\x1b[32m", cyan: "\x1b[36m",
  yellow: "\x1b[33m", reset: "\x1b[0m",
};

function log(step, msg, color = C.reset) {
  console.log(`${color}[${step}] ${msg}${C.reset}`);
}

const INSTALL_DIR = path.resolve(__dirname, "rtl-sdr-v3-console");

async function main() {
  console.log(`
${C.cyan}╔══════════════════════════════════════════════╗
║   RTL-SDR V3 Console — One-Click Launcher    ║
╚══════════════════════════════════════════════╝${C.reset}
`);

  // Step 1: Check Node.js version
  log("1/6", "Checking Node.js...", C.yellow);
  try {
    const version = execSync("node -v", { encoding: "utf-8" }).trim();
    const major = parseInt(version.replace("v", "").split(".")[0]);
    if (major >= 20) {
      log("1/6", `Node.js ${version} OK`, C.green);
    } else {
      console.log(`${C.red}  ✗ Node.js ${version} is too old (need >= 20)${C.reset}`);
      console.log(`${C.yellow}  Please install Node.js 20+ from https://nodejs.org${C.reset}`);
      process.exit(1);
    }
  } catch {
    console.log(`${C.red}  ✗ Node.js not found${C.reset}`);
    process.exit(1);
  }

  // Step 2: Clone or update repo
  log("2/6", "Checking project files...", C.yellow);
  const gitDir = path.join(INSTALL_DIR, ".git");
  if (fs.existsSync(gitDir)) {
    if (DO_UPDATE) {
      log("2/6", "Updating from GitHub...", C.cyan);
      execSync("git fetch origin && git reset --hard origin/main && rm -rf .next", {
        cwd: INSTALL_DIR, stdio: "pipe",
      });
      log("2/6", "Updated to latest version", C.green);
    } else {
      log("2/6", `Project found at ${INSTALL_DIR}`, C.green);
    }
  } else {
    log("2/6", "Cloning from GitHub...", C.cyan);
    execSync(`git clone "${REPO_URL}" "${INSTALL_DIR}"`, { stdio: "inherit" });
    log("2/6", "Cloned successfully", C.green);
  }

  // Step 3: Install dependencies
  log("3/6", "Installing dependencies...", C.yellow);
  const hasElectron = fs.existsSync(path.join(INSTALL_DIR, "node_modules/electron/dist"));
  if (!hasElectron || DO_UPDATE) {
    execSync("npm install --legacy-peer-deps", {
      cwd: INSTALL_DIR, stdio: "pipe",
    });
    log("3/6", "Dependencies installed", C.green);
  } else {
    log("3/6", "Dependencies already installed", C.green);
  }

  // Step 4: Fix Electron sandbox (Linux only)
  if (MODE === "desktop") {
    log("4/6", "Checking Electron sandbox...", C.yellow);
    const sandbox = path.join(INSTALL_DIR, "node_modules/electron/dist/chrome-sandbox");
    if (fs.existsSync(sandbox) && process.platform === "linux") {
      try {
        const stats = fs.statSync(sandbox);
        const perms = (stats.mode & 0o7777).toString(8);
        const owner = stats.uid;
        if (owner !== 0 || perms !== "4755") {
          log("4/6", "Fixing sandbox permissions (needs sudo)...", C.cyan);
          execSync(`sudo chown root "${sandbox}" && sudo chmod 4755 "${sandbox}"`, {
            stdio: "inherit",
          });
          log("4/6", "Sandbox permissions fixed", C.green);
        } else {
          log("4/6", "Sandbox permissions OK", C.green);
        }
      } catch {
        log("4/6", "Sandbox check skipped", C.yellow);
      }
    } else {
      log("4/6", "Sandbox check skipped (not Linux or not desktop)", C.yellow);
    }
  } else {
    log("4/6", "Skipping sandbox check (web mode)", C.yellow);
  }

  // Step 5: Start rtl_tcp
  log("5/6", "Starting rtl_tcp...", C.yellow);
  let rtlStarted = false;
  try {
    // Check if already running
    execSync("pgrep -x rtl_tcp", { stdio: "pipe" });
    log("5/6", "rtl_tcp already running", C.green);
    rtlStarted = true;
  } catch {
    // Try to start it
    try {
      const rtl = spawn("rtl_tcp", ["-s", "2400000"], {
        stdio: "ignore",
        detached: true,
      });
      rtl.unref();
      await new Promise(r => setTimeout(r, 2000));
      try {
        execSync("pgrep -x rtl_tcp", { stdio: "pipe" });
        log("5/6", "rtl_tcp started", C.green);
        rtlStarted = true;
      } catch {
        log("5/6", "rtl_tcp failed — USB permissions? Try: sudo rtl_tcp -s 2400000", C.yellow);
      }
    } catch {
      log("5/6", "rtl_tcp not installed — app will use simulated mode", C.yellow);
    }
  }

  // Step 6: Launch the app
  log("6/6", `Launching ${MODE === "desktop" ? "desktop app" : "web app"}...`, C.yellow);
  console.log("");

  if (MODE === "desktop") {
    console.log(`${C.cyan}  Starting Electron desktop app...${C.reset}`);
    console.log(`${C.cyan}  A native window will open shortly.${C.reset}\n`);
    const child = spawn("npx", ["electron", "electron/main.js"], {
      cwd: INSTALL_DIR,
      stdio: "inherit",
      shell: true,
      env: { ...process.env, ELECTRON_DEV: "1" },
    });
    child.on("exit", (code) => process.exit(code || 0));
  } else {
    console.log(`${C.cyan}  Starting Next.js dev server...${C.reset}`);
    console.log(`${C.cyan}  Open http://localhost:3000 in your browser.${C.reset}\n`);
    const child = spawn("npx", ["next", "dev", "-p", "3000"], {
      cwd: INSTALL_DIR,
      stdio: "inherit",
      shell: true,
    });
    child.on("exit", (code) => process.exit(code || 0));
  }
}

main().catch(err => {
  console.error(C.red + "Error: " + err.message + C.reset);
  process.exit(1);
});

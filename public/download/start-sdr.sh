#!/usr/bin/env bash
#
# RTL-SDR V3 Console — one-command launcher
#
# Usage:
#   ./start-sdr.sh          # launch desktop app
#   ./start-sdr.sh --web     # launch web app (opens browser)
#   ./start-sdr.sh --update  # pull latest + reinstall + launch
#
# This script:
#   1. Checks for Node.js 20+ (installs via nvm if missing)
#   2. Clones the repo if not present, or updates if present
#   3. Installs dependencies
#   4. Fixes the Electron sandbox permissions (Linux one-time fix)
#   5. Starts rtl_tcp (if installed)
#   6. Starts rtl_tcp (if installed and dongle is connected)
#   7. Launches the desktop app (Electron) or web app
#
# Place this script on your Desktop and run:
#   chmod +x ~/Desktop/start-sdr.sh
#   ~/Desktop/start-sdr.sh
#

set -e

# --- Config ---
REPO_URL="https://github.com/jwfrancois/rtl-sdr-v3-console.git"
INSTALL_DIR="$HOME/Desktop/rtl-sdr-v3-console"
MODE="desktop"
DO_UPDATE=false

# Parse args
for arg in "$@"; do
  case "$arg" in
    --web)    MODE="web" ;;
    --update) DO_UPDATE=true ;;
    --help|-h)
      echo "RTL-SDR V3 Console Launcher"
      echo ""
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  (none)    Launch desktop app (Electron)"
      echo "  --web     Launch web app (opens browser at localhost:3000)"
      echo "  --update  Pull latest code + reinstall before launching"
      echo ""
      exit 0
      ;;
  esac
done

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════╗"
echo "║     RTL-SDR V3 Console — One-Click Start    ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${NC}"

# --- Step 1: Check Node.js version ---
echo -e "${YELLOW}[1/6] Checking Node.js...${NC}"
if command -v node &>/dev/null; then
  NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_VERSION" -ge 20 ]; then
    echo -e "${GREEN}  ✓ Node.js $(node -v) (>= 20)${NC}"
  else
    echo -e "${RED}  ✗ Node.js $(node -v) is too old (need >= 20)${NC}"
    echo -e "${YELLOW}  Attempting to install Node.js 20 via nvm...${NC}"
    if [ ! -d "$HOME/.nvm" ]; then
      curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    fi
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    nvm install 20
    nvm use 20
    echo -e "${GREEN}  ✓ Node.js $(node -v) installed via nvm${NC}"
  fi
else
  echo -e "${RED}  ✗ Node.js not found. Installing via nvm...${NC}"
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  nvm install 20
  nvm use 20
  echo -e "${GREEN}  ✓ Node.js $(node -v) installed${NC}"
fi

# --- Step 2: Clone or update the repo ---
echo -e "${YELLOW}[2/6] Checking project files...${NC}"
if [ -d "$INSTALL_DIR/.git" ]; then
  if [ "$DO_UPDATE" = true ]; then
    echo -e "${CYAN}  Updating from GitHub...${NC}"
    cd "$INSTALL_DIR"
    git fetch origin
    git reset --hard origin/main
    rm -rf .next
    echo -e "${GREEN}  ✓ Updated to latest version${NC}"
  else
    echo -e "${GREEN}  ✓ Project found at $INSTALL_DIR${NC}"
  fi
else
  echo -e "${CYAN}  Cloning from GitHub...${NC}"
  git clone "$REPO_URL" "$INSTALL_DIR"
  echo -e "${GREEN}  ✓ Cloned to $INSTALL_DIR${NC}"
fi
cd "$INSTALL_DIR"

# --- Step 3: Install dependencies ---
echo -e "${YELLOW}[3/6] Installing dependencies...${NC}"
if [ ! -d "node_modules/electron" ] || [ "$DO_UPDATE" = true ]; then
  npm install --legacy-peer-deps 2>&1 | tail -3
  echo -e "${GREEN}  ✓ Dependencies installed${NC}"
else
  echo -e "${GREEN}  ✓ Dependencies already installed${NC}"
fi

# --- Step 4: Fix Electron sandbox (Linux) ---
if [ "$MODE" = "desktop" ]; then
  echo -e "${YELLOW}[4/6] Checking Electron sandbox...${NC}"
  SANDBOX="node_modules/electron/dist/chrome-sandbox"
  if [ -f "$SANDBOX" ]; then
    CURRENT_OWNER=$(stat -c %U "$SANDBOX" 2>/dev/null || echo "unknown")
    CURRENT_PERMS=$(stat -c %a "$SANDBOX" 2>/dev/null || echo "000")
    if [ "$CURRENT_OWNER" != "root" ] || [ "$CURRENT_PERMS" != "4755" ]; then
      echo -e "${CYAN}  Fixing sandbox permissions (needs sudo)...${NC}"
      sudo chown root "$SANDBOX"
      sudo chmod 4755 "$SANDBOX"
      echo -e "${GREEN}  ✓ Sandbox permissions fixed${NC}"
    else
      echo -e "${GREEN}  ✓ Sandbox permissions OK${NC}"
    fi
  else
    echo -e "${YELLOW}  ⚠ Electron not installed yet — will fix on first run${NC}"
  fi
else
  echo -e "${YELLOW}[4/6] Skipping sandbox check (web mode)${NC}"
fi

# --- Step 5: Start rtl_tcp (if available) ---
echo -e "${YELLOW}[5/6] Starting rtl_tcp...${NC}"
if command -v rtl_tcp &>/dev/null; then
  # Check if it's already running
  if pgrep -x rtl_tcp &>/dev/null; then
    echo -e "${GREEN}  ✓ rtl_tcp already running${NC}"
  else
    rtl_tcp -s 2400000 &>/dev/null &
    RTL_PID=$!
    sleep 2
    if kill -0 $RTL_PID 2>/dev/null; then
      echo -e "${GREEN}  ✓ rtl_tcp started (PID $RTL_PID)${NC}"
    else
      echo -e "${YELLOW}  ⚠ rtl_tcp failed — check USB permissions (sudo rtl_tcp -s 2400000)${NC}"
    fi
  fi
else
  echo -e "${YELLOW}  ⚠ rtl_tcp not installed${NC}"
  echo -e "${CYAN}    Install: sudo apt install rtl-sdr (Linux) or brew install librtlsdr (macOS)${NC}"
  echo -e "${CYAN}    App will start in simulated mode${NC}"
fi

# --- Step 6: Launch the app ---
echo -e "${YELLOW}[6/6] Launching RTL-SDR V3 Console...${NC}"
echo ""

if [ "$MODE" = "desktop" ]; then
  echo -e "${CYAN}  Starting desktop app (Electron)...${NC}"
  echo -e "${CYAN}  A native window will open shortly.${NC}"
  echo ""
  ELECTRON_DEV=1 npx electron electron/main.js
else
  echo -e "${CYAN}  Starting web app...${NC}"
  echo -e "${CYAN}  Open http://localhost:3000 in your browser.${NC}"
  echo ""
  npx next dev -p 3000
fi

#!/usr/bin/env bash
# =============================================================================
# Onlook — Designer Setup for Mac
# =============================================================================
#
# BEFORE SHARING THIS SCRIPT:
#   Fill in ENV_URL below with the private download link for the .env.local file.
#   Example: ENV_URL="https://gist.githubusercontent.com/.../raw/.../.env.local"
#
ENV_URL=""  # Fill in the private config URL before sharing this script (shared via Slack)
# =============================================================================

set -euo pipefail

REPO_URL="https://github.com/martin-iliew/onlook.git"
INSTALL_DIR="$HOME/Desktop/onlook"
SETUP_MARKER="$HOME/.onlook_setup_done"

# ── Colors ────────────────────────────────────────────────────────────────────
BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
DIM='\033[2m'
NC='\033[0m'

step()  { echo -e "\n${BOLD}${CYAN}▶  $1${NC}"; }
ok()    { echo -e "   ${GREEN}✓${NC}  $1"; }
warn()  { echo -e "   ${YELLOW}⚠  $1${NC}"; }
pause() { echo -e "\n${BOLD}${YELLOW}   ⏸  $1${NC}"; }
err()   { echo -e "\n${RED}✗  $1${NC}\n" >&2; exit 1; }

# ── Preflight ─────────────────────────────────────────────────────────────────

[[ "$OSTYPE" == "darwin"* ]] || err "This script only runs on Mac."

[[ -n "$ENV_URL" ]] || err "ENV_URL is empty. Martin needs to fill in the download link before sharing this script."

echo -e "\n${BOLD}Welcome! This will set up Onlook on your Mac.${NC}"
echo -e "${DIM}Grab a coffee — this takes about 10 minutes the first time.${NC}\n"

# ── Homebrew ──────────────────────────────────────────────────────────────────

step "Homebrew (package manager)"
if command -v brew &>/dev/null; then
    ok "Already installed"
else
    echo -e "   ${DIM}Installing Homebrew — it will ask for your Mac password...${NC}"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # Apple Silicon Macs need Homebrew added to PATH
    if [[ -f /opt/homebrew/bin/brew ]]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
        echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> "$HOME/.zprofile"
    fi
    ok "Installed"
fi

# ── Git + Node.js ─────────────────────────────────────────────────────────────

step "Git and Node.js"
NEED_INSTALL=()
command -v git  &>/dev/null || NEED_INSTALL+=("git")
command -v node &>/dev/null || NEED_INSTALL+=("node")

if [[ ${#NEED_INSTALL[@]} -gt 0 ]]; then
    brew install "${NEED_INSTALL[@]}"
    ok "Installed: ${NEED_INSTALL[*]}"
else
    ok "Already installed"
fi

# ── Bun ───────────────────────────────────────────────────────────────────────

step "Bun (project package manager)"
if command -v bun &>/dev/null; then
    ok "Already installed ($(bun --version))"
else
    curl -fsSL https://bun.sh/install | bash
    # Add bun to PATH for the rest of this script
    export PATH="$HOME/.bun/bin:$PATH"
    ok "Installed"
fi

# ── Docker Desktop ────────────────────────────────────────────────────────────

step "Docker Desktop"
DOCKER_INSTALLED=false
if command -v docker &>/dev/null || [[ -d "/Applications/Docker.app" ]]; then
    DOCKER_INSTALLED=true
    ok "Already installed"
else
    echo -e "   ${DIM}Installing Docker Desktop via Homebrew (~500 MB)...${NC}"
    brew install --cask docker
    ok "Installed"
fi

# Launch Docker if not already running
if ! docker info &>/dev/null 2>&1; then
    open -a Docker

    if [[ "$DOCKER_INSTALLED" == "false" ]]; then
        pause "Docker Desktop just opened for the first time."
        echo -e "   It will show a ${BOLD}license agreement${NC} — click Accept, then come back here."
        echo -e "\n   ${DIM}Press Enter once Docker is running (the whale icon in your menu bar stops animating)...${NC}"
        read -r
    else
        echo -e "   ${DIM}Waiting for Docker to start...${NC}"
    fi

    echo -n "   Checking Docker"
    WAIT=0
    until docker info &>/dev/null 2>&1; do
        echo -n "."
        sleep 3
        (( WAIT += 3 ))
        if (( WAIT > 120 )); then
            err "Docker took too long to start. Open Docker Desktop manually and run this script again."
        fi
    done
    echo ""
    ok "Docker is running"
else
    ok "Already running"
fi

# ── Claude Code CLI ───────────────────────────────────────────────────────────

step "Claude Code"
if command -v claude &>/dev/null; then
    ok "Already installed"
else
    npm install -g @anthropic-ai/claude-code
    ok "Installed"
fi

# Authenticate if needed (claude exits non-zero if not logged in)
if ! claude --version &>/dev/null 2>&1; then
    pause "You need to sign in to Claude."
    echo -e "   A browser window will open — log in with your Anthropic account."
    echo -e "   Come back here when the browser says you're signed in.\n"
    claude auth login || true
else
    ok "Signed in"
fi

# ── Clone / Update project ────────────────────────────────────────────────────

step "Project files"
if [[ -d "$INSTALL_DIR/.git" ]]; then
    echo -e "   ${DIM}Updating to latest version...${NC}"
    git -C "$INSTALL_DIR" pull --ff-only
    ok "Up to date"
else
    git clone "$REPO_URL" "$INSTALL_DIR"
    ok "Cloned to $INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# ── Dependencies ──────────────────────────────────────────────────────────────

step "Installing project dependencies"
bun install
ok "Done"

# ── Environment file ──────────────────────────────────────────────────────────

step "Downloading environment config"
mkdir -p apps/web/client
if curl -fsSL "$ENV_URL" -o apps/web/client/.env.local; then
    ok "Saved to apps/web/client/.env.local"
else
    err "Could not download the .env.local file. The URL may be expired — ask Martin for a new one."
fi

# ── Local database (Supabase) ─────────────────────────────────────────────────

step "Starting local database"
echo -e "   ${DIM}First run downloads containers — this may take 2–4 minutes...${NC}"
bun run backend:start
ok "Supabase is running"

# ── Setup script ──────────────────────────────────────────────────────────────

step "Configuring environment keys"
bun run setup:cc
ok "Done"

# ── Database setup (first time only) ─────────────────────────────────────────

if [[ ! -f "$SETUP_MARKER" ]]; then
    step "Setting up database (first time only)"
    bun run db:push
    bun run db:seed
    touch "$SETUP_MARKER"
    ok "Database ready"
else
    ok "Database already set up — skipping"
fi

# ── Done ──────────────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${GREEN}  Setup complete!${NC}"
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Starting Onlook and opening your browser...\n"

sleep 2
open "http://localhost:3000" &
bun run dev:cc

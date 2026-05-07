Set up Onlook from scratch. Use friendly, non-technical language throughout. Never show raw error output without explaining what it means in plain words.

The user has passed this config link: `$ARGUMENTS`

---

## Welcome

Start by saying:

"Welcome! I'm going to set up Onlook on your computer. This takes about 5–10 minutes the first time — mostly waiting for things to download. I'll handle everything and let you know if I need anything from you."

---

## Step 0: Detect operating system

Run:
```bash
uname -s 2>/dev/null || echo "Windows"
```

- Output starts with `Darwin` → **Mac**
- Anything else → **Windows**

---

## Step 1: Get into the project

Check if we're already inside the Onlook repo:
```bash
test -f apps/web/client/package.json && echo "in_repo"
```

If yes — great, all subsequent commands run from here. Skip to Step 2.

If no — find or download it:

**Mac:**
```bash
test -d ~/Desktop/onlook/apps && echo "exists"
```
If exists: `cd ~/Desktop/onlook`

If not:
```bash
curl -L "https://github.com/martin-iliew/onlook/archive/refs/heads/main.zip" -o /tmp/onlook.zip && unzip -q /tmp/onlook.zip -d ~/Desktop && mv ~/Desktop/onlook-main ~/Desktop/onlook && cd ~/Desktop/onlook
```

**Windows:**
```bash
test -d ~/Desktop/onlook/apps && echo "exists"
```
If exists: `cd ~/Desktop/onlook`

If not:
```bash
curl -L "https://github.com/martin-iliew/onlook/archive/refs/heads/main.zip" -o "$USERPROFILE/Downloads/onlook.zip" && unzip -q "$USERPROFILE/Downloads/onlook.zip" -d "$USERPROFILE/Desktop" && mv "$USERPROFILE/Desktop/onlook-main" "$USERPROFILE/Desktop/onlook" && cd "$USERPROFILE/Desktop/onlook"
```

If any download fails: "I couldn't download the project. Check your internet connection and try again."

**All steps below run from the project root.**

---

## Step 2: Prerequisites

Check and install each tool. Skip with a short "already installed" message if present.

### Mac

Run all Mac prerequisite checks and installs as a single shell block so PATH changes carry through within the same invocation:

```bash
# Ensure Homebrew is on PATH (Apple Silicon uses /opt/homebrew, Intel uses /usr/local)
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# Install Homebrew if missing
if ! command -v brew &>/dev/null; then
  echo "Installing Homebrew — it will ask for your Mac password. Type it and press Enter (you won't see characters appear — that is normal)."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Re-load for Apple Silicon
  test -f /opt/homebrew/bin/brew && eval "$(/opt/homebrew/bin/brew shellenv)"
  # Persist for future shell sessions
  echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.bash_profile
fi

# Git
command -v git &>/dev/null || brew install git

# Node.js
command -v node &>/dev/null || brew install node

# Bun
if ! command -v bun &>/dev/null; then
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
fi

echo "All tools ready"
```

If any step fails, explain it in plain language and stop.

---

### Windows

**Git:**
```bash
command -v git
```
If missing: `winget install --id Git.Git -e --source winget`

**Node.js:**
```bash
command -v node
```
If missing: `winget install --id OpenJS.NodeJS -e --source winget`

**Bun:**
```bash
command -v bun
```
If missing:
```bash
powershell -Command "irm bun.sh/install.ps1 | iex" && export PATH="$USERPROFILE/.bun/bin:$PATH"
```

---

Say: "All tools are ready!"

---

## Step 3: Install dependencies

```bash
test -d node_modules && echo "done"
```

If done: say "Dependencies already installed" and skip.

Otherwise:
```bash
bun install
```

---

## Step 4: Environment config

Check if both config files already exist:
```bash
test -f apps/web/client/.env.local && test -f packages/db/.env && echo "done"
```

If done: say "Config already set up" and skip this step.

Otherwise:

**Get the config link:**

- If `$ARGUMENTS` is a non-empty URL (starts with `http`): use it as the base URL.
- If `$ARGUMENTS` is empty: say "I need the config link that was shared with you on Slack. Paste it here and press Enter." — then wait and use their response.

With the base URL (call it `GIST_BASE`), download both config files to their correct locations inside the project:

```bash
curl -fsSL "${GIST_BASE}/.env.local" -o apps/web/client/.env.local
curl -fsSL "${GIST_BASE}/.env" -o packages/db/.env
```

If either download fails: "I couldn't download the config — the link may be expired. Ask Martin for a fresh one." and stop.

---

## Step 5: Launch

Say: "Everything is set up! Starting Onlook now..."

Start the dev server in the background (use run_in_background: true):
```bash
bun run dev:cc
```

Wait 8 seconds, then open the browser:
- **Mac:** `open http://localhost:3000`
- **Windows:** `start http://localhost:3000`

Say: "Onlook is running! Your browser should have opened to http://localhost:3000

The first time, create a local account — pick any email and password. It stays on your machine, nothing is sent anywhere.

From now on, each day just open Terminal (Mac) or Git Bash (Windows), navigate to the onlook folder, run `claude`, then type **/start**. When you're done, type **/stop**."

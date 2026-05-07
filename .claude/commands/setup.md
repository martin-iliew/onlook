Set up Onlook from scratch on the designer's Mac. Use friendly, non-technical language throughout. Never show raw error output without explaining what it means in plain words.

## Welcome

Start by saying:

"Welcome! I'm going to set up Onlook on your Mac. This takes about 3–5 minutes. I'll handle everything automatically — just sit back."

## Detect Re-run

Check these signals to see what's already done:

```bash
test -d node_modules && echo "deps_done"
test -f apps/web/client/.env.local && echo "env_done"
test -f .env && echo "root_env_done"
```

If all three signals are present, say: "It looks like Onlook was already set up on this machine. Let me make sure everything is still good and skip steps that are done."

## Phase 1: Prerequisites

Check and install each tool. Skip with a short message if already installed.

### Homebrew

```bash
command -v brew
```

If missing:
- Say: "Installing Homebrew — your Mac's package manager. It will ask for your Mac login password. Type it and press Enter (you won't see any characters appear — that's normal)."
- Run: `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`
- After install, add to PATH for Apple Silicon Macs:
  ```bash
  test -f /opt/homebrew/bin/brew && eval "$(/opt/homebrew/bin/brew shellenv)"
  ```

### Git

```bash
command -v git
```

If missing: `brew install git`

### Node.js

```bash
command -v node
```

If missing: `brew install node`

### Bun

```bash
command -v bun
```

If missing:
- Say: "Installing Bun — the package manager this project uses."
- Run: `curl -fsSL https://bun.sh/install | bash`
- Make available immediately: `export PATH="$HOME/.bun/bin:$PATH"`
- Verify: `bun --version`

Say: "All tools are installed!"

## Phase 2: Install Dependencies

If `node_modules` already exists, say "Dependencies already installed" and skip.

Otherwise:
- Say: "Installing project dependencies..."
- Run: `bun install`

## Phase 3: Environment Config

If both `apps/web/client/.env.local` and `.env` already exist, say "Config already set up" and skip this whole phase.

Otherwise:
- Say: "Downloading the app configuration..."
- Download the main config:
  ```bash
  curl -fsSL "https://gist.githubusercontent.com/martin-iliew/f5199022778f6eda3fc574cb5a5389a0/raw/.env.local" -o apps/web/client/.env.local
  ```
  If the download fails, say: "I couldn't download the config file — the link may have expired. Ask Martin for a fresh one." and stop.

- Now create the root `.env` that database tools need (the variables are the same but with different names):
  ```bash
  grep '^SUPABASE_DATABASE_URL=' apps/web/client/.env.local > .env
  grep '^SUPABASE_SERVICE_ROLE_KEY=' apps/web/client/.env.local >> .env
  echo "SUPABASE_URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' apps/web/client/.env.local | sed 's/NEXT_PUBLIC_SUPABASE_URL=//')" >> .env
  ```

## Phase 4: Launch

Say: "Everything is ready! Starting the app now..."

Start the dev server in the background (use run_in_background: true):
```bash
bun run dev:cc
```

Wait 5 seconds, then open the browser:
```bash
open http://localhost:3000
```

Say: "Onlook is running! Your browser should have opened to http://localhost:3000. Create a local account — just pick an email and password, it stays on your machine.

From now on:
- Type **/start** to launch Onlook each day
- Type **/stop** when you're done"

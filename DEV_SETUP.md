# Dev Setup

## For designers (no Git, no Docker, no config)

Works on Mac and Windows. You'll receive a config link via Slack — have it ready for step 3.

### One-time setup

**1. Install Claude Code**
Download from [claude.ai/code](https://claude.ai/code) and sign in with your Anthropic account.

**2. Open Terminal and run the one-liner for your OS:**

**Mac** (Terminal: Cmd+Space → type Terminal → Enter):
```bash
curl -L "https://github.com/martin-iliew/onlook/archive/refs/heads/main.zip" -o /tmp/onlook.zip && unzip -q /tmp/onlook.zip -d ~/Desktop && mv ~/Desktop/onlook-main ~/Desktop/onlook && cd ~/Desktop/onlook && claude
```

**Windows** (Git Bash: Start → type "Git Bash" → Enter):
```bash
curl -L "https://github.com/martin-iliew/onlook/archive/refs/heads/main.zip" -o "$USERPROFILE/Downloads/onlook.zip" && unzip -q "$USERPROFILE/Downloads/onlook.zip" -d "$USERPROFILE/Desktop" && mv "$USERPROFILE/Desktop/onlook-main" "$USERPROFILE/Desktop/onlook" && cd "$USERPROFILE/Desktop/onlook" && claude
```

This downloads the project and opens Claude Code inside it. No Git required.

**3. In the Claude window that opens, type:**
```
/setup <paste-your-config-link-here>
```

Replace `<paste-your-config-link-here>` with the link you received on Slack. Claude handles everything — installs tools, downloads config, launches the app. Onlook opens in your browser automatically.

### Every day after that

**Mac:**
```bash
cd ~/Desktop/onlook && claude
```

**Windows (Git Bash):**
```bash
cd "$USERPROFILE/Desktop/onlook" && claude
```

Then type `/start`. When done, type `/stop`.

---

## For developers (full local stack)

### Prerequisites
- [Bun](https://bun.sh) 1.3.1
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for local Supabase)
- [Claude Code](https://claude.ai/code)

### First time
```bash
bun install
bun run backend:start       # starts local Supabase (requires Docker)
bun run setup:cc            # generates apps/web/client/.env.local
bun run db:push             # push schema
bun run dev:cc              # start dev server → http://localhost:3000
```

### Every time
```bash
bun run backend:start
bun run dev:cc              # http://localhost:3000
```

### Stop / restart
```bash
bun scripts/kill-dev-ports.ts   # cross-platform (Windows + Mac/Linux)
bun run dev:cc
```

### Use remote Supabase instead of Docker
```bash
bun run setup:cc -- --remote    # prompts for Supabase project credentials
bun run dev:cc
```

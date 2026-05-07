# Onlook — Designer Setup (Mac) · Manual

A step-by-step guide to getting Onlook running locally on your Mac.
No prior terminal experience needed — just follow each step in order.

> **Prefer fewer steps?** See [DESIGNER-SETUP-AUTO.md](./DESIGNER-SETUP-AUTO.md) — a single script does almost everything for you.

---

## What You'll Need

- [ ] A Mac (macOS 13 Ventura or newer)
- [ ] The `.env.local` file from Martin (he'll send it separately)
- [ ] About 30 minutes the first time

---

## Step 0: Open Terminal

Terminal is a built-in Mac app. To open it:

1. Press **Command + Space** to open Spotlight
2. Type `Terminal` and press Enter

A window with a black or white background and a blinking cursor will appear. This is your terminal. Don't worry — you'll only be typing the commands shown below, nothing else.

> **Tip:** You can copy any command from this guide, click inside the Terminal window, and paste with **Command + V**.

---

## Step 1: Install Homebrew

Homebrew is a tool that makes installing software on Mac easy. Paste this into Terminal and press Enter:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

It will ask for your Mac login password. Type it (you won't see any characters appear — that's normal) and press Enter. The install takes 1–2 minutes.

When it's done, follow any "Next steps" instructions it prints (usually it asks you to run 2 commands to add Homebrew to your PATH).

---

## Step 2: Install Git, Node.js, and Bun

**Git** downloads the project code. **Node.js** is needed for the Claude Code tool. **Bun** is the project's package manager.

Install Git and Node.js:

```bash
brew install git node
```

Install Bun:

```bash
curl -fsSL https://bun.sh/install | bash
```

After Bun installs, close Terminal and reopen it (so the new tools are recognized).

Verify everything installed correctly — each command should print a version number, not an error:

```bash
git --version
node --version
bun --version
```

---

## Step 3: Install Docker Desktop

Docker is required to run the project's local database. It runs as a normal Mac application.

1. Go to [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/)
2. Click **Download for Mac** (choose Apple Silicon if you have an M1/M2/M3/M4 Mac, or Intel if you have an older Mac)
3. Open the downloaded `.dmg` file and drag Docker to your Applications folder
4. Open Docker from your Applications folder
5. Follow the prompts to complete setup

> **Important:** Docker must be open and running (the whale icon in your menu bar is still) **every time** you work on this project.

---

## Step 4: Install Claude Code

Claude Code is the AI coding assistant that powers Onlook's chat features.

Install it:

```bash
npm install -g @anthropic-ai/claude-code
```

Now run the setup and sign in:

```bash
claude
```

Follow the prompts in your terminal to log in with your Anthropic account. Once you're signed in you can press **Ctrl+C** to exit — you just needed to authenticate once.

---

## Step 5: Clone the Project

This downloads the project code to your computer. Run:

```bash
cd ~/Desktop
git clone https://github.com/martin-iliew/onlook.git
cd onlook
```

You'll now have an `onlook` folder on your Desktop.

---

## Step 6: Install Dependencies

This downloads all the packages the project needs to run:

```bash
bun install
```

This takes about a minute. You'll see a lot of text scroll by — that's normal.

---

## Step 7: Place the .env.local File

Martin will send you a file called `.env.local`. This file contains the secret keys that connect the app to its services.

**Place it here:** `onlook/apps/web/client/.env.local`

**Option A — Terminal command** (easiest if the file is in your Downloads folder):

```bash
cp ~/Downloads/.env.local ~/Desktop/onlook/apps/web/client/.env.local
```

**Option B — Finder:**
1. Open Finder and navigate to your Desktop → `onlook` → `apps` → `web` → `client`
2. Press **Command + Shift + .** to show hidden files
3. Drag the `.env.local` file Martin sent into that `client` folder

---

## Step 8: Start the Backend

Make sure Docker Desktop is open and the whale icon in your menu bar is still (not animating).

Then run:

```bash
bun run backend:start
```

**The first time you run this,** Docker downloads the Supabase containers — this takes 3–5 minutes. Future starts are much faster (under 30 seconds).

Wait until the terminal shows a URL table with `http://127.0.0.1:54321` before moving on.

---

## Step 9: Run the Setup Script

This reads keys from your local Supabase instance and adds them to your `.env.local` file automatically:

```bash
bun run setup:cc
```

You should see checkmarks (✓) and a "Ready to go" message at the end.

---

## Step 10: Set Up the Database (First Time Only)

Create the database tables and add starter data:

```bash
bun run db:push
bun run db:seed
```

You only need to do this once.

---

## Step 11: Start the App

```bash
bun run dev:cc
```

Wait about 30 seconds for the app to compile. Then open your browser and go to:

**[http://localhost:3000](http://localhost:3000)**

Create a local account (email + password — it stays on your machine, not sent anywhere).

---

## Daily Workflow

After first-time setup, here's what you do each day:

1. Open **Docker Desktop** and wait for the whale icon to stop animating
2. Open Terminal
3. Navigate to the project: `cd ~/Desktop/onlook`
4. Start the backend: `bun run backend:start`
5. Start the app: `bun run dev:cc`
6. Open [http://localhost:3000](http://localhost:3000)

---

## How to Stop

Press **Ctrl + C** in the Terminal window where the app is running.

To stop the Supabase backend:

```bash
bun run backend:stop
```

---

## Troubleshooting

### "Docker is not running" error
Open Docker Desktop from your Applications folder. Wait for the whale icon in the menu bar to stop animating, then try again.

---

### Port 3000 is already in use
Something else is already using that port. Kill it with:

```bash
lsof -ti:3000 | xargs kill -9
```

Then run `bun run dev:cc` again.

---

### Port 54321 is already in use (Supabase)
```bash
lsof -ti:54321 | xargs kill -9
```

Then run `bun run backend:start` again.

---

### "bun: command not found"
Close Terminal completely and reopen it. If that doesn't work:

```bash
source ~/.zshrc
```

---

### "supabase: command not found"
Run `bun install` again from the `onlook` folder.

---

### Something is broken and I don't know why

Nuclear reset — this wipes your local database and starts fresh:

```bash
bun run db:reset
bun run setup:cc
bun run dev:cc
```

---

### Still stuck?

Message Martin.

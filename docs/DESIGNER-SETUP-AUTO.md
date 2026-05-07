# Onlook — Designer Setup (Mac) · Automated

One command sets up everything. Takes about 10–15 minutes.

> **Prefer doing it step by step?** See [DESIGNER-SETUP.md](./DESIGNER-SETUP.md) for the manual guide.

---

## What You'll Need

- [ ] A Mac (macOS 13 Ventura or newer)
- [ ] About 10–15 minutes

That's it — the script handles the rest, including the environment config.

---

## Step 1: Open Terminal

Press **Command + Space**, type `Terminal`, press Enter.

> **Tip:** You can copy any command from this guide, click inside the Terminal window, and paste with **Command + V**.

---

## Step 2: Run the Setup Script

Paste this into Terminal and press Enter:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/martin-iliew/onlook/main/setup-designer.sh)
```

The script will install and configure everything automatically.

---

## What the Script Does

1. Installs **Homebrew** (Mac package manager)
2. Installs **Git**, **Node.js**, and **Bun**
3. Installs **Docker Desktop** (runs the local database)
4. Installs **Claude Code** (the AI assistant)
5. Downloads the project to `~/Desktop/onlook`
6. Installs all project dependencies
7. Downloads the environment config
8. Starts the local database
9. Sets up and seeds the database
10. Opens Onlook at [http://localhost:3000](http://localhost:3000)

---

## Two Moments Where You Need to Do Something

The script pauses twice and tells you what to do:

**1. Docker license agreement** *(only on first install)*
Docker Desktop will open and show a license agreement. Click **Accept**, then come back to the terminal and press Enter.

**2. Claude Code login**
A browser window will open. Sign in with your Anthropic account, then come back to the terminal.

Everything else is automatic.

---

## Daily Workflow

After the first setup, here's all you need each day:

1. Open **Docker Desktop** — wait for the whale icon in your menu bar to stop animating
2. Open Terminal and run:

```bash
cd ~/Desktop/onlook && bun run backend:start && bun run dev:cc
```

3. Open [http://localhost:3000](http://localhost:3000)

---

## How to Stop

Press **Ctrl + C** in the Terminal window where the app is running.

To also stop the database:

```bash
cd ~/Desktop/onlook && bun run backend:stop
```

---

## Troubleshooting

### The script stopped with an error
Re-running the script is safe — it skips steps that are already done. Try running it again:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/martin-iliew/onlook/main/setup-designer.sh)
```

---

### "Docker is not running"
Open Docker Desktop from your Applications folder. Wait for the whale icon to stop animating, then try again.

---

### Port 3000 is already in use

```bash
lsof -ti:3000 | xargs kill -9
```

Then run `bun run dev:cc` again from the `onlook` folder.

---

### Port 54321 is already in use (Supabase)

```bash
lsof -ti:54321 | xargs kill -9
```

Then run `bun run backend:start` again.

---

### Something is broken and I don't know why

Nuclear reset — wipes the local database and starts fresh:

```bash
cd ~/Desktop/onlook && bun run db:reset && bun run setup:cc && bun run dev:cc
```

---

### Still stuck?

Switch to the [manual guide](./DESIGNER-SETUP.md) to go step by step, or message Martin.

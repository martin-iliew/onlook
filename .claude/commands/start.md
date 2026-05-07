Start Onlook for the day. Use friendly, non-technical language.

## Steps

Say: "Starting Onlook..."

Detect the OS:
```bash
uname -s 2>/dev/null || echo "Windows"
```

Start the dev server in the background (use run_in_background: true):
```bash
cd ~/Desktop/onlook && bun run dev:cc
```

Wait 8 seconds, then open the browser:
- **Mac** (output starts with `Darwin`): `open http://localhost:3000`
- **Windows**: `start http://localhost:3000`

Say: "Onlook is running at http://localhost:3000 — your browser should have opened it.

When you're done for the day, type **/stop**."

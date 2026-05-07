Stop Onlook. Use friendly language.

## Steps

Say: "Shutting down Onlook..."

Detect the OS:
```bash
uname -s 2>/dev/null || echo "Windows"
```

Kill processes on the app ports:

**Mac** (output starts with `Darwin`):
```bash
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:4567 | xargs kill -9 2>/dev/null || true
lsof -ti:8080 | xargs kill -9 2>/dev/null || true
```

**Windows**:
```bash
cd ~/Desktop/onlook && bun scripts/kill-dev-ports.ts
```

Say: "Onlook has been shut down. Type **/start** whenever you're ready to work again."

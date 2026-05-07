Stop Onlook. Use friendly language.

## Steps

Say: "Shutting down Onlook..."

Kill any processes on the app ports:
```bash
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:4567 | xargs kill -9 2>/dev/null || true
lsof -ti:8080 | xargs kill -9 2>/dev/null || true
```

Say: "Onlook has been shut down. Type **/start** whenever you're ready to work again."

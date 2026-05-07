# Dev Setup

## First time

```bash
bun install
bun run backend:start       # starts Supabase (requires Docker)
bun run setup:cc            # generates .env.local
```

Then add your CSB API key to `apps/web/client/.env.local`:
```
CSB_API_KEY=your_key_here
```

## Every time

```bash
bun run dev:cc              # start dev server → http://localhost:3000
```

## Stop / restart

```bash
bun run kill                # kill ports 3000 and 4567
bun run dev:cc              # restart
```

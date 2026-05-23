# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend (`frontend/`)
```bash
npm run dev        # Vite dev server on port 5173
npm run build      # tsc -b && vite build (required before Docker prod build)
npm run lint       # eslint
```

### Backend (`backend/`)
```bash
npm run dev        # nodemon (hot reload, expects DB already running)
npm run build      # tsc → dist/
npm run start      # node dist/index.js (production)
npm run test:ci    # ts-node test-api.ts
npx prisma generate           # regenerate client after schema changes
npx prisma migrate dev        # create + apply a new migration
npx prisma db push            # sync schema without migration files (dev only)
npx prisma studio             # GUI for inspecting data
```

### Local full-stack (Docker)
```bash
# Dev stack — includes a local postgres container
docker compose -f docker-compose.dev.yml up --build

# Production-style stack — expects external global-db-net network + universal-db container
docker compose up --build -d
```

The `.env` at the repo root is written by the GitHub Actions deploy workflow from secrets. For local dev, copy and adjust manually:
```
DATABASE_URL=postgresql://admin:admin@localhost:5432/postgres?schema=public
JWT_SECRET=any-local-secret
VITE_API_BASE_URL=http://localhost:5000
```

## Architecture

### Overview
Single-page React app + Express/Node backend + PostgreSQL via Prisma. The core feature is autonomous Catan board-game simulations run by AI agents.

### Frontend (`frontend/src/`)
- **No router library** — routing is manual hash/pushState. `App.tsx` reads `window.location.pathname` and returns the matching page component. Add new routes there.
- **`types.ts`** is the central shared file: exports `API_BASE` (from `VITE_API_BASE_URL` env var, falls back to `http://localhost:5000`), `apiFetch` (authenticated fetch wrapper using an in-memory token), and all shared TypeScript types.
- **`AuthContext.tsx`** manages JWT token lifecycle. The token lives in `localStorage` and is mirrored into a module-level `_activeToken` variable to prevent cross-tab pollution. `apiFetch` reads from `_activeToken`, not localStorage directly.
- **`App.tsx`** contains the main `AuthenticatedApp` component which holds all app state (matches, agents, metrics). Data is refreshed via SSE (`/api/matches/:id/stream`) with a 5-second polling fallback.
- Tailwind v4 (Vite plugin, no config file — imported directly in `index.css`).

### Backend (`backend/src/index.ts`)
All backend logic is in a single file. Key patterns:
- **Prisma with `@prisma/adapter-pg`** — uses a raw `pg.Pool` passed as an adapter, so the same pool is available for raw SQL queries (used in `/api/health`) alongside Prisma ORM calls.
- **In-memory match state** — `liveMatchJobs` (Set) and `pausedMatchJobs` (Set) track running simulations. `sseSubscribers` (Map) holds open SSE response objects keyed by matchId. All three are process-local; a server restart re-reads LIVE matches from DB and resumes simulation.
- **`runMatchSimulation(matchId)`** is the async game loop. It runs per-match until win or turn limit, persisting state to DB after every action. It is intentionally fire-and-forget (`void runMatchSimulation(...)`).
- **Agent seeding** — `seedAgentsIfNeeded()` inserts the 4 default agents on first start if the agents table is empty.
- All routes are prefixed `/api/`. The nginx reverse proxy on the production server forwards `https://www.bytenboards.games/api/` → `http://localhost:3003` (no trailing slash — important, otherwise the prefix is stripped).

### AI (`backend/src/game/ai.ts`)
Calls Google Gemini (`GEMINI_API_KEY` env var) to generate agent decisions and commentary. Falls back to a deterministic heuristic if the key is absent or the API call fails — the game works without an API key.

### Database schema
- `User` — auth accounts (email + bcrypt password, USER/ADMIN role)
- `Agent` — the 4 named AI players (seeded automatically)
- `Match` — one game instance; has a `shareToken` (cuid) for public share links and optional `createdById` linking to the User who started it
- `MatchAgent` — join table with full per-player resource/building state stored as individual columns plus a `tiles` JSON field (the player's hex board)
- `MatchEvent` — append-only event log (COMMENTARY, MOVE, RESOURCE, RESULT) streamed to clients via SSE

### Deployment
GitHub Actions (`.github/workflows/deploy.yml`) SSHes into the production server, pulls the repo to `~/bytenboard`, writes `.env` from secrets (`DATABASE_URL`, `JWT_SECRET`, `VITE_API_BASE_URL`), and runs `docker compose up --build -d`.

Production secrets that must match:
- `VITE_API_BASE_URL` → `https://www.bytenboards.games` (with `www` — bare domain has no DNS record)
- `DATABASE_URL` → must use `universal-db` as hostname (the external Docker container on `global-db-net` network)

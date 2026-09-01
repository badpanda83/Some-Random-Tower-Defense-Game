# The Dubious Realm

A fantasy-parody tower-defense PWA about defending a damp kingdom with improvised heroes, discount magic, and suspiciously organized dungeon creatures.

The first vertical slice includes a branching campaign preview, one complete six-wave encounter, three upgradeable towers, four enemy types, a boss phase, mastery goals, a challenge modifier, touch-first controls, offline play, guest saves, and optional email-link cloud sync.

## Architecture

| Area          | Choice                     | Responsibility                                                   |
| ------------- | -------------------------- | ---------------------------------------------------------------- |
| Web shell     | React + Vite               | Campaign, settings, identity, HUD, install/update UX             |
| Game renderer | Phaser 3                   | Canvas, touch input, camera, drawing, effects, audio lifecycle   |
| Game rules    | `packages/game-core`       | Seeded fixed-step simulation and versioned content               |
| Protocol      | Zod in `packages/protocol` | Shared API, save, checkpoint, and command validation             |
| API           | Fastify                    | Auth routing, profiles, save synchronization, static PWA hosting |
| Identity      | Better Auth                | Anonymous sessions upgraded through email magic links            |
| Persistence   | PostgreSQL + Drizzle       | Auth data, profiles, revisioned JSONB save slots                 |

Battles run locally in the browser. The server stores validated progress snapshots with optimistic revisions; it does not run authoritative ticks. That is the deliberate boundary for a primarily single-player game with no competitive economy. WebSockets, multiplayer, anti-cheat, leaderboards, Redis, and queues are intentionally absent.

## Requirements

- Node.js 22+
- pnpm 11.25 through Corepack
- Docker Desktop or another Docker Compose implementation for PostgreSQL

## Run locally

The complete production-like stack is the shortest path:

```powershell
docker compose up --build
```

Open:

- Game: <http://localhost:3001>
- Development mailbox: <http://localhost:8025>

For hot reload:

```powershell
Copy-Item .env.example .env
docker compose up -d postgres mailpit
corepack pnpm install
corepack pnpm db:migrate
corepack pnpm dev
```

The Vite client runs at <http://localhost:5173> and proxies the API at <http://localhost:3001>. Magic links are captured by Mailpit.

## Commands

```powershell
corepack pnpm dev              # Vite and Fastify watchers
corepack pnpm build            # All production bundles
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test             # Unit and injected API tests
corepack pnpm test:integration # Requires TEST_DATABASE_URL and migrated PostgreSQL
corepack pnpm test:e2e         # Requires a migrated database and built app
corepack pnpm db:generate      # Generate a migration after schema changes
corepack pnpm db:migrate       # Apply checked-in migrations
```

Game definitions live in `packages/game-core/src/content.ts`. IDs are persistence contracts: add new IDs rather than renaming released ones. Simulation rules must remain independent of Phaser, browser APIs, wall-clock time, and `Math.random`.

## Saves and identity

- IndexedDB is always the immediate local source of truth.
- An online first visit creates an HTTP-only anonymous Better Auth session.
- Linking an email upgrades the guest identity instead of requiring a new profile.
- Cloud writes include an expected revision. Conflicting local and remote revisions are shown to the player; neither is silently overwritten.
- Between-wave checkpoints contain only simulation-safe data. Active combat is not serialized.
- Save payloads carry a `contentVersion`; incompatible payloads fail visibly rather than being guessed into shape.

Guest browser storage can be evicted by the platform. The UI encourages account linking after progress begins.

## Railway deployment

This repository is already linked to an existing Railway project. Keep the service source connected to this repository and configure that project:

1. In the existing project, choose **New → Database → PostgreSQL**.
2. On the game service, add `DATABASE_URL` as a reference to the PostgreSQL service's `DATABASE_URL`.
3. Add these game-service variables:
   - `PUBLIC_URL=https://your-domain.example`
   - `BETTER_AUTH_SECRET` with at least 32 random characters
   - `TRUST_PROXY=true` (only on Railway, where all public traffic crosses its header-sanitizing edge proxy)
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`
   - `EMAIL_FROM`
4. Keep the service root directory at the repository root (`/`). Railway will use the root `Dockerfile`; no custom build command is needed.
5. Keep configuration-as-code enabled. `railway.json` sets `node dist/database/migrate.js` as the pre-deploy command, `node dist/index.js` as the start command, and `/health/ready` as the health check.
6. Under **Networking**, generate a Railway domain or attach the intended custom domain. Update `PUBLIC_URL` to the final HTTPS origin exactly, with no trailing slash.
7. Deploy the linked branch. Confirm `/health/live`, `/health/ready`, anonymous play, a save/reload, and a delivered magic link.

The app and API share one origin and one container. PostgreSQL remains a separate durable service. Back up PostgreSQL with the provider's snapshots plus periodic `pg_dump`; test restores before relying on them.

## Portable Docker hosting

The Dockerfile uses multi-architecture Debian Node images, runs as a non-root user, and has no provider SDK or native application dependency. The same image can run on a VPS or an ARM64 Raspberry Pi:

```powershell
docker build -t dubious-realm .
docker run --rm -p 3001:3001 --env-file .env dubious-realm
```

A Raspberry Pi 3 should use a 64-bit OS. Hosting the app container there is realistic; PostgreSQL is better placed on another machine, or carefully tuned with durable storage and conservative memory settings.

## PWA behavior

The service worker precaches only versioned application assets. `/api` and `/health` always use the network and are never cached. The game pauses when hidden, supports safe-area insets, reduced motion, low effects, mute, 1x/2x speed, touch placement, and an explicit landscape prompt on narrow portrait screens.

All current visual assets and copy are original project material. No third-party game art is required.

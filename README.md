# Some Random Tower Defense Game

> **Work in progress:** This project is under active development. The current foundation is playable, but it is not ready for release.

## The Dubious Realm

A cool-looking, humorous fantasy-parody tower-defense PWA about defending a damp kingdom with improvised heroes, discount magic, and suspiciously organized dungeon creatures. It combines strategic towers and ridiculous enemies with a victory-based campaign, optional challenges, and mastery goals that reward different ways to play.

The complete campaign contains exactly ten playable missions in three acts:

| Act     | Missions                                                                    |
| ------- | --------------------------------------------------------------------------- |
| I (4)   | The Muddy Moat, Mimic Market, Troll Tollway, Castle Hassle                  |
| II (3)  | Frozen Assets, Department of Unnecessary Bridges, Siege and Desist          |
| III (3) | Lava Lamp District, Necromancers' Networking Event, Quarterly Dragon Review |

Act III finishes the campaign with deterministic lava eruptions and hot-road windows, the phased Lava Lamp Landlord, one-shot spectral referrals, three-route formations, the returning Dragon Intern miniboss, and the three-stage Chief Executive Dragon. The regular full-boss cadence is Missions 2, 4, 6, 8, and 10 (Grand Till Mimic, Baron von Bog, Comptroller General, Lava Lamp Landlord, and Chief Executive Dragon); Mission 7's Queen of Pending Litigation is an explicit act-finale exception. Story victories unlock the next mission without replay grinding. Mission 10 awards the campaign epilogue, Completion Crest, Executive Palette, and Executive Mandate challenge; the campaign screen then displays **10/10** completion. There are no preview-only nodes, eleventh mission, or endless mode.

Run `pnpm report:balance` for deterministic 1× mission timing, per-wave duration, lives, economy, peak enemy load, mastery, and tower-contribution reports for two distinct reference compositions. The reporter measures exact active ticks at 20 ticks/second, then adds the disclosed ordinary first-clear planning model: 33 seconds for the briefing, 12 seconds to read each wave preview, and 2.5 seconds per placement, upgrade, sale, or wave-start decision. Retries and paused/idle time are excluded.

Measured normal first clears for Act III are:

| Mission                        |                                      Blade + magic |           Blade + song |
| ------------------------------ | -------------------------------------------------: | ---------------------: |
| Lava Lamp District             | 14,409 active ticks / 15.24 representative minutes | 14,295 / 15.15 minutes |
| Necromancers' Networking Event |                             15,525 / 16.58 minutes | 15,148 / 16.35 minutes |
| Quarterly Dragon Review        |                             17,213 / 18.48 minutes | 16,919 / 18.36 minutes |

Across all ten missions, the first and second measured normal composition families total 165.20 and 163.98 representative minutes (about 2 hours 45 minutes) for a no-retry campaign clear. Frozen Assets uses the compact five-tower mixed family as its second reference. Its two-rank-IV-Fork combat stress build now fails after six waves, while the two mixed references win with 14 and 8 lives.

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

Game definitions live in `packages/game-core/src/content.ts`. IDs are persistence contracts: add new IDs rather than renaming released ones. Simulation rules must remain independent of Phaser, browser APIs, wall-clock time, and `Math.random`. Routes, speed zones, environment hazard schedules, referral-marked waves, boss stages, mastery rules, modifiers, and rewards are typed content rather than level-name branches. Add authored wave previews that truthfully identify formation roles and deterministic pressure windows.

## Saves and identity

- IndexedDB is always the immediate local source of truth.
- An online first visit creates an HTTP-only anonymous Better Auth session.
- Linking an email upgrades the guest identity instead of requiring a new profile.
- Cloud writes include an expected revision. Conflicting local and remote revisions are shown to the player; neither is silently overwritten.
- Between-wave checkpoints contain only simulation-safe data. Active combat is not serialized.
- Save payloads carry a `contentVersion`; v3 explicitly migrates v1 and v2 saves while preserving campaign progress, settings, recent results, cloud revision behavior, and compatible between-wave checkpoints. Incompatible payloads fail visibly rather than being guessed into shape.

Guest browser storage can be evicted by the platform. The UI encourages account linking after progress begins.

## Railway deployment

This repository is already linked to an existing Railway project. Keep the service source connected to this repository and configure that project:

1. In the existing project, choose **New → Database → PostgreSQL**.
2. On the game service, add `DATABASE_URL` as a reference to the PostgreSQL service's `DATABASE_URL`.
3. Add these game-service variables:
   - `PUBLIC_URL=https://your-domain.example`
   - `BETTER_AUTH_SECRET` with at least 32 random characters
   - `TRUST_PROXY=true` (only on Railway, where all public traffic crosses its header-sanitizing edge proxy)
   - `RESEND_API_KEY=re_...`
   - `EMAIL_FROM=The Dubious Realm <noreply@mail.dubiousrealm.com>`
4. Keep the service root directory at the repository root (`/`). Railway will use the root `Dockerfile`; no custom build command is needed.
5. Keep configuration-as-code enabled. `railway.json` sets `node dist/database/migrate.js` as the pre-deploy command, `node dist/index.js` as the start command, and `/health/ready` as the health check.
6. Under **Networking**, generate a Railway domain or attach the intended custom domain. Update `PUBLIC_URL` to the final HTTPS origin exactly, with no trailing slash.
7. Deploy the linked branch. Confirm `/health/live`, `/health/ready`, anonymous play, a save/reload, and a delivered magic link.

The app and API share one origin and one container. PostgreSQL remains a separate durable service. Back up PostgreSQL with the provider's snapshots plus periodic `pg_dump`; test restores before relying on them.

Production uses Resend's HTTPS API on port 443 and requires both
`RESEND_API_KEY` and `EMAIL_FROM`. `NODE_ENV=production` selects Resend
automatically; `EMAIL_PROVIDER=smtp` is rejected, and legacy `SMTP_*` variables
are ignored. Verify the `EMAIL_FROM` domain in Resend before testing delivery.
`EMAIL_SEND_TIMEOUT_MS` defaults to 10000 and may be set from 1000 through 30000.

For migration troubleshooting, a magic-link request that stayed on **Sending**
without a Resend event was the old SMTP transport waiting on
`smtp.resend.com`; Railway blocks outbound SMTP ports 25, 465, and 587 on
restricted plans. Remove the production `SMTP_*` variables, add the two Resend
variables above, and redeploy. If startup rejects configuration, check the
Railway deploy logs for the named missing variable. If delivery fails after
startup, the server emits a structured `magic_link_email_delivery_failed`
event containing only provider, failure kind, and optional HTTP status; API
keys, recipients, tokens, and magic URLs are never logged.

## Portable Docker hosting

The Dockerfile uses multi-architecture Debian Node images, runs as a non-root user, and has no provider SDK or native application dependency. The same image can run on a VPS or an ARM64 Raspberry Pi:

```powershell
docker build -t dubious-realm .
docker run --rm -p 3001:3001 --env-file .env dubious-realm
```

A Raspberry Pi 3 should use a 64-bit OS. Hosting the app container there is realistic; PostgreSQL is better placed on another machine, or carefully tuned with durable storage and conservative memory settings.

## PWA behavior

The service worker precaches only versioned application assets, activates deployed updates automatically, and reloads open clients onto the current release. `/api` and `/health` always use the network and are never cached. The game pauses when hidden or unfocused unless the persisted **Keep playing while away** setting is enabled; mobile browsers and operating systems may still throttle or suspend background tabs, and the game never catches up elapsed suspension time. It also supports safe-area insets, reduced motion, low effects, mute, 1x/2x speed, confirmed touch or mouse placement and upgrades during combat, and a battle-only landscape prompt that automatically clears when a narrow phone rotates sideways; menus and campaign remain portrait-friendly. To deploy a hero, select its contextual full-name control, choose an empty pad, then use **Confirm**; **Cancel** or changing heroes never spends gold. The large battlefield-first layout and prominent **Start Wave** control remain available on every map, including a 568×320 landscape viewport. Royal Forkfall charges for 12 active-combat seconds, automatically targets the leading enemy for 180 arcane damage, and requires separate **Arm** and **Cast** presses. **Leave mission** is available throughout a battle and requires confirmation before discarding the current attempt and its checkpoint.

Eruptions use amber warning rings, red disabled-pad marks, and triangular hot-road markers. Referred enemies use spectral diamond outlines. Boss stages expose named health and ward status. These cues combine color and shape, honor reduced-motion and low-effects settings, and share the renderer's capped transient-effect budget.

Current tower purchase/upgrade costs are Fork Knight **57/52/85/140**, Discount Wizard **95/76/119/165**, and Bardbarian **85/66/105/150** gold. The Bardbarian slow lasts 3 seconds at 35% and cannot refresh while already active, preserving deterministic control gaps. Fork Knight ranks deal **24/38/58/72** single-target damage at **16/14/12/11-tick** cadence and **126/138/152/152** range. Table Service no longer doubles full-damage targets; Frozen Assets also reserves its lane-center thin-ice pads for arcane or sonic coverage, while the two shore pads keep Fork Knights useful against Warranty Wraiths.

All current visual assets and copy are original project material. No third-party game art is required.

## License

Licensed under the [MIT License](LICENSE).

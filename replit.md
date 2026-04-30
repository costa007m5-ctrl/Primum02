# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

- **netpremium** (`artifacts/netpremium`, `previewPath: "/"`) — Netflix-style streaming web app (formerly "Netplay/NetPremium" v0/Vercel project). Vite + React + Tailwind v4 + React Router DOM. Uses Supabase auth/DB, Firebase, MercadoPago, OneSignal push, TMDB API, video.js/artplayer/hls.js. Migrated from `.migration-backup/`.
- **api-server** (`artifacts/api-server`) — Express 5 API mounted at `/api`. Hosts NetPremium backend routes (admin/users, referrals, MercadoPago payments + webhook, OneSignal notifications, Supabase webhook → OneSignal, Google Drive `/stream/:fileId` proxy, TeraBox converter) plus base health endpoint. Reads `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MERCADO_PAGO_ACCESS_TOKEN`, `ONESIGNAL_REST_API_KEY`, `GOOGLE_DRIVE_API_KEY` from env.

### NetPremium env vars (frontend uses VITE_-prefixed)

Required for full functionality (the app boots without them but most data calls fail):
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — Supabase auth + admin
- `VITE_TMDB_API_KEY` — TMDB movie/series catalog

Optional:
- `VITE_MERCADO_PAGO_PUBLIC_KEY` + `MERCADO_PAGO_ACCESS_TOKEN` — payments
- `VITE_GEMINI_API_KEY` — AI features
- `VITE_GOOGLE_DRIVE_API_KEY` + `GOOGLE_DRIVE_API_KEY` — Drive video streaming
- `ONESIGNAL_REST_API_KEY` — push notifications (OneSignal app id is hardcoded fallback)

### Deferred from migration

- Socket.io watch party (`.migration-backup/server.ts`) — not yet ported. Frontend has no `socket.io-client` import so nothing fails. Re-add as a separate service if needed.

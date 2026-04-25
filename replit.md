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

### `artifacts/netpremium` (web — React 19 + Vite)

Portuguese-language Netflix-style streaming app migrated from a Vercel/v0 project. Uses:

- React 19, react-router-dom 7, Vite 7
- Tailwind v4, motion (framer-motion v12)
- Supabase client for catalog & auth, Firebase (analytics + hardcoded fallback config)
- Mercado Pago Brick SDK (`@mercadopago/sdk-react`) for payments
- OneSignal Web SDK (loaded via CDN in `index.html`) for push notifications
- HLS.js + screenfull for the custom Netflix-style video player
- socket.io-client for the watch-party feature
- QRCode.react, axios, lucide-react icons

Entry: `src/main.tsx` mounts `<StrictMode><BrowserRouter><App/></BrowserRouter></StrictMode>` into `#root`. The single ~4400 line `src/App.tsx` contains the full SPA (browse, search, profiles, admin, payments, watch-party, push-notifications). Required env vars (graceful degradation when missing — shows a "Configuração Necessária" screen): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TMDB_API_KEY`, `VITE_GEMINI_API_KEY`, `VITE_MP_PUBLIC_KEY`, `VITE_BACKEND_URL`, `VITE_ONESIGNAL_APP_ID`.

### `artifacts/api-server` (api — Express 5 + Socket.IO)

Backend ported from the original `server.ts` monolith:

- `src/routes/netpremium.ts` mounts at `/` and exposes admin/users, referrals, Mercado Pago payments, OneSignal notifications, Google Drive stream proxy (`/stream-proxy`, `/cf-watch`), Google OAuth callback (`/auth/google/callback`), and Terabox helpers.
- `src/socket.ts` boots Socket.IO for the watch-party rooms (server-authoritative play/pause/seek with host election).
- `src/index.ts` uses `http.createServer(app)` so Socket.IO can attach.
- Server-side env vars consumed: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MERCADO_PAGO_ACCESS_TOKEN`, `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GEMINI_API_KEY`, `NETPREMIUM_ADMIN_EMAILS` (comma-separated allowlist of admin email addresses).
- Owned routes (in `artifact.toml`): `/api`, `/socket.io`, `/auth/google/callback`. The `netpremium` artifact owns `/`.
- Auth: `src/middleware/netpremium-auth.ts` provides `requireUser` and `requireAdmin` middleware that validate a Supabase JWT bearer token and (for admin) check `user_metadata.role === 'admin'`, `user_metadata.is_admin === true`, or membership in `NETPREMIUM_ADMIN_EMAILS`. Applied to all `/api/admin/*` routes and to `/api/referrals*` user-scoped routes (where `userId` must match the caller). `/api/debug-env` returns 404 when `NODE_ENV=production`.

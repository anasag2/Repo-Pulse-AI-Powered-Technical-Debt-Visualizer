# Repo-Pulse — Frontend

The web UI for Repo-Pulse: a Vite + React single-page app that visualizes a repository's
technical debt (3D city map, metrics, findings, AI insights). It talks to the Python
FastAPI backend in `../backend/` over the `/api` contract — the two share an origin in dev
via Vite's proxy, so there's no CORS.

## Layout (pnpm workspace)

- `app/` — the SPA (package `@workspace/repo-pulse`). Entry `src/main.tsx` → `App.tsx` (wouter routes).
- `lib/api-spec/` — the OpenAPI spec + Orval codegen config; source of truth for the API contract.
- `lib/api-client-react/` — the generated TanStack-Query client the app imports (`@workspace/api-client-react`).
- `Dockerfile` / `Caddyfile` — prod build (Vite → static assets) served by Caddy.

## Run & Operate

- `cd app && PORT=5173 BASE_PATH=/ pnpm run dev` — dev server (proxies `/api` → `http://localhost:8000`)
- `cd app && PORT=5173 BASE_PATH=/ pnpm run build` — production build (throws without `PORT`/`BASE_PATH`)
- `pnpm run typecheck` — typecheck all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate the client + Zod schemas from the OpenAPI spec
- `pnpm install --frozen-lockfile` — what the Docker build runs; must pass after any dependency change

## Stack

- pnpm workspaces, TypeScript, Vite 7 + React (SPA), wouter, TanStack Query, Tailwind, three.js / React-Three-Fiber
- API: OpenAPI (`lib/api-spec`) → Orval codegen → `lib/api-client-react` (the client the app imports)
- Backend + database live elsewhere: Python **FastAPI + MongoDB** in `../backend/` (not part of this workspace)

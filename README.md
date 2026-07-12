# Repo-Pulse — AI-Powered Technical Debt Visualizer

Repo-Pulse turns any public git repository into an interactive map of its **technical
debt**. Point it at a repo and it clones the code, mines the git history, computes
code-health metrics, scores each file with a research-based debt model, and renders the
result as a navigable 3D "city" — hotspots, risky files, temporal coupling, and ranked
findings — with optional **Claude-powered** explanations and a guided Learn tour.

Live at **[repo-pulse.com](https://repo-pulse.com)**.

## How it works

```
        ┌──────────────────────────┐        /api        ┌───────────────────────────┐
        │  Frontend (frontend/app) │  ◀───────────────▶ │   Backend (backend/)      │
        │  Vite + React SPA        │                    │   Python FastAPI          │
        │  3D map, metrics, chat   │                    │   clone → mine → score    │
        └──────────────────────────┘                    └───────────┬───────────────┘
                                                                     │
                                                        ┌────────────┴───────────┐
                                                        │  MongoDB   ·   Claude  │
                                                        └────────────────────────┘
```

- **Backend** ([`backend/`](backend/README.md)) — Python **FastAPI** + **MongoDB**. Clones
  a repo, mines churn/ownership/coupling, computes complexity & duplication, and scores
  technical debt with a Lund-thesis-based weighted model. Serves everything over `/api`
  (JWT-authenticated, per-user). Optional Claude analysis + multi-model chat.
- **Frontend** ([`frontend/`](frontend/README.md)) — a **Vite + React** SPA (pnpm workspace).
  The API client is generated from an OpenAPI spec via Orval. Built to static assets and
  served by Caddy in production.

The two share an origin in dev via Vite's `/api` proxy, so there's no CORS.

## Quick start (local dev)

Three processes. Requires **Python 3.9+**, **Node 20.19+/22+** with **pnpm**, and a local
**MongoDB**.

```bash
# 1. MongoDB on :27017
mongod --dbpath ~/mongodb-data --port 27017

# 2. Backend  (http://localhost:8000)
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
JWT_SECRET=dev-secret .venv/bin/uvicorn app.main:app --reload --port 8000

# 3. Frontend  (http://localhost:5173)
cd frontend && pnpm install
cd app && PORT=5173 BASE_PATH=/ pnpm run dev
```

Then open **http://localhost:5173** and sign up. To enable Claude features, start the
backend with `ANTHROPIC_API_KEY=sk-ant-...`. See [`backend/README.md`](backend/README.md)
for the full environment-variable list and [`frontend/README.md`](frontend/README.md) for
workspace details.

## Repository layout

```
backend/     Python FastAPI service + analysis pipeline (see backend/README.md)
frontend/    pnpm workspace:
  app/         the Vite + React SPA
  lib/api-spec/         OpenAPI contract + Orval codegen
  lib/api-client-react/ generated TanStack-Query client the app imports
docker-compose.yml   full stack: mongo + backend + Caddy-served frontend
```

## Deploy

```bash
docker compose up -d --build
```

Builds `mongo:7`, the backend (`backend/Dockerfile`), and the frontend served by Caddy
(`frontend/Dockerfile`). Provide `MONGODB_URI`, `JWT_SECRET`, and any AI/OAuth keys via the
environment. Cloned repos persist in the `backend_workspaces` volume.

## Tech stack

**Backend:** FastAPI · MongoDB (pymongo) · Anthropic Claude · bcrypt + JWT · lizard ·
httpx  
**Frontend:** Vite · React · wouter · TanStack Query · Tailwind · three.js / React-Three-Fiber ·
Orval  
**Infra:** Docker Compose · Caddy

# Repo-Pulse — Backend

The Python **FastAPI** service behind Repo-Pulse. It clones a public git repository,
mines its history, computes code-health metrics, scores technical debt with a
research-based model, and serves the results — plus optional Claude-powered analysis —
to the frontend over the `/api` contract. Data is persisted in **MongoDB**, and every
route is authenticated (JWT) and scoped per user.

## Stack

- **FastAPI** + Uvicorn (ASGI)
- **MongoDB** via `pymongo` (`app/db.py`, `app/store.py`)
- **Auth**: bcrypt password hashing + JWT (`PyJWT`); optional GitHub/Google OAuth
- **Metrics**: `lizard` (cyclomatic/cognitive complexity), custom git mining + duplication
- **AI**: Anthropic `anthropic` SDK (Claude) for file/repo analysis and the Learn tour;
  OpenRouter (via `httpx`) for the multi-model chat

## Layout

```
app/
  main.py            FastAPI app: CORS + router mounting
  db.py              MongoDB client
  store.py           data-access layer (RepoStore) — all Mongo reads/writes
  api/
    api_routes.py    the /api contract (repos, files, findings, chat, AI, dashboard, settings)
    auth_routes.py   signup/login/me, password reset, GitHub/Google OAuth
  schemas/           Pydantic request/response models
  services/          the analysis pipeline (see below)
```

### Analysis pipeline (`app/services/`)

```
repo_ingestion / repo_validator   clone a public repo (shallow, SSRF-guarded)
        |
git_mining                        churn, ownership/contributors, temporal coupling, commits
        |
complexity . duplication .        per-file metrics (lizard, near-dup detection,
file_metrics . file_classify      comment/function counts, file type)
        |
analysis (_TD_MODEL)              research-based technical-debt score (8 weighted metrics,
        |                         min-max normalised) + per-metric contribution breakdown
findings                          ranked, explained findings
        |
ai_analysis . chat . tour         Claude file/repo insight, grounded chat, Learn walkthrough
```

The debt model in `analysis.py` (`_TD_MODEL`) is adapted from a Lund University thesis:
`TD = sum(Wk * Mk)` over repo-normalised metrics (cyclomatic & cognitive complexity, size,
churn, duplication, coupling — minus comment coverage & decomposition). The AI is fed
that score's actual per-metric contributions so its explanation matches the number.

## Run (local dev)

Three processes. Requires Python 3.9+ and a local MongoDB.

```bash
# 1. MongoDB (any local instance on :27017), e.g.
mongod --dbpath ~/mongodb-data --port 27017

# 2. Backend
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
JWT_SECRET=dev-secret .venv/bin/uvicorn app.main:app --reload --port 8000
```

Health check: `curl localhost:8000/api/healthz` -> `{"status":"ok"}`.
The frontend (`../frontend/app`) proxies `/api` here in dev, so they share an origin.

To enable Claude analysis, prefix the command with `ANTHROPIC_API_KEY=sk-ant-...`
(optionally `REPO_PULSE_AI_MODEL=claude-haiku-4-5` for a cheaper model). Without a key,
AI endpoints degrade gracefully with a clear "configure a key" message.

## Environment variables

| Variable | Purpose | Required |
|---|---|---|
| `MONGODB_URI` | Mongo connection string (default `mongodb://localhost:27017`) | prod |
| `MONGODB_DB` | database name (default `repo_pulse`) | no |
| `JWT_SECRET` | secret for signing auth tokens | **yes** |
| `JWT_EXPIRE_DAYS` | token lifetime | no |
| `ANTHROPIC_API_KEY` | enables Claude file/repo analysis + Learn tour | no |
| `REPO_PULSE_AI_MODEL` | override the Claude model | no |
| `OPENROUTER_API_KEY` | default key for the free/demo chat | no |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth login | no |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth login | no |
| `OAUTH_REDIRECT_BASE` / `FRONTEND_URL` | OAuth + password-reset redirect targets | prod |
| `RESEND_API_KEY` / `EMAIL_FROM` | transactional email (password reset) | no |
| `REPO_PULSE_CLONE_TTL_DAYS` | LRU eviction age for on-disk clones | no |
| `REPO_PULSE_REFRESH_COOLDOWN_S` | min seconds between repo re-analyses | no |

## API surface (all under `/api`, JWT-protected except auth + health)

- **Auth** — `POST /auth/signup`, `/auth/login`; `GET/PATCH/DELETE /auth/me`;
  `/auth/forgot-password`, `/auth/reset-password`; `GET /auth/{github,google}/login|callback`
- **Repositories** — `GET/POST /repositories`, `GET/DELETE /repositories/{id}`,
  `POST /repositories/{id}/reanalyze`; `.../files`, `.../files/{id}/content`,
  `.../commits`, `.../coupling`, `.../findings`, `.../activity`
- **AI** — `POST /repositories/{id}/chat`, `.../ai-report`, `.../files/{id}/ai-insight`,
  `.../tour`; `GET /ai/status`, `/chat/models`
- **Misc** — `GET /dashboard/summary`, `GET/PUT /settings`, `GET /healthz`

## Deploy

`docker compose up -d --build` from the repo root builds this service (`backend/Dockerfile`)
alongside `mongo:7` and the Caddy-served frontend. Clones live in a persistent
`backend_workspaces` volume; set `MONGODB_URI`, `JWT_SECRET`, and any AI/OAuth keys via
the environment. See the root `README.md` for the full stack.

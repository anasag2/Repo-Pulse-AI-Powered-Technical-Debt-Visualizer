from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router as legacy_router
from app.api.api_routes import router as api_router

app = FastAPI(
    title="Repo Pulse API",
)

# Allow the Vite dev server (and any localhost origin) to call the API directly.
# In the default setup the frontend reaches the backend through Vite's `/api`
# proxy (same-origin), so CORS is only needed if the client is pointed at the
# backend directly via `setBaseUrl`.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Contract API consumed by the React frontend (mounted under /api).
app.include_router(api_router)

# Legacy/manual endpoint kept for backwards compatibility.
app.include_router(legacy_router)


@app.get("/")
def root():
    return {"message": "Repo pulse backend"}

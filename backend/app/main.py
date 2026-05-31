from fastapi import FastAPI
from app.api.routes import router

app = FastAPI(
    title="Repo Pulse API",
)

app.include_router(router)

@app.get("/")
def root():
    return {"message": "Repo pulse backend"}
# Repo-Pulse backend (FastAPI). Needs git, since the analyzer clones repos.
FROM python:3.11-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends git \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Cloned repos land here; a compose volume keeps them across restarts.
RUN mkdir -p workspaces

EXPOSE 8000

# Repo routes are sync (`def`), so they run in Starlette's threadpool — one
# uvicorn worker handles concurrent requests fine for this workload.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

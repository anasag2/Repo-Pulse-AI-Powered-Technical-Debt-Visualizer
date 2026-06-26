# Build the SPA in the pnpm workspace, then serve it with Caddy.
# NOTE: the workspace pins esbuild to linux-x64, so build for linux/amd64
# (the default EC2 architecture — native there).

# ---- build stage ----
FROM node:20-slim AS build
RUN npm install -g pnpm@9
WORKDIR /app

# Whole workspace (lockfile + all package manifests + sources), then install.
COPY . .
RUN pnpm install --frozen-lockfile

# vite.config requires PORT and BASE_PATH even for a production build.
RUN cd artifacts/repo-pulse && PORT=5173 BASE_PATH=/ pnpm run build

# ---- serve stage ----
FROM caddy:2-alpine
COPY --from=build /app/artifacts/repo-pulse/dist/public /srv
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 80 443

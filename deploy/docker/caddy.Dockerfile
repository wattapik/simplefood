# Builds the Expo web export and serves it (plus reverse-proxying /api/* to the
# backend container) from a single Caddy container with automatic HTTPS.
FROM node:22-slim AS web-builder
WORKDIR /app
COPY app/package.json app/package-lock.json ./
RUN npm ci
COPY app/ ./
RUN npx expo export --platform web

FROM caddy:2-alpine
COPY --from=web-builder /app/dist /srv/web
COPY deploy/docker/Caddyfile /etc/caddy/Caddyfile

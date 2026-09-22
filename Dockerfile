# Stage 1: Build the Next.js application
FROM node:20-slim AS builder

# Set working directory
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

# Copy package.json and package-lock.json (or yarn.lock)
COPY package*.json ./

# Install dependencies
# Using npm ci for cleaner installs in CI/build environments
RUN npm ci

# Copy the rest of the application code
COPY . .

# Build the application
# This will output to the 'out' directory due to `output: 'export'` in next.config.ts
# NEXT_TELEMETRY_DISABLED: prevents background HTTP requests triggering TLS/crypto module init crashes.
# Node 20 (not 22): Node 22's Turboshaft JIT hits an "unreachable code" V8 assertion crash in
# turboshaft::BuildGraph during page-data collection under Docker/WSL2 virtualization.
RUN NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS="--max-old-space-size=4096" npm run build

# Stage 2: Serve the static files with Nginx
FROM nginx:stable-alpine

ENV OIDC_ENABLED=true
ENV CLOUD_CONNECTORS=[]
ENV UI_FOOTER_ENABLED=false

#ENV LAMASSU_API
#ENV OIDC_AUTHORITY
#ENV OIDC_CLIENT_ID


# Copy the main Nginx configuration with /tmp runtime paths and an
# unprivileged listen port so nginx can run as 65532:65532.
COPY nginx.conf /etc/nginx/nginx.conf

# Copy the static assets from the builder stage
# The 'out' directory contains the result of `next export`
COPY --from=builder --chown=65532:65532 /app/out /var/www/html

WORKDIR /var/www/html

COPY ./config.js.tmpl /tmpl/config.js.tmpl

COPY ./docker-entrypoint.sh /docker-entrypoint.sh

RUN chmod +x /docker-entrypoint.sh && \
    apk add --no-cache bash

# Run as the chart-wide numeric non-root identity. The entrypoint only writes
# to paths owned by this UID, so no ownership-changing capabilities are needed.
USER 65532:65532

# Expose the unprivileged port the chart expects
EXPOSE 8085

# Start Nginx
ENTRYPOINT ["bash", "/docker-entrypoint.sh"]

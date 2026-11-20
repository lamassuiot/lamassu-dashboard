# Stage 1: Build the Vite application
FROM node:26-slim AS builder

# Set working directory
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

# Copy pnpm from its official image.
# Keep the tag in sync with packageManager in package.json.
COPY --from=ghcr.io/pnpm/pnpm:12.15.0 /opt/pnpm /opt/pnpm
RUN ln -s /opt/pnpm/pnpm /usr/local/bin/pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install exactly the dependencies committed in the lockfile.
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy the rest of the application code
COPY . .

# Build the application
# Vite writes the static application to out.
RUN NODE_OPTIONS="--max-old-space-size=4096" pnpm run build

# Stage 2: Wisp server for the browser terminal. Built on Alpine, like the final image, so its
# native modules match. Dependencies come with their prebuilt binaries; no install scripts run.
FROM node:22-alpine AS wisp
WORKDIR /opt/wisp
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund @mercuryworkshop/wisp-js@0.5.3

# Stage 3: Serve the static files with Nginx
FROM nginx:stable-alpine

ENV OIDC_ENABLED=true
ENV CLOUD_CONNECTORS=[]
ENV UI_FOOTER_ENABLED=false
ENV EXPERIMENTAL_WBTERM=false
# Wisp server bundled for the browser terminal, reached through nginx at /wisp/.
# WISP_ENABLED=false skips it; WISP_ALLOW_PRIVATE_IPS=true lets the terminal reach private
# addresses (an EST gateway on the internal network); WISP_OPTIONS replaces both with raw
# wisp-js options (JSON). LAMASSU_TERMINAL_WISP_URL defaults to /wisp/ while it runs.
ENV WISP_ENABLED=true
ENV WISP_ALLOW_PRIVATE_IPS=false

#ENV LAMASSU_API
#ENV OIDC_AUTHORITY
#ENV OIDC_CLIENT_ID


# Copy the main Nginx configuration with /tmp runtime paths and an
# unprivileged listen port so nginx can run as 65532:65532.
COPY nginx.conf /etc/nginx/nginx.conf

# Copy the static assets from the builder stage
COPY --from=builder --chown=65532:65532 /app/out /var/www/html

WORKDIR /var/www/html

COPY ./config.js.tmpl /tmpl/config.js.tmpl

COPY --from=wisp /opt/wisp /opt/wisp

COPY ./docker-entrypoint.sh /docker-entrypoint.sh

RUN chmod +x /docker-entrypoint.sh && \
    apk add --no-cache bash nodejs

# Run as the chart-wide numeric non-root identity. The entrypoint only writes
# to paths owned by this UID, so no ownership-changing capabilities are needed.
USER 65532:65532

# Expose the unprivileged port the chart expects
EXPOSE 8085

# Start Nginx
ENTRYPOINT ["bash", "/docker-entrypoint.sh"]

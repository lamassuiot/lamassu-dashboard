# Stage 1: Build the Vite application
FROM node:24-slim AS builder

# Set working directory
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

# Use the pnpm version pinned in package.json.
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install exactly the dependencies committed in the lockfile.
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy the rest of the application code
COPY . .

# Build the application
# Vite writes the static application to out.
RUN NODE_OPTIONS="--max-old-space-size=4096" pnpm run build

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

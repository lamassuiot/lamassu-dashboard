# Build from the repository root (the SDK is a workspace package):
#   docker build -f microfrontends/<module>/Dockerfile \
#     --build-arg MODULE_DIR=microfrontends/<module> --build-arg MODULE_PATH=<module-url-segment> \
#     -t <registry>/<module>:<tag> .
FROM node:22-slim AS builder
ARG MODULE_DIR=microfrontends/poc-service
WORKDIR /app

# Keep the tag in sync with packageManager in the root package.json.
COPY --from=ghcr.io/pnpm/pnpm:12.15.0 /opt/pnpm /opt/pnpm
RUN ln -s /opt/pnpm/pnpm /usr/local/bin/pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages packages
COPY microfrontends microfrontends
RUN pnpm install --frozen-lockfile --ignore-scripts --filter "./${MODULE_DIR}..."
RUN pnpm --filter "./${MODULE_DIR}" build

FROM nginx:stable-alpine
ARG MODULE_DIR=microfrontends/poc-service
# URL segment under /ui/modules/ (use your module's name with dashes).
ARG MODULE_PATH=poc-service
COPY ${MODULE_DIR}/nginx.conf /etc/nginx/nginx.conf
COPY --from=builder --chown=65532:65532 /app/${MODULE_DIR}/dist /var/www/html/ui/modules/${MODULE_PATH}
USER 65532:65532
EXPOSE 8085
CMD ["nginx", "-g", "daemon off;"]

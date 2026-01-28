# Stage 1: Build the Next.js application
FROM node:24 AS builder

# Install pnpm via wget script and set PATH
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN wget -qO- https://get.pnpm.io/install.sh | ENV="$HOME/.bashrc" SHELL="$(which bash)" bash -

# Set working directory
WORKDIR /app
RUN apt update && apt install -y git 

# Copy package.json and pnpm-lock.yaml
COPY package*.json ./
COPY pnpm-lock.yaml ./

# Install dependencies
# Using pnpm for package management
RUN pnpm i

# Copy the rest of the application code
COPY . .

# Build the application
# This will output to the 'out' directory due to `output: 'export'` in next.config.ts
RUN pnpm run build

# Stage 2: Serve the static files with Nginx
FROM nginx:stable-alpine

ENV OIDC_ENABLED=true
ENV CLOUD_CONNECTORS=[]
ENV UI_FOOTER_ENABLED=false

#ENV LAMASSU_API
#ENV OIDC_AUTHORITY
#ENV OIDC_CLIENT_ID


# Remove default Nginx server configuration
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the static assets from the builder stage
# The 'out' directory contains the result of `next export`
COPY --from=builder /app/out /var/www/html

WORKDIR /var/www/html
COPY ./config.js.tmpl /tmpl/config.js.tmpl

COPY ./docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh && \
    apk add --no-cache bash

# Expose port 80
EXPOSE 80

# Start Nginx
ENTRYPOINT ["bash", "/docker-entrypoint.sh"]

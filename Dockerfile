# Multi-stage production cloud container for RTPL HireNeuron Verity
# Stage 1: Build Next.js frontend on Debian Bookworm (matching runner glibc)
FROM node:20-slim AS frontend-builder
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm install
COPY web/ ./
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build

# Stage 2: Unified Production Runtime (Python 3.12 + Node.js LTS on Debian Bookworm)
FROM python:3.12-slim AS runner

# Install Node.js LTS and curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    gnupg \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python backend dependencies
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Copy Backend and Workers
COPY backend /app/backend
COPY workers /app/workers
COPY scripts /app/scripts

# Copy Built Next.js Frontend
COPY --from=frontend-builder /app/web/.next /app/web/.next
COPY --from=frontend-builder /app/web/public /app/web/public
COPY --from=frontend-builder /app/web/package.json /app/web/package.json
COPY --from=frontend-builder /app/web/node_modules /app/web/node_modules
COPY --from=frontend-builder /app/web/next.config.mjs /app/web/next.config.mjs

# Data directory for persistent SQLite and Evidence
RUN mkdir -p /app/data

# Startup entrypoint
COPY scripts/start_cloud.sh /app/start_cloud.sh
RUN chmod +x /app/start_cloud.sh

EXPOSE 3000
EXPOSE 8000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["/bin/bash", "/app/start_cloud.sh"]

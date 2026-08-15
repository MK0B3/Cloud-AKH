# ─── Stage 1: builder ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy manifests first for better layer caching
COPY package*.json ./

# Install ALL dependencies (devDeps needed for vite build)
RUN npm ci

# Copy source code
COPY . .

# Build the production bundle → outputs to /app/dist
# VITE_API_BASE_URL is injected at build time via --build-arg
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

# ─── Stage 2: runner ──────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

# Remove default Nginx welcome page
RUN rm -rf /usr/share/nginx/html/*

# Copy built static files from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy our custom Nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Copy entrypoint that injects BACKEND_HOST at runtime
COPY docker-entrypoint.sh /docker-entrypoint.sh
# Strip Windows CRLF (in case the file was checked out with crlf line endings) + make executable
RUN sed -i 's/\r$//' /docker-entrypoint.sh && chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
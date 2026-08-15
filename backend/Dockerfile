# ─── Stage 1: deps ─────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# ─── Stage 2: runner ───────────────────────────────────
FROM node:20-alpine AS runner

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

# Use /health — lightweight, no DB call, correct for ALB health checks
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "app.js"]
# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files and install ALL deps (including devDeps needed for build)
COPY package*.json ./
RUN npm ci

# Copy source and prisma schema
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY tsconfig.json ./
COPY src ./src

# Generate Prisma client (DATABASE_URL only needed at runtime, not here)
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN npx prisma generate

# Compile TypeScript
RUN npm run build

# ── Stage 2: Runtime ───────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output and generated Prisma client
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy prisma schema (needed for db push at startup)
COPY prisma ./prisma
COPY prisma.config.ts ./

EXPOSE 5000

# Run migrations then start server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]

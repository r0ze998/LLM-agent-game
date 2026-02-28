# Multi-stage build for Murasato server
FROM oven/bun:1.3 AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lock* ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
RUN bun install --frozen-lockfile

# Build
FROM base AS runner
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/server/node_modules ./packages/server/node_modules
COPY packages/shared packages/shared
COPY packages/server packages/server
COPY package.json ./

EXPOSE 3001
ENV NODE_ENV=production

CMD ["bun", "packages/server/src/index.ts"]

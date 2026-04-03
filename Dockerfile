FROM node:20-slim AS base
RUN corepack enable pnpm

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY .npmrc ./

# Copy package.json files for all workspaces
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/shared/ packages/shared/
COPY apps/server/ apps/server/
COPY apps/web/ apps/web/

# Generate Prisma client
RUN cd apps/server && npx prisma generate

# Build shared types
RUN pnpm --filter shared build

# Build frontend
RUN pnpm --filter web build

# Build server
RUN pnpm --filter server build

# Production stage
FROM node:20-slim AS production
RUN corepack enable pnpm

WORKDIR /app

COPY --from=base /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/.npmrc ./
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages ./packages
COPY --from=base /app/apps/server/dist ./apps/server/dist
COPY --from=base /app/apps/server/package.json ./apps/server/
COPY --from=base /app/apps/server/prisma ./apps/server/prisma
COPY --from=base /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=base /app/apps/web/dist ./apps/web/dist

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Create data directory for SQLite
RUN mkdir -p /app/data

WORKDIR /app/apps/server
CMD ["node", "dist/index.js"]

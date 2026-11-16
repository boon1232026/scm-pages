# Shared image for @scm/api and @scm/worker (NestJS, pnpm monorepo).
# Build context = repository root.
FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /repo

# Install deps first (layer cache) — manifests only.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/sdk/package.json packages/sdk/
COPY packages/meta/package.json packages/meta/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
RUN pnpm install --frozen-lockfile --ignore-scripts

# Sources + prisma client + build.
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/worker ./apps/worker
RUN pnpm --filter @scm/api exec prisma generate && \
    pnpm --filter "@scm/api..." --filter "@scm/worker..." build

ENV NODE_ENV=production
EXPOSE 3001

# compose sets the concrete command per service.
CMD ["node", "apps/api/dist/main.js"]

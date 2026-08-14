FROM node:24-alpine AS base

ENV HUSKY=0
RUN corepack enable
WORKDIR /workspace

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile --filter @ecoyantra/api...

FROM dependencies AS builder
COPY apps/api apps/api
COPY packages packages
RUN pnpm --filter @ecoyantra/api build
RUN pnpm --filter @ecoyantra/api deploy --prod /prod/api

FROM node:24-alpine AS runner

ENV HOST=0.0.0.0
ENV NODE_ENV=production
ENV PORT=4000
WORKDIR /app

COPY --from=builder --chown=node:node /prod/api ./

USER node
EXPOSE 4000
CMD ["node", "dist/server.js"]

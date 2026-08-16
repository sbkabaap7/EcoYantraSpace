FROM node:24-alpine AS base

ENV HUSKY=0
RUN corepack enable
WORKDIR /workspace

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --filter @ecoyantra/web...

FROM dependencies AS builder
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
COPY apps/web apps/web
RUN pnpm --filter @ecoyantra/web build
# Next's pnpm standalone trace can retain only the CommonJS SWC helpers even
# though the server runtime resolves the ESM export. Complete that traced
# package from pnpm's content-addressed store before copying the bundle.
RUN set -eu; \
    SWC_SOURCE="$(find /workspace/node_modules/.pnpm -path '*/node_modules/@swc/helpers' -type d | head -n 1)"; \
    SWC_TARGET="$(find /workspace/apps/web/.next/standalone/node_modules/.pnpm -path '*/node_modules/@swc/helpers' -type d | head -n 1)"; \
    test -n "$SWC_SOURCE"; \
    test -n "$SWC_TARGET"; \
    cp -a "$SWC_SOURCE"/. "$SWC_TARGET"/

FROM node:24-alpine AS runner

ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

COPY --from=builder --chown=node:node /workspace/apps/web/public ./apps/web/public
COPY --from=builder --chown=node:node /workspace/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /workspace/apps/web/.next/static ./apps/web/.next/static

USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

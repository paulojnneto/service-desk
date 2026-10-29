# The agent API with the built screens, for the Docker Compose stack (stage 12 tech spec).
# Built from the repository root, so it can use the workspace packages:
#   docker build -f apps/api/Dockerfile .
FROM node:22-alpine
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# The manifests first, so a code change does not install the dependencies again.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/tickets/package.json apps/tickets/
COPY apps/web/package.json apps/web/
COPY packages/agent/package.json packages/agent/
COPY packages/shared/package.json packages/shared/
COPY packages/tickets-client/package.json packages/tickets-client/
# Dev dependencies stay: tsx runs the TypeScript directly, as `pnpm start` does.
RUN pnpm install --frozen-lockfile --filter "@nexo/api..." --filter "@nexo/web..."

COPY . .
RUN pnpm --filter @nexo/web build

ENV NODE_ENV=production
ENV WEB_DIST=/app/apps/web/dist
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["sh", "/app/docker/api-start.sh"]

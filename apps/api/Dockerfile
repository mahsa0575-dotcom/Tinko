# ---- build stage: install workspace dependencies ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/ai/package.json packages/ai/
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
COPY migrations ./migrations
COPY scripts ./scripts
COPY package.json ./package.json
RUN npm install --workspace @botai/api --workspace @botai/core --workspace @botai/db --workspace @botai/ai --workspace @botai/admin --ignore-scripts

# ---- build admin panel ----
COPY apps/admin ./apps/admin
RUN npm run build -w @botai/admin

# ---- runtime ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 8080
# Migrations run before start (idempotent)
CMD ["sh", "-c", "node scripts/migrate.js && node apps/api/src/server.js"]

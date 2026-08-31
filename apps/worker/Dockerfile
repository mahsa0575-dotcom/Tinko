# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/ai/package.json packages/ai/
COPY apps/worker/package.json apps/worker/
RUN npm install --workspace @botai/worker --workspace @botai/core --workspace @botai/db --workspace @botai/ai --ignore-scripts

# ---- runtime ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
CMD ["node", "apps/worker/src/index.js"]

# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/ai/package.json packages/ai/
COPY apps/bot/package.json apps/bot/
RUN npm install --workspace @botai/bot --workspace @botai/core --workspace @botai/db --workspace @botai/ai --ignore-scripts

# ---- sources ----
COPY packages ./packages
COPY apps/bot ./apps/bot

# ---- runtime ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 8081
CMD ["node", "apps/bot/src/index.js"]

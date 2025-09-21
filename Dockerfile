# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS base
WORKDIR /app

# Install dependencies using npm workspaces
COPY package*.json ./
COPY server/package*.json server/
COPY web/package*.json web/
RUN npm ci

FROM base AS ci

# Copy source files and run the CI tasks (lint, test, build)
COPY . .
RUN npm run lint
RUN npm run test --workspace server -- --coverage --coverage.reporter=lcov
RUN npm run test --workspace web -- --coverage --coverage.reporter=lcov
RUN npm run build

FROM ci AS builder

# Remove development dependencies to slim down the final image
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy the workspace manifests and production node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./
COPY --from=builder /app/server/package.json server/
COPY --from=builder /app/web/package.json web/
COPY --from=builder /app/node_modules ./node_modules

# Copy the compiled server and static frontend assets
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/web/dist ./web/dist
COPY --from=builder /app/.env.example ./

EXPOSE 8080

CMD ["node", "server/dist/index.js"]

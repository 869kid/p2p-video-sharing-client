# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS base
WORKDIR /app

# Install dependencies using npm workspaces
COPY package*.json ./
COPY server/package*.json server/
COPY web/package*.json web/
RUN npm ci

FROM base AS ci

# Copy source files for linting, testing, and building
COPY . .

RUN npm run lint \
  && npm run ci:test \
  && npm run build

RUN mkdir -p /ci-artifacts \
  && for workspace in server web; do \
    if [ -d "$workspace/coverage" ]; then \
      mkdir -p "/ci-artifacts/$workspace" \
        && cp -r "$workspace/coverage" "/ci-artifacts/$workspace/coverage"; \
    fi; \
    if [ -f "$workspace/vitest-report.xml" ]; then \
      mkdir -p "/ci-artifacts/$workspace" \
        && cp "$workspace/vitest-report.xml" "/ci-artifacts/$workspace/"; \
    fi; \
  done

FROM base AS build

# Copy source files and build both the frontend and backend
COPY . .
RUN npm run build

# Remove development dependencies to slim down the final image
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy the workspace manifests and production node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/package-lock.json ./
COPY --from=build /app/server/package.json server/
COPY --from=build /app/web/package.json web/
COPY --from=build /app/node_modules ./node_modules

# Copy the compiled server and static frontend assets
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web/dist
COPY --from=build /app/.env.example ./

EXPOSE 8080

CMD ["node", "server/dist/index.js"]

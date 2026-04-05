FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace manifests
COPY package.json ./
COPY server/package.json ./server/
COPY packages/game-logic/package.json ./packages/game-logic/
COPY packages/game-logic/tictactoe/package.json ./packages/game-logic/tictactoe/

# Install all workspace dependencies
RUN npm ci

# Copy source
COPY server ./server
COPY packages ./packages

# Build shared packages then server
RUN npm run build --workspace=packages/game-logic
RUN npm run build --workspace=packages/game-logic/tictactoe
RUN npm run build --workspace=server

# Runtime image
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/server/node_modules ./node_modules
COPY --from=builder /app/node_modules ./node_modules
COPY server/public ./public

ENV NODE_ENV=production

CMD ["node", "dist/app.js"]

FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace manifests
COPY package.json package-lock.json ./
COPY server/package.json ./server/

# Install workspace dependencies
RUN npm ci

# Copy source
COPY server ./server

# Build server
RUN npm run build --workspace=server

# Runtime image
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server/package.json ./server/package.json
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/public ./server/public

WORKDIR /app/server

CMD ["node", "dist/app.js"]
FROM node:20-alpine AS builder

WORKDIR /app

COPY admin/package.json admin/package-lock.json ./admin/
RUN npm ci --prefix admin

COPY admin ./admin
RUN npm run build --prefix admin

FROM nginx:alpine

COPY admin/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=builder /app/admin/dist /usr/share/nginx/html

EXPOSE 80

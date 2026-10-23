# syntax=docker/dockerfile:1
# The website, built and served as static files. Public origins are compiled in.
#   docker build --build-arg VITE_API_URL=https://api.bilhanah.com --build-arg VITE_ROOT_DOMAIN=bilhanah.com \
#     --build-arg VITE_DASHBOARD_URL=https://app.bilhanah.com .

FROM node:24-slim AS build
WORKDIR /app
ENV npm_config_update_notifier=false npm_config_fund=false npm_config_audit=false
COPY package.json package-lock.json ./
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
RUN npm ci --ignore-scripts
COPY . .
ARG VITE_API_URL
ARG VITE_ROOT_DOMAIN
ARG VITE_DASHBOARD_URL
ARG VITE_CONTACT_EMAIL
ARG VITE_CONTACT_WHATSAPP
ENV VITE_API_URL=$VITE_API_URL VITE_ROOT_DOMAIN=$VITE_ROOT_DOMAIN VITE_DASHBOARD_URL=$VITE_DASHBOARD_URL \
    VITE_CONTACT_EMAIL=$VITE_CONTACT_EMAIL VITE_CONTACT_WHATSAPP=$VITE_CONTACT_WHATSAPP
RUN npm run build -w @bilhanah/contracts && npm run build

FROM caddy:2.11.7
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv

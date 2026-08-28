# syntax=docker/dockerfile:1
# check=skip=SecretsUsedInArgOrEnv

FROM node:22-alpine AS build

WORKDIR /workspace/frontend

COPY frontend/package.json frontend/package-lock.json frontend/.npmrc ./
RUN npm ci

WORKDIR /workspace
COPY . .
WORKDIR /workspace/frontend

# Create React App reads these values while compiling. Railway variables are
# not available inside Docker builds unless the arguments are declared.
ARG RAILWAY_GIT_COMMIT_SHA
ARG REACT_APP_API_BASE_URL
ARG REACT_APP_SUPABASE_URL
ARG REACT_APP_SUPABASE_ANON_KEY
ENV RAILWAY_GIT_COMMIT_SHA=${RAILWAY_GIT_COMMIT_SHA} \
    REACT_APP_API_BASE_URL=${REACT_APP_API_BASE_URL} \
    REACT_APP_SUPABASE_URL=${REACT_APP_SUPABASE_URL} \
    REACT_APP_SUPABASE_ANON_KEY=${REACT_APP_SUPABASE_ANON_KEY}

# Test, lint, browser, and typecheck authority lives in the immutable-SHA CI
# lane. Repeating the complete suite in Railway's image builder delayed every
# frontend delivery without adding a different boundary. The image still must
# produce the reviewed production bundle from scratch.
RUN CI=false npm run build

FROM caddy:2.10.2-alpine

COPY frontend/Caddyfile /etc/caddy/Caddyfile
COPY deploy/railway/frontend.force-deploy /etc/railway-deployment-provenance
COPY --from=build /workspace/frontend/build /srv

EXPOSE 8080

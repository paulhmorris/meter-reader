# One image runs all three processes; compose picks between them with a command.
FROM golang:1.26 AS ingest
WORKDIR /src
COPY services/ingest/go.mod services/ingest/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY services/ingest ./
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
  CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /ingest ./cmd/ingest

FROM node:24-slim AS manifests
# Prisma's postinstall and CLI check for updates over the network on every stage.
ENV CHECKPOINT_DISABLE=1
WORKDIR /srv
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY services/prune/package.json services/prune/

FROM manifests AS build
# Names the Sentry release the source maps are uploaded against; .dockerignore keeps .git out,
# so nothing here can infer the commit.
ARG SENTRY_RELEASE
# sentry-cli reads the system CA store, which node:slim does not have; Node's is compiled in,
# so nothing else in the build notices it is missing.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
# prisma generate reaches no database, but the shared Prisma config insists on a url.
# The token is a mount, never a layer, and without it the build just skips the upload.
# The maps are for Sentry; shipping them would serve the source to anyone who asked.
RUN --mount=type=secret,id=sentry_auth_token \
  DATABASE_URL=postgresql://build npm run db:generate \
  && SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token 2>/dev/null || true)" \
    npm run build --workspace apps/web \
  && find apps/web/build -name '*.map' -delete

FROM manifests AS runtime
ENV NODE_ENV=production NPM_CONFIG_UPDATE_NOTIFIER=false
# Half the prod tree is optional peers npm installs for packages that never ask for them at
# runtime — vite, @sveltejs/kit, tailwindcss, typescript. --legacy-peer-deps declines them.
# A prod dep that genuinely needs one would fail on boot, not here.
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --legacy-peer-deps
COPY --from=build /srv/packages/db ./packages/db
COPY --from=build /srv/apps/web/build ./apps/web/build
COPY --from=ingest /ingest /usr/local/bin/ingest
COPY services/prune ./services/prune
USER node
CMD ["node", "apps/web/build"]

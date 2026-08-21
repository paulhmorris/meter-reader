# One image runs all three processes; compose picks between them with a command.
FROM node:24-slim AS manifests
WORKDIR /srv
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY services/ingest/package.json services/ingest/
COPY services/prune/package.json services/prune/

FROM manifests AS build
# Names the Sentry release the source maps are uploaded against; .dockerignore keeps .git out,
# so nothing here can infer the commit.
ARG SENTRY_RELEASE
RUN npm ci
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
RUN npm ci --omit=dev
COPY --from=build /srv/packages/db ./packages/db
COPY --from=build /srv/apps/web/build ./apps/web/build
COPY services/ingest ./services/ingest
COPY services/prune ./services/prune
USER node
CMD ["node", "apps/web/build"]

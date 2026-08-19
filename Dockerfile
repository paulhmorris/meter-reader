# One image runs all three processes; compose picks between them with a command.
FROM node:22-slim AS manifests
WORKDIR /srv
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY services/ingest/package.json services/ingest/
COPY services/prune/package.json services/prune/

FROM manifests AS build
RUN npm ci
COPY . .
# prisma generate reaches no database, but the shared Prisma config insists on a url.
RUN DATABASE_URL=postgresql://build npm run db:generate \
  && npm run build --workspace apps/web

FROM manifests AS runtime
ENV NODE_ENV=production NPM_CONFIG_UPDATE_NOTIFIER=false
RUN npm ci --omit=dev
COPY --from=build /srv/packages/db ./packages/db
COPY --from=build /srv/apps/web/build ./apps/web/build
COPY services/ingest ./services/ingest
COPY services/prune ./services/prune
USER node
CMD ["node", "apps/web/build"]

# Meter Reader

Lets neighbours view water usage from their own Neptune R900 meter, read over SDR with rtl_433, and warns them when their meter reports a leak.

See `CONTEXT.md` for the domain language and `docs/adr/` for the decisions behind it.

## Layout

| Workspace          | What it is                                                            |
| ------------------ | --------------------------------------------------------------------- |
| `apps/web`         | SvelteKit app. Serves the health route today, the meter pages later.  |
| `services/ingest`  | Plain-Node service. Will subscribe to MQTT and store Readings (#2).   |
| `packages/db`      | Prisma schema, migrations, and the client both processes share.       |

## Getting started

Requires Node 22+ and a PostgreSQL 17 server.

```sh
npm install
createdb meter-reader
cp .env.example .env     # then set DATABASE_URL for your Postgres
npm run db:generate
npm run db:deploy        # applies the checked-in migrations
npm run dev              # starts the app and the ingest service together
```

`npm run dev` serves the app on http://localhost:5173. `GET /health` round-trips Postgres: 200 with `{"status":"ok"}` when the database answers, 503 with the failure reason when it does not.

## Environment variables

Both processes read a single `.env` at the repo root: `apps/web` loads it in `vite.config.ts`, `services/ingest` through `--env-file-if-exists`, and Prisma through `packages/db/prisma.config.ts`. In production nothing loads a file — supply the variables through the environment.

| Variable                    | Used by      | Required | Meaning                                                                       |
| --------------------------- | ------------ | -------- | ----------------------------------------------------------------------------- |
| `DATABASE_URL`              | both, Prisma | yes      | Postgres connection string. Include the user: `postgresql://user@host:5432/meter-reader?schema=public`. |
| `SENTRY_DSN`                | both         | no       | Server-side Sentry DSN. Blank disables reporting.                             |
| `SENTRY_ENVIRONMENT`        | both         | no       | Sentry environment name. Defaults to `development`.                           |
| `PUBLIC_SENTRY_DSN`         | app          | no       | Browser Sentry DSN. Blank disables reporting.                                  |
| `PUBLIC_SENTRY_ENVIRONMENT` | app          | no       | Browser Sentry environment name. Defaults to `development`.                    |

The ingest service refuses to start without `DATABASE_URL` rather than failing on its first query.

## Scripts

Run from the repo root.

| Script                | What it does                                                     |
| --------------------- | ---------------------------------------------------------------- |
| `npm run dev`         | Starts the app and the ingest service together.                  |
| `npm run build`       | Builds every workspace that has a build.                         |
| `npm run check`       | Typechecks every workspace.                                      |
| `npm test`            | Runs every workspace's tests.                                    |
| `npm run db:generate` | Regenerates the Prisma client.                                   |
| `npm run db:migrate`  | Creates and applies a migration from schema changes.             |
| `npm run db:deploy`   | Applies existing migrations, for CI and production.              |

## Checking Sentry

With a DSN set, `GET /debug-sentry` (development only) throws in the app, and starting the ingest service with `INGEST_DEBUG_SENTRY=1` throws in the service. Both errors should appear in Sentry.

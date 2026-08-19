# Meter Reader

Lets neighbours view water usage from their own Neptune R900 meter, read over SDR with rtl_433, and warns them when their meter reports a leak.

See `CONTEXT.md` for the domain language and `docs/adr/` for the decisions behind it.

## Layout

| Workspace          | What it is                                                            |
| ------------------ | --------------------------------------------------------------------- |
| `apps/web`         | SvelteKit app. Claim Codes, Grants, the meter page and the Admin surface. |
| `services/ingest`  | Plain-Node service. Subscribes to MQTT and stores Readings.           |
| `services/prune`   | Plain-Node job. Thins old Readings by age, run nightly.               |
| `packages/db`      | Prisma schema, migrations, and the client every process shares.       |

## Getting started

Requires Node 22+ and a PostgreSQL 17 server.

```sh
npm install
createdb meter-reader
cp .env.example .env     # then set DATABASE_URL, GRANT_SECRET and ADMIN_PASSWORD
npm run db:generate
npm run db:deploy        # applies the checked-in migrations
npm run db:seed          # a demo Meter with Readings, and a Claim Code to enter
npm run dev              # starts the app and the ingest service together
```

`npm run dev` serves the app on http://localhost:5173. The landing page takes the Claim Code printed by `npm run db:seed` and sends you to that Meter's page. `/admin` takes `ADMIN_PASSWORD` and lists every Meter, where Claim Codes are issued and rotated and Grants revoked. `GET /health` round-trips Postgres: 200 with `{"status":"ok"}` when the database answers, 503 with the failure reason when it does not.

## Environment variables

Both processes read a single `.env` at the repo root: `apps/web` loads it in `vite.config.ts`, `services/ingest` through `--env-file-if-exists`, and Prisma through `packages/db/prisma.config.ts`. In production nothing loads a file — supply the variables through the environment.

| Variable                    | Used by      | Required | Meaning                                                                       |
| --------------------------- | ------------ | -------- | ----------------------------------------------------------------------------- |
| `GRANT_SECRET`              | app          | yes      | Signs the Grant and Admin cookies. Any long random string: `openssl rand -base64 32`. Changing it invalidates every Grant and signs out the Admin. |
| `ADMIN_PASSWORD`            | app          | no       | What the Admin signs in with at `/admin`. Unset or blank, the Admin surface admits nobody. |
| `DATABASE_URL`              | both, Prisma | yes      | Postgres connection string. Include the user: `postgresql://user@host:5432/meter-reader?schema=public`. |
| `MQTT_URL`                  | ingest       | yes      | Broker the Pi's rtl_433 publishes to: `mqtt://homeassistant.local:1883`.       |
| `MQTT_TOPIC`                | ingest       | yes      | Topic the decoded transmissions arrive on, e.g. `rtl_433/+/events`.            |
| `MQTT_USERNAME`             | ingest       | yes      | Broker username.                                                              |
| `MQTT_PASSWORD`             | ingest       | yes      | Broker password.                                                              |
| `SENTRY_DSN`                | both         | no       | Server-side Sentry DSN. Blank disables reporting.                             |
| `SENTRY_ENVIRONMENT`        | both         | no       | Sentry environment name. Defaults to `development`.                           |
| `PUBLIC_SENTRY_DSN`         | app          | no       | Browser Sentry DSN. Blank disables reporting.                                  |
| `PUBLIC_SENTRY_ENVIRONMENT` | app          | no       | Browser Sentry environment name. Defaults to `development`.                    |

Claim attempts are rate-limited per client address. Behind a reverse proxy, set adapter-node's `ADDRESS_HEADER` (and `XFF_DEPTH`) so the app sees the neighbour's address rather than the proxy's — otherwise every household shares one bucket.

The ingest service refuses to start without `DATABASE_URL` or the `MQTT_*` variables rather than failing on its first query.

## Scripts

Run from the repo root.

| Script                | What it does                                                     |
| --------------------- | ---------------------------------------------------------------- |
| `npm run dev`         | Starts the app and the ingest service together.                  |
| `npm run build`       | Builds every workspace that has a build.                         |
| `npm run check`       | Typechecks every workspace.                                      |
| `npm run lint`        | Runs oxlint (correctness rules only).                            |
| `npm run format`      | Formats the source with oxfmt.                                   |
| `npm run format:check`| Fails if the source is not formatted, for CI.                    |
| `npm test`            | Runs every workspace's tests.                                    |
| `npm run db:generate` | Regenerates the Prisma client.                                   |
| `npm run db:migrate`  | Creates and applies a migration from schema changes.             |
| `npm run db:deploy`   | Applies existing migrations, for CI and production.              |
| `npm run db:seed`     | Seeds a demo Meter with Readings and prints its Claim Code.      |
| `npm run prune`       | Thins old Readings once and exits. Run nightly (see below).      |

## Pruning Readings

`npm run prune` thins the Reading table by age — raw for 7 days, then the last Reading of each hour to 60 days, of each day to a year, of each week beyond (ADR-0003). Usage for any period the UI shows at that age is unchanged by a prune, and Meter Events are never touched. It deletes in batches, is safe to run against live ingest, and running it twice deletes nothing the second time.

It runs once and exits, so schedule it nightly with cron or a systemd timer:

```
15 3 * * * cd /srv/meter-reader && npm run prune >> /var/log/meter-reader-prune.log 2>&1
```

Only `DATABASE_URL` is required. A failed run exits non-zero and reports to Sentry.

## Checking Sentry

With a DSN set, `GET /debug-sentry` (development only) throws in the app, and starting the ingest service with `INGEST_DEBUG_SENTRY=1` throws in the service. Both errors should appear in Sentry.

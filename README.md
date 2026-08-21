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
| `ORIGIN`                    | app          | in prod  | Where the app is served, e.g. `https://meter.example.com`. adapter-node rejects form posts from any other origin. |
| `VAPID_PUBLIC_KEY`          | app, ingest  | no       | Public half of the VAPID pair browsers subscribe with. Blank and the app offers no leak warnings. |
| `VAPID_PRIVATE_KEY`         | ingest       | no       | Private half, which signs each push. Blank and nothing is ever pushed.        |
| `VAPID_SUBJECT`             | ingest       | with keys| Who the push services contact about this app: `mailto:you@example.com`. Ingest refuses to start without it once the keys are set. |
| `ADDRESS_HEADER`            | app          | in prod  | Header carrying the client address behind a proxy. `X-Forwarded-For`, which both Caddy and cloudflared set; anything else in front must set it too. |

The Signal columns on the Admin list are filled from rtl_433's `rssi` and `snr`, which it only publishes when it is run with `-M level`. Without that flag every Reading is stored with no Signal and the column reads `—`.

Claim attempts are rate-limited per client address. Behind a reverse proxy, set adapter-node's `ADDRESS_HEADER` (and `XFF_DEPTH`) so the app sees the neighbour's address rather than the proxy's — otherwise every household shares one bucket.

The ingest service refuses to start without `DATABASE_URL` or the `MQTT_*` variables rather than failing on its first query.

## Leak warnings

A neighbour can turn on leak warnings from their meter page. The browser asks for notification permission, and the Push Endpoint it issues is held against their Grant — no accounts, no email addresses, and revoking the Grant silences the device (ADR-0006). When a Meter Event opens an Active Leak, the ingest service pushes every device still holding a Grant for that Meter; backflow, no-use and a leak clearing push nothing. Tapping the warning opens that Meter's page.

Generate the VAPID pair once and keep it:

```sh
npx web-push generate-vapid-keys
```

Put the public key in `VAPID_PUBLIC_KEY` for both processes, the private key in `VAPID_PRIVATE_KEY` for ingest, and a contact URL in `VAPID_SUBJECT`. Changing the pair invalidates every device's Push Endpoint, so each has to turn warnings on again. With the keys unset the meter page offers nothing to turn on and ingest logs that it will push nothing — everything else works as before.

Browsers only allow this over HTTPS, which the tunnel provides; a LAN route needs a real certificate for the same reason the cookies do. On iOS the site has to be added to the Home Screen before it can ask for permission at all.

## Deploying

Everything runs as Docker Compose services on one machine on the same LAN as Home Assistant, because the ingest service has to reach the MQTT broker there (ADR-0005). A push to `main` builds the image and pushes it to `ghcr.io/paulhmorris/meter-reader`; the host pulls it (ADR-0007).

The Compose file in this repo builds from source, which is what a checkout is for:

```sh
cp .env.production.example .env    # then fill it in
docker compose up -d --build
```

The deployed copy is not that one. It lives in the `stacks` repo under `navi/meter-reader`, pulls the published image instead of building, and is deployed by Komodo, which holds every secret in the stack's environment rather than in a `.env` on the host. Deploying a new build is `docker compose pull && docker compose up -d` there, or the same from Komodo; pinning one is setting `METER_READER_TAG` to a `sha-` tag.

The image carries no configuration, so the same one runs for anyone. Both Sentry DSNs, the VAPID keys and every password arrive at runtime, and CI fails the build if a value reaches the bundle at build time.

`ORIGIN` must match what the browser shows exactly. adapter-node rejects form posts from any other origin, so getting it wrong breaks claiming and Admin sign-in while every page still loads.

| Service      | What it does                                                                |
| ------------ | --------------------------------------------------------------------------- |
| `postgres`   | Postgres 17, on the `pgdata` volume. Reachable only from the other services. |
| `migrate`    | Runs `prisma migrate deploy` and exits. `web` and `ingest` wait for it.      |
| `web`        | The SvelteKit app on port 3000, published per `WEB_BIND`.                    |
| `ingest`     | Subscribes to the broker and stores Readings.                                |
| `prune`      | Thins old Readings. Not started with the others; run nightly (below).        |

`web` and `ingest` are `restart: unless-stopped`, so both come back on failure and after a reboot.

### Reaching the app

The app reads the client address from `X-Forwarded-For` and adapter-node **fails the request** if that header is missing — a claim or an Admin sign-in without it is a 500, rather than a household silently sharing everyone else's rate-limit bucket. Anything put in front of the app has to set that header, and `XFF_DEPTH` has to match how many hops do.

In production a Cloudflare Tunnel is that one hop, and it runs as its own stack (`navi/cloudflared`) rather than beside the app, so one connector can serve other services and redeploying the app is not an outage for them. Its ingress rules are in git; it reaches `web` over a shared `edge` network, by the alias `meter-web`, and the app publishes no port at all. One route in means one `XFF_DEPTH`, and it means `/admin` has Cloudflare in front of it and no second door on the LAN.

A LAN reverse proxy can serve the app instead, by giving `WEB_BIND` an address it can dial. It must serve the **same hostname** as `ORIGIN` from split-horizon DNS, because adapter-node rejects every form post that did not arrive on the one in `ORIGIN`, and it needs a real certificate: the Grant and Admin cookies are `Secure`, so a browser reaching the app over `http://` accepts the page and silently drops the cookie, and a Claim appears to work without sticking. Running both routes at once means the two disagree about `XFF_DEPTH`, so pick one.

### Restarting

```sh
docker compose restart ingest      # or web
docker compose logs -f ingest      # what it is doing
docker compose ps                  # web reports healthy from GET /health
```

### Updating

```sh
docker compose exec -T postgres pg_dump --clean --if-exists -U meter meter-reader | gzip > ~/meter-reader-$(date +%F).sql.gz
docker compose pull
docker compose up -d
```

Migrations run before the new `web` and `ingest` start, so a deploy never serves a schema the code has not caught up to.

### Rolling back

Code alone rolls back by naming the previous image, `METER_READER_TAG=sha-<short>`, and bringing the stack up again.

Prisma migrations are forward-only — there are no down migrations. If the deploy being undone applied one, the old code will meet a schema it does not expect, so restore the database from the dump taken just before it:

```sh
docker compose stop web ingest
# The dump drops what it recreates, so it restores over the live schema.
gunzip -c ~/meter-reader-<date>.sql.gz | docker compose exec -T postgres psql -U meter -d meter-reader
docker compose start web ingest
```

Readings that arrived after the dump are lost — a gap in a chart, and never wrong numbers, since Usage is a difference of stored Consumption values (ADR-0002). Rolling back across a migration is the only case that needs this; take the dump every time regardless.

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

It runs once and exits, so schedule it nightly. In production that is a Komodo scheduled action against the stack:

```
docker compose run --rm prune
```

Locally, or outside Docker, `npm run prune` does the same thing.

Only `DATABASE_URL` is required. A failed run exits non-zero and reports to Sentry.

## Checking Sentry

With a DSN set, `GET /debug-sentry` (development only) throws in the app, and starting the ingest service with `INGEST_DEBUG_SENTRY=1` throws in the service. Both errors should appear in Sentry.

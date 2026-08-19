# Everything runs on one host beside the broker

The ingest service has to hold an MQTT subscription to the broker on the Home Assistant instance, which lives on a home LAN behind a residential connection, so the choice was to reach in or to run there. It runs there: app, ingest, Postgres and a Cloudflare Tunnel connector as Compose services on one machine on that LAN, with the tunnel making the app reachable over HTTPS without a forwarded port, a public IP or a certificate to renew. The alternative — the app and a managed Postgres in a cloud region, ingest at home dialling out — would have put the database on the internet and split one deploy into two for a service whose entire audience is a handful of neighbours.

The cost is that the app is only as available as the house: its power, its internet and its one disk, with no replica. That is proportionate to what the app is, and it buys a deploy that is `docker compose up -d --build` against a checkout, secrets in one untracked `.env`, and migrations run by a one-shot service that `web` and `ingest` wait on, so no process ever serves a schema the code has not caught up to.

Because the tunnel is the only way in, the app trusts `CF-Connecting-IP` for the client address and fails the request when it is absent, rather than falling back to an address that would put every household in one rate-limit bucket.

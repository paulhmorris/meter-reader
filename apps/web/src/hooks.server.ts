import * as Sentry from "@sentry/sveltekit";
import { sequence } from "@sveltejs/kit/hooks";
import { env } from "$env/dynamic/private";
import { resolveGrant } from "$lib/server/access.js";
import { prismaAccessStore } from "$lib/server/access-store.js";
import { grantSecret } from "$lib/server/config.js";
import { prisma } from "$lib/server/db.js";
import { GRANT_COOKIE } from "$lib/server/grant-cookie.js";
import type { Handle } from "@sveltejs/kit";

Sentry.init({
  dsn: env.SENTRY_DSN,
  environment: env.SENTRY_ENVIRONMENT || "development",
  tracesSampleRate: 1.0,
});

const withGrant: Handle = async ({ event, resolve }) => {
  event.locals.grant = await resolveGrant(
    prismaAccessStore(prisma()),
    event.cookies.get(GRANT_COOKIE),
    grantSecret(),
  );
  return resolve(event);
};

export const handle = sequence(Sentry.sentryHandle(), withGrant);
export const handleError = Sentry.handleErrorWithSentry();

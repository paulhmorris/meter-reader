import * as Sentry from "@sentry/sveltekit";
import { sequence } from "@sveltejs/kit/hooks";
import { redirect } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { resolveGrant } from "$lib/server/access.js";
import { prismaAccessStore } from "$lib/server/access-store.js";
import { ADMIN_COOKIE, adminSessionKey, isAdminSession } from "$lib/server/admin-session.js";
import { adminPassword, cookieSecret } from "$lib/server/config.js";
import { prisma } from "$lib/server/db.js";
import { GRANT_COOKIE } from "$lib/server/grant-cookie.js";
import type { Handle } from "@sveltejs/kit";

Sentry.init({
  dsn: env.SENTRY_DSN,
  environment: env.SENTRY_ENVIRONMENT || "development",
  tracesSampleRate: 1.0,
});

const LOGIN = "/admin/login";

const withGrant: Handle = async ({ event, resolve }) => {
  event.locals.grant = await resolveGrant(
    prismaAccessStore(prisma()),
    event.cookies.get(GRANT_COOKIE),
    cookieSecret(),
  );
  return resolve(event);
};

const withAdmin: Handle = async ({ event, resolve }) => {
  event.locals.admin = isAdminSession(
    event.cookies.get(ADMIN_COOKIE),
    adminSessionKey(cookieSecret(), adminPassword()),
    new Date(),
  );

  // The matched route, not the URL: a percent-encoded path reaches the same route by another name.
  const route = event.route.id ?? "";
  const adminSurface = route === "/admin" || route.startsWith("/admin/");
  if (adminSurface && route !== LOGIN && !event.locals.admin) redirect(303, LOGIN);

  return resolve(event);
};

export const handle = sequence(Sentry.sentryHandle(), withAdmin, withGrant);
export const handleError = Sentry.handleErrorWithSentry();

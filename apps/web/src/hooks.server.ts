import * as Sentry from "@sentry/sveltekit";
import { sequence } from "@sveltejs/kit/hooks";
import { env } from "$env/dynamic/private";

Sentry.init({
  dsn: env.SENTRY_DSN,
  environment: env.SENTRY_ENVIRONMENT || "development",
  tracesSampleRate: 1.0,
});

export const handle = sequence(Sentry.sentryHandle());
export const handleError = Sentry.handleErrorWithSentry();

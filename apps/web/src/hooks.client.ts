import * as Sentry from "@sentry/sveltekit";
import { env } from "$env/dynamic/public";

Sentry.init({
  dsn: env.PUBLIC_SENTRY_DSN,
  environment: env.PUBLIC_SENTRY_ENVIRONMENT || "development",
  tracesSampleRate: 1.0,
});

export const handleError = Sentry.handleErrorWithSentry();

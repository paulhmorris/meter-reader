import { error } from "@sveltejs/kit";
import { dev } from "$app/environment";
import type { RequestHandler } from "./$types.js";

/** Proves the Sentry wiring end to end; refuses to exist outside development. */
export const GET: RequestHandler = () => {
  if (!dev) error(404, "Not found");
  throw new Error("Sentry test error from the meter-reader web app");
};

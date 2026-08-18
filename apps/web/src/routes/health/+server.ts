import * as Sentry from "@sentry/sveltekit";
import { json } from "@sveltejs/kit";
import { prisma } from "$lib/server/db.js";
import { checkHealth } from "$lib/server/health.js";
import type { RequestHandler } from "./$types.js";

export const GET: RequestHandler = async () => {
  const report = await checkHealth(() => prisma().$queryRaw`SELECT 1`);
  if (report.status === "error") {
    Sentry.captureMessage(`Health check failed: ${report.error}`, "error");
  }
  return json(report, { status: report.status === "ok" ? 200 : 503 });
};

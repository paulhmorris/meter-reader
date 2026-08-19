import { fail, redirect } from "@sveltejs/kit";
import { claim } from "$lib/server/access.js";
import { prismaAccessStore } from "$lib/server/access-store.js";
import { cookieSecret } from "$lib/server/config.js";
import { prisma } from "$lib/server/db.js";
import { GRANT_COOKIE, GRANT_COOKIE_OPTIONS, signGrantId } from "$lib/server/grant-cookie.js";
import { createRateLimiter } from "$lib/server/rate-limit.js";
import type { Actions, PageServerLoad } from "./$types.js";

const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

/** One answer for a code that is malformed, unknown or rotated, so guessing reveals nothing. */
const REJECTED = "That code was not recognised.";

export const load: PageServerLoad = ({ locals }) => {
  if (locals.grant) redirect(303, `/meter/${locals.grant.meterId}`);
};

export const actions: Actions = {
  default: async ({ request, cookies, getClientAddress }) => {
    const form = await request.formData();
    const code = String(form.get("code") ?? "");

    const result = await claim(
      { store: prismaAccessStore(prisma()), limiter },
      {
        code,
        client: getClientAddress(),
        device: request.headers.get("user-agent"),
        now: new Date(),
      },
    );

    if (result.status === "rate-limited") {
      return fail(429, { error: "Too many attempts. Wait a minute and try again." });
    }
    if (result.status === "rejected") return fail(400, { error: REJECTED });

    cookies.set(GRANT_COOKIE, signGrantId(result.grantId, cookieSecret()), GRANT_COOKIE_OPTIONS);
    redirect(303, `/meter/${result.meterId}`);
  },
};

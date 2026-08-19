import { fail, redirect } from "@sveltejs/kit";
import { signIn } from "$lib/server/admin.js";
import {
  ADMIN_COOKIE,
  ADMIN_COOKIE_OPTIONS,
  adminSessionKey,
  signAdminSession,
} from "$lib/server/admin-session.js";
import { adminPassword, cookieSecret } from "$lib/server/config.js";
import { createRateLimiter } from "$lib/server/rate-limit.js";
import type { Actions, PageServerLoad } from "./$types.js";

const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

export const load: PageServerLoad = ({ locals }) => {
  if (locals.admin) redirect(303, "/admin");
};

export const actions: Actions = {
  default: async ({ request, cookies, getClientAddress }) => {
    const form = await request.formData();
    const now = new Date();

    const password = adminPassword();
    const result = signIn(
      { limiter },
      {
        password: String(form.get("password") ?? ""),
        expected: password,
        client: getClientAddress(),
        now,
      },
    );

    if (result === "rate-limited") {
      return fail(429, { error: "Too many attempts. Wait a minute and try again." });
    }
    if (result === "rejected") return fail(400, { error: "That password was not recognised." });

    cookies.set(
      ADMIN_COOKIE,
      signAdminSession(now, adminSessionKey(cookieSecret(), password)),
      ADMIN_COOKIE_OPTIONS,
    );
    redirect(303, "/admin");
  },
};

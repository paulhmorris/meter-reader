import { error, fail } from "@sveltejs/kit";
import { issueClaimCode } from "$lib/server/admin.js";
import { prismaAdminStore } from "$lib/server/admin-store.js";
import { formatClaimCode } from "$lib/server/claim-code.js";
import { prisma } from "$lib/server/db.js";
import { parseMeterId } from "$lib/server/meter.js";
import type { Actions, PageServerLoad } from "./$types.js";

async function meterOf(params: { meterId: string }): Promise<bigint> {
  const meterId = parseMeterId(params.meterId);
  if (meterId === null || !(await prismaAdminStore(prisma()).hasMeter(meterId))) {
    error(404, "Not found");
  }
  return meterId;
}

export const load: PageServerLoad = async ({ params }) => {
  const meterId = await meterOf(params);
  const store = prismaAdminStore(prisma());

  const [claimCode, grants] = await Promise.all([
    store.activeClaimCode(meterId),
    store.grants(meterId),
  ]);

  return { meterId: String(meterId), claimCode, grants };
};

export const actions: Actions = {
  /** Issues a Claim Code and shows it once; any older code stops claiming, its Grants untouched. */
  issue: async ({ params }) => {
    const meterId = await meterOf(params);
    const code = await issueClaimCode(prismaAdminStore(prisma()), { meterId, now: new Date() });

    return { issued: formatClaimCode(code) };
  },

  revoke: async ({ params, request }) => {
    const meterId = await meterOf(params);
    const form = await request.formData();
    const grantId = String(form.get("grantId") ?? "");

    const revoked = await prismaAdminStore(prisma()).revokeGrant({
      grantId,
      meterId,
      now: new Date(),
    });
    if (!revoked) return fail(404, { error: "That device's access was already gone." });

    return { revoked: true };
  },
};

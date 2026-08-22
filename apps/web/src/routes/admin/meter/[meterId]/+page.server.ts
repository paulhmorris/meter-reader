import { error, fail } from "@sveltejs/kit";
import { issueClaimCode, parseAddress, recentReadings } from "$lib/server/admin.js";
import { prismaAdminStore } from "$lib/server/admin-store.js";
import { formatClaimCode } from "$lib/server/claim-code.js";
import { prisma } from "$lib/server/db.js";
import { meterHealth, parseMeterId } from "$lib/server/meter.js";
import type { Actions, PageServerLoad } from "./$types.js";

async function meterOf(params: { meterId: string }): Promise<bigint> {
  const meterId = parseMeterId(params.meterId);
  if (meterId === null || !(await prismaAdminStore(prisma()).hasMeter(meterId))) {
    error(404, "Not found");
  }
  return meterId;
}

const READINGS_SHOWN = 10;

export const load: PageServerLoad = async ({ params }) => {
  const meterId = await meterOf(params);
  const store = prismaAdminStore(prisma());

  const [address, disabledAt, claimCode, grants, readings] = await Promise.all([
    store.address(meterId),
    store.disabledAt(meterId),
    store.activeClaimCode(meterId),
    store.grants(meterId),
    recentReadings(store, { meterId, count: READINGS_SHOWN }),
  ]);

  const health = readings[0] ? meterHealth(readings[0].receivedAt, new Date()) : null;

  return {
    meterId: String(meterId),
    address,
    disabledAt,
    claimCode: claimCode && {
      code: formatClaimCode(claimCode.code),
      createdAt: claimCode.createdAt,
    },
    grants,
    readings,
    health,
  };
};

export const actions: Actions = {
  /** Issues a Claim Code; any older code stops claiming, its Grants untouched. */
  issue: async ({ params }) => {
    const meterId = await meterOf(params);
    await issueClaimCode(prismaAdminStore(prisma()), { meterId, now: new Date() });

    return { issued: true };
  },

  /** Writes down where the meter is, so a leak names a neighbour rather than a number. */
  address: async ({ params, request }) => {
    const meterId = await meterOf(params);
    const form = await request.formData();

    await prismaAdminStore(prisma()).setAddress({
      meterId,
      address: parseAddress(String(form.get("address") ?? "")),
    });

    return { addressSaved: true };
  },

  /** Keeps a meter on a house nobody is using out of the Admin list. Readings are still stored. */
  disable: async ({ params, request }) => {
    const meterId = await meterOf(params);
    const form = await request.formData();
    const disabled = form.get("disabled") === "true";

    await prismaAdminStore(prisma()).setDisabledAt({
      meterId,
      disabledAt: disabled ? new Date() : null,
    });

    return { disabled };
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

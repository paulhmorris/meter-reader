import { error, json } from "@sveltejs/kit";
import { prisma } from "$lib/server/db.js";
import { parseMeterId } from "$lib/server/meter.js";
import { parseEndpointUrl, parsePushEndpoint } from "$lib/server/push.js";
import { prismaPushStore } from "$lib/server/push-store.js";
import type { RequestHandler } from "./$types.js";

/**
 * A device turns its own leak warnings on and off. The Grant is the only thing that names the
 * Meter, so an Admin session — which holds no Grant — has nothing here to subscribe.
 */
function grantFor(locals: App.Locals, meterId: string): string {
  const id = parseMeterId(meterId);
  if (id === null || !locals.grant || locals.grant.meterId !== id) error(404, "Not found");
  return locals.grant.id;
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const grantId = grantFor(locals, params.meterId);

  const endpoint = parsePushEndpoint(await request.json().catch(() => null));
  if (!endpoint) error(400, "Not a Push Endpoint");

  await prismaPushStore(prisma()).hold(grantId, endpoint);
  return json({ warnings: "on" });
};

export const DELETE: RequestHandler = async ({ params, request, locals }) => {
  const grantId = grantFor(locals, params.meterId);

  const endpoint = parseEndpointUrl(await request.json().catch(() => null));
  if (!endpoint) error(400, "Not a Push Endpoint");

  await prismaPushStore(prisma()).drop(grantId, endpoint);
  return json({ warnings: "off" });
};

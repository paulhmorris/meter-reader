import { env } from "$env/dynamic/private";

/** Signs the Grant cookie, so a device cannot name a Meter this app never granted it. */
export function grantSecret(): string {
  const secret = env.GRANT_SECRET;
  if (!secret) throw new Error("GRANT_SECRET is not set");
  return secret;
}

import { env } from "$env/dynamic/private";

/** Signs the Grant and Admin cookies, so a device cannot name a Meter this app never granted it. */
export function cookieSecret(): string {
  const secret = env.GRANT_SECRET;
  if (!secret) throw new Error("GRANT_SECRET is not set");
  return secret;
}

/** What the Admin signs in with. Unset means nobody can reach the Admin surface at all. */
export function adminPassword(): string {
  return env.ADMIN_PASSWORD ?? "";
}

/**
 * The VAPID public key browsers subscribe with, shared with the ingest service that signs
 * pushes with its pair. Unset means this app offers no leak warnings at all.
 */
export function vapidPublicKey(): string {
  return env.VAPID_PUBLIC_KEY ?? "";
}

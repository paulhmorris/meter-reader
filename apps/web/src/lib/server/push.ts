/** A browser's address for pushing to one device, with the keys a warning is encrypted to. */
export interface PushEndpoint {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushStore {
  /** Holds the Push Endpoint against this Grant, replacing whatever this Grant held for it. */
  hold(grantId: string, endpoint: PushEndpoint): Promise<void>;
  drop(grantId: string, endpoint: string): Promise<void>;
}

const MAX_ENDPOINT_LENGTH = 2048;
const BASE64URL = /^[A-Za-z0-9_-]{1,200}$/;

function pushServiceUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > MAX_ENDPOINT_LENGTH) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  return url.protocol === "https:" ? value : null;
}

function base64urlKey(value: unknown): string | null {
  return typeof value === "string" && BASE64URL.test(value) ? value : null;
}

/**
 * The Push Endpoint in what a browser posted, or null for anything no push service could have
 * issued — the body arrives from the device, so nothing in it is taken on trust.
 */
export function parsePushEndpoint(body: unknown): PushEndpoint | null {
  if (typeof body !== "object" || body === null) return null;

  const { endpoint, keys } = body as { endpoint?: unknown; keys?: unknown };
  if (typeof keys !== "object" || keys === null) return null;

  const url = pushServiceUrl(endpoint);
  const p256dh = base64urlKey((keys as { p256dh?: unknown }).p256dh);
  const auth = base64urlKey((keys as { auth?: unknown }).auth);

  return url && p256dh && auth ? { endpoint: url, p256dh, auth } : null;
}

/** The endpoint a browser named to stop its warnings, or null if it named none we could hold. */
export function parseEndpointUrl(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  return pushServiceUrl((body as { endpoint?: unknown }).endpoint);
}

/** 09:00 UTC is 3–4 am in the US Central time zone the meters are in: the quietest hour for ingest. */
export const PRUNE_HOUR_UTC = 9;

/** Milliseconds from `now` to the next PRUNE_HOUR_UTC, never zero, so a run can't repeat itself. */
export function msUntilNextPrune(now: Date): number {
  const next = new Date(now);
  next.setUTCHours(PRUNE_HOUR_UTC, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

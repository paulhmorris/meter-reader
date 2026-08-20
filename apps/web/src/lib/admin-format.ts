const ZONE = "America/Chicago";

const stamp = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: ZONE,
});

/** When the Admin pages say something happened, e.g. "Aug 19 10:30 PM". */
export function stampedAt(at: Date): string {
  return stamp.format(at).replace(",", "");
}

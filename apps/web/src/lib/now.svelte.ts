/** How often the page's idea of "now" advances, which is what ages a relative time on screen. */
const TICK_MS = 30_000;

let current = $state(Date.now());

/** The clock a relative time reads, so it ages where a rendered timestamp would sit still. */
export const now = {
  get ms() {
    return current;
  },
};

/** Advances `now` until the teardown runs. Called once, by the root layout. */
export function startClock(): () => void {
  const tick = setInterval(() => (current = Date.now()), TICK_MS);
  return () => clearInterval(tick);
}

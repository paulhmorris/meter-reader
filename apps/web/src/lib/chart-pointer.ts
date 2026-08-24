/**
 * The browser spends the first pixels of a touch deciding between scrolling the page and leaving
 * the gesture alone, so a scrub that sets off upward is taken away as a scroll. Claiming the
 * gesture ourselves — on a sideways move, or on a finger that has settled on the chart — lets it
 * wander in any direction from there, while a swipe that starts as one still scrolls the page.
 */
export function scrub(node: HTMLElement) {
  const SETTLED_MS = 300;
  const SLOP_PX = 4;

  let from: { x: number; y: number } | null = null;
  let claimed = false;
  let settling: ReturnType<typeof setTimeout> | undefined;

  function release() {
    from = null;
    claimed = false;
    clearTimeout(settling);
  }

  function start(event: TouchEvent) {
    release();
    if (event.touches.length !== 1) return;
    from = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    settling = setTimeout(() => (claimed = true), SETTLED_MS);
  }

  function move(event: TouchEvent) {
    if (!from || event.touches.length !== 1) return;

    if (!claimed) {
      const dx = Math.abs(event.touches[0].clientX - from.x);
      const dy = Math.abs(event.touches[0].clientY - from.y);
      if (dx > SLOP_PX && dx > dy) {
        claimed = true;
        clearTimeout(settling);
      } else if (dy > SLOP_PX) {
        release();
        return;
      } else {
        return;
      }
    }

    event.preventDefault();
  }

  node.addEventListener("touchstart", start, { passive: true });
  node.addEventListener("touchmove", move, { passive: false });
  node.addEventListener("touchend", release);
  node.addEventListener("touchcancel", release);

  return () => {
    release();
    node.removeEventListener("touchstart", start);
    node.removeEventListener("touchmove", move);
    node.removeEventListener("touchend", release);
    node.removeEventListener("touchcancel", release);
  };
}

/**
 * Layerchart flips the tooltip to the pointer's other side rather than clamping it, so on a
 * chart narrower than twice the tooltip it lands off the screen and reads as no tooltip at all.
 * Placing it ourselves keeps it beside the pointer and inside the chart.
 */
export function tooltipX(chart: any, tooltip: HTMLElement | undefined): number {
  const room = chart.containerWidth - (tooltip?.offsetWidth ?? 0);
  return Math.max(0, Math.min(chart.tooltip.x + 12, room));
}

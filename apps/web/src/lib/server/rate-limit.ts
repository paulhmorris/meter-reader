export interface RateLimiter {
  /** Records an attempt by this client and says whether it is allowed to proceed. */
  allow(client: string, now: Date): boolean;
  size(): number;
}

type Window = { attempts: number; startedAt: number };

/** A fixed window per client, held in memory, so it counts only what one process has seen. */
export function createRateLimiter({
  limit,
  windowMs,
}: {
  limit: number;
  windowMs: number;
}): RateLimiter {
  const windows = new Map<string, Window>();
  let sweptAt = 0;

  // Once a window, not once an attempt, so a flood of guesses does not also pay for the sweep.
  function sweep(now: number): void {
    if (now - sweptAt < windowMs) return;
    sweptAt = now;

    for (const [client, window] of windows) {
      if (now - window.startedAt >= windowMs) windows.delete(client);
    }
  }

  return {
    allow(client, now) {
      const at = now.getTime();
      sweep(at);

      const window = windows.get(client) ?? { attempts: 0, startedAt: at };
      window.attempts += 1;
      windows.set(client, window);

      return window.attempts <= limit;
    },

    size() {
      return windows.size;
    },
  };
}

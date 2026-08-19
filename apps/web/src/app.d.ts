import type { Grant } from "$lib/server/access.js";

declare global {
  namespace App {
    interface Locals {
      /** The Grant this request carries, or null if it carries none. */
      grant: Grant | null;
    }
  }
}

export {};

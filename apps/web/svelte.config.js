import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

export default {
  preprocess: vitePreprocess(),
  // Registered from the meter page instead, so a device that never asks for leak warnings
  // never gets a service worker.
  kit: { adapter: adapter(), serviceWorker: { register: false } },
};

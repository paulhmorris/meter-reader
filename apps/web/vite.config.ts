import { sentrySvelteKit } from "@sentry/sveltekit";
import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { config } from "dotenv";
import { defineConfig } from "vite";

// Both processes share one .env at the repo root; Prisma reads it from process.env, not $env.
config({ path: "../../.env" });

export default defineConfig({
  plugins: [sentrySvelteKit({ autoUploadSourceMaps: false }), tailwindcss(), sveltekit()],
});

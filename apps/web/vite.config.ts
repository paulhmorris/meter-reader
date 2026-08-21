import { sentrySvelteKit } from "@sentry/sveltekit";
import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { config } from "dotenv";
import { defineConfig } from "vite";

// Both processes share one .env at the repo root; Prisma reads it from process.env, not $env.
config({ path: "../../.env" });

export default defineConfig({
  plugins: [
    // Without SENTRY_AUTH_TOKEN the plugin skips the upload, so a build needs no Sentry account.
    sentrySvelteKit({
      sourceMapsUploadOptions: {
        org: "cosmic-labs",
        project: "meter-reader",
        authToken: process.env.SENTRY_AUTH_TOKEN,
        telemetry: false,
        // The image is built without .git, so nothing can infer the commit.
        release: { name: process.env.SENTRY_RELEASE },
      },
    }),
    tailwindcss(),
    sveltekit(),
  ],
});

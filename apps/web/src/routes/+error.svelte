<script lang="ts">
  import { page } from "$app/state";
  import { Button } from "$lib/components/ui/button/index.js";
  import Droplet from "@lucide/svelte/icons/droplet";

  const MESSAGE: Record<number, string> = {
    400: "That request didn't make sense.",
    403: "This meter isn't yours to see.",
    404: "Nothing found here.",
    500: "Something broke on our end.",
    503: "The service is down for a moment.",
  };

  const message = $derived(MESSAGE[page.status] ?? "Something went wrong.");
</script>

<svelte:head><title>{page.status} · Meter Reader</title></svelte:head>

<div class="mx-auto max-w-sm py-8">
  <div
    class="bg-primary/10 mb-5 flex size-11 items-center justify-center rounded-xl text-primary"
    aria-hidden="true"
  >
    <Droplet class="size-5" />
  </div>

  <h1 class="text-2xl font-semibold tracking-tight">{message}</h1>
  <p class="mt-1.5 text-sm text-muted-foreground">Error {page.status}</p>

  <Button href="/" variant="outline" class="mt-6">Back to the start</Button>
</div>

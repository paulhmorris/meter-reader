<script lang="ts">
  import Droplets from "@lucide/svelte/icons/droplets";
  import { fly } from "svelte/transition";

  type Level = "intermittent" | "continuous" | "unknown";

  let { level, fresh }: { level: Level; fresh: boolean } = $props();

  const CAUSE = {
    continuous: "Water was used in every 15-minute interval for the last 24 hours.",
    intermittent: "Water was used for at least fifty of the last ninety-six 15-minute intervals.",
    unknown: "",
  };
</script>

<div
  role="alert"
  in:fly={{ y: -8, duration: 250 }}
  class="border-danger/40 bg-danger/10 flex gap-3 rounded-lg border p-4"
>
  <Droplets class="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
  <div class="text-sm leading-relaxed">
    <p class="font-semibold">
      This meter {fresh ? "is" : "was, when it was last heard,"} reporting a leak.
    </p>
    {#if CAUSE[level]}
      <p class="mt-1 text-muted-foreground">{CAUSE[level]}</p>
    {/if}
  </div>
</div>

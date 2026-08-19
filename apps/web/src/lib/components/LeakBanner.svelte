<script lang="ts">
  import Droplets from "@lucide/svelte/icons/droplets";
  import { fly } from "svelte/transition";

  type Level = "intermittent" | "continuous" | "unknown";

  let { level, fresh }: { level: Level; fresh: boolean } = $props();

  const CAUSE = {
    continuous:
      "Water ran through it without a break for a whole day. That usually means something is stuck open — a running toilet, a valve that has not closed, or a burst pipe.",
    intermittent:
      "Water ran through it in at least half of the day, in short bursts. That usually means something is dripping or a toilet is refilling on its own.",
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
      This meter {fresh ? "is" : "was, when we last heard it,"} reporting a leak.
    </p>
    {#if CAUSE[level]}
      <p class="mt-1 text-muted-foreground">{CAUSE[level]}</p>
    {/if}
    <p class="mt-1 text-muted-foreground">
      It is worth checking, and worth calling a plumber if you cannot find it.
    </p>
  </div>
</div>

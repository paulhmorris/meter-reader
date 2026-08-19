<script lang="ts">
  interface Event {
    id: string;
    description: string;
    occurredAt: Date;
  }

  let { events, older, at }: { events: Event[]; older: boolean; at: Intl.DateTimeFormat } =
    $props();
</script>

{#if events.length > 0}
  <ol class="relative ml-1.5 border-l border-border">
    {#each events as event (event.id)}
      <li class="relative py-2.5 pl-5">
        <span
          class="absolute -left-[4.5px] top-4 size-2 rounded-full bg-border ring-4 ring-background"
          aria-hidden="true"
        ></span>
        <p class="text-sm">{event.description}</p>
        <p class="text-xs text-muted-foreground">{at.format(event.occurredAt)}</p>
      </li>
    {/each}
  </ol>
  {#if older}
    <p class="mt-2 text-xs text-muted-foreground">
      Older changes than these are kept, but not shown here.
    </p>
  {/if}
{:else}
  <p class="text-sm text-muted-foreground">
    Nothing has changed since we started listening — no leaks, no backwards flow, no days without
    water.
  </p>
{/if}

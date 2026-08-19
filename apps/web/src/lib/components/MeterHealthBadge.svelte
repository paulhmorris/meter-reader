<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import RadioTower from "@lucide/svelte/icons/radio-tower";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";

  type Health = "fresh" | "stale" | "broken";

  let {
    health,
    lastHeardAt,
    short = false,
    class: className,
  }: {
    /** Null is a Meter the receiver has never heard, which leaves nothing to judge. */
    health: Health | null;
    lastHeardAt: Date | null;
    /** The wording a table column has room for, rather than the one a page can spell out. */
    short?: boolean;
    class?: string;
  } = $props();

  const HOUR_MS = 60 * 60 * 1000;

  const at = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
  });

  const unheardForMs = $derived(lastHeardAt ? Date.now() - lastHeardAt.getTime() : Infinity);
  /** Live is the last hour, not the whole day Stale allows: a meter reports every 15 minutes. */
  const live = $derived(unheardForMs < HOUR_MS);

  const UNHEARD = {
    stale: { long: "Unheard for over a day", short: "Stale" },
    broken: { long: "Unheard for over three days", short: "Broken" },
  };

  const quiet = $derived.by(() => {
    if (!lastHeardAt) return "";
    if (short) return `${Math.floor(unheardForMs / HOUR_MS)}h ago`;
    return `Last update: ${at.format(lastHeardAt)}`;
  });
</script>

{#if health === null}
  <Badge variant="outline" class="text-muted-foreground {className}">Never heard</Badge>
{:else if health === "fresh" && live}
  <Badge variant="outline" class="border-fresh/40 gap-1.5 text-fresh {className}">
    <RadioTower class="size-3" aria-hidden="true" />
    Live
  </Badge>
{:else if health === "fresh"}
  <Badge variant="outline" class="text-muted-foreground {className}">{quiet}</Badge>
{:else}
  <Badge
    class="gap-1.5 border-transparent {health === 'broken'
      ? 'bg-danger text-danger-foreground'
      : 'bg-warning text-warning-foreground'} {className}"
  >
    <TriangleAlert class="size-3" aria-hidden="true" />
    {short ? UNHEARD[health].short : UNHEARD[health].long}
  </Badge>
{/if}

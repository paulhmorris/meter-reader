<script lang="ts">
  import MeterHealthBadge from "$lib/components/MeterHealthBadge.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Card } from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import ArrowDown from "@lucide/svelte/icons/arrow-down";
  import ArrowUp from "@lucide/svelte/icons/arrow-up";
  import ChevronsUpDown from "@lucide/svelte/icons/chevrons-up-down";
  import type { PageData } from "./$types.js";

  let { data }: { data: PageData } = $props();

  const heardAt = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
  });

  const LEAK = {
    intermittent: "Leak · bursts",
    continuous: "Leak · nonstop",
    unknown: "Leak",
  };

  type Meter = PageData["meters"][number];
  type Column = "id" | "lastHeardAt" | "health";

  /** Worst last, so sorting descending brings the Meters that need the Admin to the top. */
  const HEALTH_ORDER = { fresh: 0, stale: 1, broken: 2, unheard: 3 };

  const RANK: Record<Column, (meter: Meter) => number | string> = {
    id: (meter) => Number(meter.id),
    lastHeardAt: (meter) => meter.lastHeardAt?.getTime() ?? 0,
    health: (meter) => HEALTH_ORDER[meter.health ?? "unheard"],
  };

  const HEADINGS: { column: Column; label: string; align?: string }[] = [
    { column: "id", label: "Meter" },
    { column: "lastHeardAt", label: "Last heard" },
    { column: "health", label: "Health" },
  ];

  let sort = $state<{ column: Column; descending: boolean }>({
    column: "health",
    descending: true,
  });

  const sorted = $derived.by(() => {
    const rank = RANK[sort.column];
    const direction = sort.descending ? -1 : 1;

    return [...data.meters].sort((a, b) => {
      if (rank(a) !== rank(b)) return rank(a) > rank(b) ? direction : -direction;
      return Number(a.id) - Number(b.id);
    });
  });

  function sortBy(column: Column) {
    sort = { column, descending: sort.column === column ? !sort.descending : true };
  }
</script>

<svelte:head><title>Admin — meters</title></svelte:head>

<div class="space-y-6">
  <header>
    <h1 class="text-lg font-semibold tracking-tight">Meters</h1>
    <p class="mt-1 text-sm text-muted-foreground">Every meter the receiver has heard of.</p>
  </header>

  {#if data.meters.length > 0}
    <Card class="overflow-hidden p-0">
      <Table.Root>
        <Table.Header>
          <Table.Row class="hover:bg-transparent">
            {#each HEADINGS as { column, label } (column)}
              {@const chosen = sort.column === column}
              <Table.Head
                class="px-3"
                aria-sort={chosen ? (sort.descending ? "descending" : "ascending") : "none"}
              >
                <button
                  type="button"
                  onclick={() => sortBy(column)}
                  class="-ml-1.5 flex items-center gap-1 rounded-md px-1.5 py-1 hover:text-foreground {chosen
                    ? ''
                    : 'text-muted-foreground'}"
                >
                  {label}
                  {#if !chosen}
                    <ChevronsUpDown class="size-3 opacity-60" aria-hidden="true" />
                  {:else if sort.descending}
                    <ArrowDown class="size-3" aria-hidden="true" />
                  {:else}
                    <ArrowUp class="size-3" aria-hidden="true" />
                  {/if}
                </button>
              </Table.Head>
            {/each}
          </Table.Row>
        </Table.Header>

        <Table.Body>
          {#each sorted as meter (meter.id)}
            <Table.Row class="last:border-0">
              <Table.Cell class="px-3 py-3 font-medium tabular-nums">
                <a class="hover:underline" href="/admin/meter/{meter.id}">{meter.id}</a>
              </Table.Cell>
              <Table.Cell class="px-3 py-3 text-muted-foreground">
                {meter.lastHeardAt ? heardAt.format(meter.lastHeardAt) : "—"}
              </Table.Cell>
              <Table.Cell class="px-3 py-3">
                <div class="flex flex-col items-start gap-1">
                  <MeterHealthBadge health={meter.health} lastHeardAt={meter.lastHeardAt} short />
                  {#if meter.activeLeak && meter.activeLeak !== "none"}
                    <Badge class="border-transparent bg-danger text-danger-foreground">
                      {LEAK[meter.activeLeak]}
                    </Badge>
                  {/if}
                </div>
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </Card>
  {:else}
    <p class="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
      The receiver has not heard a meter yet.
    </p>
  {/if}
</div>

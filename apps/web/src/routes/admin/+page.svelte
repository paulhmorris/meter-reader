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

  const decimal = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

  const LEAK = {
    intermittent: "Leak · bursts",
    continuous: "Leak · nonstop",
    unknown: "Leak",
  };

  type Meter = PageData["meters"][number];
  type Column =
    | "id"
    | "address"
    | "lastHeardAt"
    | "health"
    | "rssi"
    | "readings"
    | "usage"
    | "consumption"
    | "leakHistory"
    | "flags"
    | "devices";

  /** Worst last, so sorting descending brings the Meters that need the Admin to the top. */
  const HEALTH_ORDER = { fresh: 0, stale: 1, broken: 2, unheard: 3 };

  /** A Meter with no level heard sorts below the weakest one that was, rather than above it. */
  const UNHEARD_LEVEL = -Infinity;

  const RANK: Record<Column, (meter: Meter) => number | string> = {
    id: (meter) => Number(meter.id),
    /** Unwritten sorts last however the column is turned, rather than leading the written ones. */
    address: (meter) => meter.address ?? "\uffff",
    lastHeardAt: (meter) => meter.lastHeardAt?.getTime() ?? 0,
    health: (meter) => HEALTH_ORDER[meter.health ?? "unheard"],
    rssi: (meter) => meter.rssi ?? UNHEARD_LEVEL,
    readings: (meter) => meter.readings,
    usage: (meter) => meter.usage ?? -1,
    consumption: (meter) => meter.consumption ?? -1,
    leakHistory: (meter) => meter.leakHistoryBucket,
    flags: (meter) => (meter.backflow ? 2 : 0) + (meter.noUse ? 1 : 0),
    devices: (meter) => meter.devices,
  };

  const HEADINGS: { column: Column; label: string; hint?: string; numeric?: boolean }[] = [
    { column: "id", label: "Meter" },
    { column: "address", label: "Address" },
    { column: "health", label: "Health" },
    { column: "lastHeardAt", label: "Last heard" },
    { column: "rssi", label: "Signal" },
    { column: "readings", label: "Readings", hint: "24h", numeric: true },
    { column: "usage", label: "Usage", hint: "24h, gal", numeric: true },
    { column: "consumption", label: "Total", hint: "gal", numeric: true },
    { column: "leakHistory", label: "Leak history" },
    { column: "flags", label: "Flags" },
    { column: "devices", label: "Devices", numeric: true },
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
    <Card>
      <Table.Root>
        <Table.Header>
          <Table.Row class="hover:bg-transparent">
            {#each HEADINGS as { column, label, hint, numeric } (column)}
              {@const chosen = sort.column === column}
              <Table.Head
                class="h-auto whitespace-nowrap px-3 py-2"
                aria-sort={chosen ? (sort.descending ? "descending" : "ascending") : "none"}
              >
                <button
                  type="button"
                  onclick={() => sortBy(column)}
                  class="-ml-1.5 flex items-center gap-1 rounded-md px-1.5 py-1 hover:text-foreground {numeric
                    ? '-mr-1.5 ml-auto'
                    : ''} {chosen ? '' : 'text-muted-foreground'}"
                >
                  {label}
                  {#if hint}
                    <span class="text-xs font-normal opacity-70">{hint}</span>
                  {/if}
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
              <Table.Cell class="max-w-52 truncate px-3 py-3" title={meter.address ?? undefined}>
                {#if meter.address}
                  {meter.address}
                {:else}
                  <a class="text-muted-foreground hover:underline" href="/admin/meter/{meter.id}">
                    Add one
                  </a>
                {/if}
              </Table.Cell>
              <Table.Cell class="px-3 py-3">
                <div class="flex flex-col items-start gap-1">
                  <MeterHealthBadge health={meter.health} lastHeardAt={meter.lastHeardAt} short />
                  {#if meter.activeLeak && meter.activeLeak !== "none"}
                    <Badge variant="outline" class="border-danger/40 bg-danger/5 text-danger">
                      {LEAK[meter.activeLeak]}
                    </Badge>
                  {/if}
                </div>
              </Table.Cell>
              <Table.Cell class="whitespace-nowrap px-3 py-3 text-muted-foreground">
                {meter.lastHeardAt ? heardAt.format(meter.lastHeardAt) : "—"}
              </Table.Cell>
              <Table.Cell class="whitespace-nowrap px-3 py-3 tabular-nums">
                {#if meter.rssi === null}
                  <span class="text-muted-foreground" title="The receiver reports no levels">—</span
                  >
                {:else}
                  {decimal.format(meter.rssi)} dBm
                  {#if meter.snr !== null}
                    <span class="block text-xs text-muted-foreground">
                      {decimal.format(meter.snr)} dB SNR
                    </span>
                  {/if}
                {/if}
              </Table.Cell>
              <Table.Cell class="px-3 py-3 text-right tabular-nums">{meter.readings}</Table.Cell>
              <Table.Cell class="px-3 py-3 text-right tabular-nums">
                {meter.usage === null ? "—" : decimal.format(meter.usage)}
              </Table.Cell>
              <Table.Cell class="px-3 py-3 text-right tabular-nums text-muted-foreground">
                {meter.consumption === null ? "—" : decimal.format(meter.consumption)}
              </Table.Cell>
              <Table.Cell class="whitespace-nowrap px-3 py-3 text-muted-foreground">
                {meter.leakHistory ?? "—"}
              </Table.Cell>
              <Table.Cell class="px-3 py-3">
                {#if meter.backflow || meter.noUse}
                  <div class="flex flex-col items-start gap-1">
                    {#if meter.backflow}
                      <Badge variant="outline" class="border-warning/40 bg-warning/5 text-warning">
                        Backflow
                      </Badge>
                    {/if}
                    {#if meter.noUse}
                      <Badge variant="outline" class="text-muted-foreground">No use</Badge>
                    {/if}
                  </div>
                {:else}
                  <span class="text-muted-foreground">—</span>
                {/if}
              </Table.Cell>
              <Table.Cell class="px-3 py-3 text-right tabular-nums">{meter.devices}</Table.Cell>
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

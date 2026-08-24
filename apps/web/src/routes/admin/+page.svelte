<script lang="ts">
  import { stampedAt } from "$lib/admin-format.js";
  import MeterHealthBadge from "$lib/components/MeterHealthBadge.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Card } from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import ArrowDown from "@lucide/svelte/icons/arrow-down";
  import ArrowUp from "@lucide/svelte/icons/arrow-up";
  import ChevronsUpDown from "@lucide/svelte/icons/chevrons-up-down";
  import type { PageData } from "./$types.js";

  let { data }: { data: PageData } = $props();

  const decimal = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

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
    { column: "usage", label: "Usage", hint: "today, gal", numeric: true },
    { column: "consumption", label: "Total", hint: "gal", numeric: true },
    { column: "leakHistory", label: "Leak history" },
    { column: "flags", label: "Flags" },
    { column: "devices", label: "Devices", numeric: true },
  ];

  /** How the table stands until the Admin sorts it: named first, heard most recently, heard best. */
  function byDefault(a: Meter, b: Meter): number {
    const named = Number(b.address !== null) - Number(a.address !== null);
    if (named !== 0) return named;

    const heard = (b.lastHeardAt?.getTime() ?? 0) - (a.lastHeardAt?.getTime() ?? 0);
    if (heard !== 0) return heard;

    const [aLevel, bLevel] = [a.rssi ?? UNHEARD_LEVEL, b.rssi ?? UNHEARD_LEVEL];
    if (aLevel !== bLevel) return aLevel > bLevel ? -1 : 1;

    return Number(a.id) - Number(b.id);
  }

  let sort = $state<{ column: Column; descending: boolean } | null>(null);

  const inUse = $derived(data.meters.filter((meter) => meter.disabledAt === null));
  const disabled = $derived(
    data.meters.filter((meter) => meter.disabledAt !== null).sort(byDefault),
  );

  const sorted = $derived.by(() => {
    const chosen = sort;
    if (chosen === null) return [...inUse].sort(byDefault);

    const rank = RANK[chosen.column];
    const direction = chosen.descending ? -1 : 1;

    return [...inUse].sort((a, b) => {
      if (rank(a) !== rank(b)) return rank(a) > rank(b) ? direction : -direction;
      return Number(a.id) - Number(b.id);
    });
  });

  function sortBy(column: Column) {
    sort = { column, descending: sort?.column === column ? !sort.descending : true };
  }
</script>

<svelte:head><title>Admin | meters</title></svelte:head>

<div class="space-y-6">
  <header>
    <h1 class="text-lg font-semibold tracking-tight">Meters</h1>
    <p class="mt-1 text-sm text-muted-foreground">Every meter the receiver has heard of.</p>
  </header>

  {#if inUse.length > 0}
    <Card>
      <Table.Root>
        <Table.Header>
          <Table.Row class="hover:bg-transparent">
            {#each HEADINGS as { column, label, hint, numeric } (column)}
              {@const chosen = sort?.column === column}
              <Table.Head
                class="h-auto whitespace-nowrap px-3 py-2"
                aria-sort={chosen ? (sort?.descending ? "descending" : "ascending") : "none"}
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
                  {:else if sort?.descending}
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
              <Table.Cell class="px-3 py-3 font-medium">
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
                  <MeterHealthBadge health={meter.health} lastHeardAt={meter.lastHeardAt} />
                  {#if meter.activeLeak && meter.activeLeak !== "none"}
                    <Badge variant="outline" class="border-danger/40 bg-danger/5 text-danger">
                      {LEAK[meter.activeLeak]}
                    </Badge>
                  {/if}
                </div>
              </Table.Cell>
              <Table.Cell class="whitespace-nowrap px-3 py-3 text-muted-foreground">
                {meter.lastHeardAt ? stampedAt(meter.lastHeardAt) : "—"}
              </Table.Cell>
              <Table.Cell class="whitespace-nowrap px-3 py-3">
                {#if meter.rssi === null}
                  <span class="text-muted-foreground" title="The receiver reports no levels">—</span
                  >
                {:else}
                  {decimal.format(meter.rssi)} dBm
                {/if}
              </Table.Cell>
              <Table.Cell class="px-3 py-3 text-right">{meter.readings}</Table.Cell>
              <Table.Cell class="px-3 py-3 text-right">
                {meter.usage === null ? "—" : decimal.format(meter.usage)}
              </Table.Cell>
              <Table.Cell class="px-3 py-3 text-right text-muted-foreground">
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
              <Table.Cell class="px-3 py-3 text-right">{meter.devices}</Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </Card>
  {:else}
    <p class="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
      {data.meters.length > 0
        ? "Every meter the receiver has heard is disabled."
        : "The receiver has not heard a meter yet."}
    </p>
  {/if}

  {#if disabled.length > 0}
    <section class="space-y-2">
      <h2 class="text-sm font-semibold tracking-tight text-muted-foreground">Disabled</h2>
      <Card class="divide-y divide-border">
        {#each disabled as meter (meter.id)}
          <div class="flex items-baseline gap-3 px-3 py-2.5 text-sm">
            <a class="font-medium hover:underline" href="/admin/meter/{meter.id}">{meter.id}</a>
            <span class="min-w-0 flex-1 truncate text-muted-foreground">
              {meter.address ?? "No address"}
            </span>
            {#if meter.disabledAt}
              <span class="whitespace-nowrap text-xs text-muted-foreground">
                Disabled {stampedAt(meter.disabledAt)}
              </span>
            {/if}
          </div>
        {/each}
      </Card>
    </section>
  {/if}
</div>

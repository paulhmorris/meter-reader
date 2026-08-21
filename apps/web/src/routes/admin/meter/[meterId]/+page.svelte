<script lang="ts">
  import { enhance } from "$app/forms";
  import { stampedAt } from "$lib/admin-format.js";
  import MeterHealthBadge from "$lib/components/MeterHealthBadge.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
  import { Button, buttonVariants } from "$lib/components/ui/button/index.js";
  import { Card, CardHeader, CardTitle } from "$lib/components/ui/card/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import Check from "@lucide/svelte/icons/check";
  import Copy from "@lucide/svelte/icons/copy";
  import type { ActionData, PageData } from "./$types.js";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let confirming = $state(false);
  let copied = $state(false);

  async function copyCode() {
    if (!data.claimCode) return;
    await navigator.clipboard.writeText(data.claimCode.code);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }

  const decimal = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  const LEAK = {
    intermittent: "Leak · bursts",
    continuous: "Leak · nonstop",
    unknown: "Leak",
  };

  /** What the Meter last reported, which is what the badges at the top stand for. */
  const latest = $derived(data.readings[0] ?? null);

  /** What the server keeps of an Address, so the field stops where the stored value would. */
  const ADDRESS_LIMIT = 120;
</script>

<svelte:head><title>Admin — meter {data.meterId}</title></svelte:head>

<div class="space-y-6">
  <header class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-lg font-semibold tracking-tight">Meter {data.meterId}</h1>
      <div class="flex items-center gap-2">
        <MeterHealthBadge health={data.health} lastHeardAt={latest?.receivedAt ?? null} />
        <a href="/meter/{data.meterId}" class={buttonVariants({ variant: "outline", size: "sm" })}>
          Neighbor view
        </a>
      </div>
    </div>
    <a
      href="/admin"
      class="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft class="size-3.5" aria-hidden="true" />
      All meters
    </a>

    {#if latest}
      <div class="flex flex-wrap items-center gap-2">
        {#if latest.activeLeak !== "none"}
          <Badge variant="outline" class="border-danger/40 bg-danger/5 text-danger">
            {LEAK[latest.activeLeak]}
          </Badge>
        {/if}
        {#if latest.rssi !== null}
          <Badge variant="outline" class="text-muted-foreground">
            {decimal.format(latest.rssi)} dBm
          </Badge>
        {/if}
      </div>
    {/if}
  </header>

  <Card>
    <CardHeader>
      <CardTitle>Address</CardTitle>
    </CardHeader>

    <form method="post" action="?/address" use:enhance class="flex items-center gap-2 px-4">
      <Input
        name="address"
        value={data.address ?? ""}
        placeholder="123 Sesame St"
        maxlength={ADDRESS_LIMIT}
        autocomplete="off"
        aria-label="Where this meter is"
        class="h-9 min-w-0 flex-1"
      />
      <Button type="submit" variant="outline">Save</Button>
    </form>
  </Card>

  <Card>
    <CardHeader>
      <CardTitle>Claim code</CardTitle>
    </CardHeader>

    <div class="space-y-3 px-4">
      {#if data.claimCode}
        <div class="flex items-center gap-2">
          <p
            class="min-w-0 flex-1 rounded-lg border border-muted bg-muted p-4 text-center text-lg font-semibold tracking-[0.15em]"
          >
            <code>{data.claimCode.code}</code>
          </p>
          <Button
            variant="outline"
            size="icon"
            aria-label={copied ? "Claim code copied" : "Copy the claim code"}
            onclick={copyCode}
          >
            {#if copied}
              <Check class="size-4" />
            {:else}
              <Copy class="size-4" />
            {/if}
          </Button>
        </div>
        <p class="text-sm text-muted-foreground">
          Issued {stampedAt(data.claimCode.createdAt)} and still claimable.
        </p>
      {:else}
        <p class="text-sm text-muted-foreground">No code is claimable for this meter.</p>
      {/if}

      <!-- The dialog's buttons are portalled out of the form, so they submit it by id. -->
      <form id="issue-code" method="post" action="?/issue" use:enhance></form>

      {#if data.claimCode}
        <AlertDialog.Root bind:open={confirming}>
          <AlertDialog.Trigger class={buttonVariants({ variant: "outline" })}>
            Rotate the code
          </AlertDialog.Trigger>
          <AlertDialog.Content>
            <AlertDialog.Header>
              <AlertDialog.Title>Rotate this meter's claim code?</AlertDialog.Title>
              <AlertDialog.Description>
                The current code stops working straight away, so anyone still waiting to claim with
                it will need the new one. Devices that have already claimed keep their access.
              </AlertDialog.Description>
            </AlertDialog.Header>
            <AlertDialog.Footer>
              <AlertDialog.Cancel>Keep the current code</AlertDialog.Cancel>
              <AlertDialog.Action
                type="submit"
                form="issue-code"
                onclick={() => (confirming = false)}
              >
                Rotate it
              </AlertDialog.Action>
            </AlertDialog.Footer>
          </AlertDialog.Content>
        </AlertDialog.Root>
      {:else}
        <Button type="submit" form="issue-code">Issue a code</Button>
      {/if}
    </div>
  </Card>

  <Card class="overflow-hidden">
    <CardHeader>
      <CardTitle>Devices</CardTitle>
    </CardHeader>

    {#if form?.error}
      <p class="mx-4 text-sm text-danger" role="alert">{form.error}</p>
    {/if}

    {#if data.grants.length > 0}
      <Table.Root>
        <Table.Body>
          {#each data.grants as grant (grant.id)}
            <Table.Row class="border-t last:border-b-0">
              <Table.Cell class="w-full max-w-0 px-4 py-3">
                <p class="truncate" title={grant.device ?? undefined}>
                  {grant.device ?? "A device that did not say what it was"}
                </p>
                <p class="mt-0.5 text-xs text-muted-foreground">
                  Claimed {stampedAt(grant.createdAt)}
                </p>
              </Table.Cell>
              <Table.Cell class="px-4 py-3 text-right">
                <form method="post" action="?/revoke" use:enhance>
                  <input type="hidden" name="grantId" value={grant.id} />
                  <Button type="submit" variant="destructive" size="sm">Revoke</Button>
                </form>
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    {:else}
      <p class="px-4 text-sm text-muted-foreground">No device holds access to this meter.</p>
    {/if}
  </Card>

  <Card class="overflow-hidden">
    <CardHeader>
      <CardTitle>Latest readings</CardTitle>
    </CardHeader>

    {#if data.readings.length > 0}
      <Table.Root>
        <Table.Header>
          <Table.Row class="hover:bg-transparent">
            <Table.Head class="px-4">Heard</Table.Head>
            <Table.Head class="px-4 text-right">Usage</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each data.readings as reading (reading.id)}
            <Table.Row>
              <Table.Cell class="px-4 py-2.5 text-muted-foreground">
                {stampedAt(reading.receivedAt)}
              </Table.Cell>
              <Table.Cell class="px-4 py-2.5 text-right">
                {reading.usage === null ? "—" : decimal.format(reading.usage)}
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    {:else}
      <p class="px-4 text-sm text-muted-foreground">The receiver has not heard this meter yet.</p>
    {/if}
  </Card>
</div>

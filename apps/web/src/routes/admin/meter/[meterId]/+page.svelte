<script lang="ts">
  import { enhance } from "$app/forms";
  import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
  import { Button, buttonVariants } from "$lib/components/ui/button/index.js";
  import { Card, CardHeader, CardTitle } from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import type { ActionData, PageData } from "./$types.js";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let confirming = $state(false);

  const at = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Chicago",
  });
</script>

<svelte:head><title>Admin — meter {data.meterId}</title></svelte:head>

<div class="space-y-6">
  <header class="space-y-3">
    <a
      href="/admin"
      class="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft class="size-3.5" aria-hidden="true" />
      All meters
    </a>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-lg font-semibold tabular-nums tracking-tight">Meter {data.meterId}</h1>
      <a href="/meter/{data.meterId}" class={buttonVariants({ variant: "outline", size: "sm" })}>
        See it as a neighbour does
      </a>
    </div>
  </header>

  <Card>
    <CardHeader>
      <CardTitle>Claim code</CardTitle>
    </CardHeader>

    <div class="space-y-3 px-4">
      {#if form?.issued}
        <p
          class="border-primary/40 bg-primary/10 rounded-lg border p-4 text-center text-xl font-semibold tabular-nums tracking-[0.15em]"
        >
          <code>{form.issued}</code>
        </p>
        <p class="text-xs leading-relaxed text-muted-foreground">
          Hand this over now — it is shown this once. If it is lost, issue another; the old one
          stops working and every device already claimed keeps working.
        </p>
      {:else if data.claimCode}
        <p class="text-sm text-muted-foreground">
          Issued {at.format(data.claimCode.createdAt)} and still claimable.
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
                  Claimed {at.format(grant.createdAt)}
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
</div>

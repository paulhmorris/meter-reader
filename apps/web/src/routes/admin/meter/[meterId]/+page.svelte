<script lang="ts">
  import { enhance } from "$app/forms";
  import type { ActionData, PageData } from "./$types.js";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const at = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Chicago",
  });
</script>

<svelte:head><title>Admin — meter {data.meterId}</title></svelte:head>

<p><a href="/admin">All meters</a></p>
<h1>Meter {data.meterId}</h1>
<p><a href="/meter/{data.meterId}">See this meter as a neighbour does</a></p>

<h2>Claim code</h2>
{#if form?.issued}
  <p class="issued">
    <code>{form.issued}</code>
  </p>
  <p class="muted">
    Hand this over now — it is shown this once. If it is lost, issue another; the old one stops
    working and every device already claimed keeps working.
  </p>
{:else if data.claimCode}
  <p class="muted">Issued {at.format(data.claimCode.createdAt)} and still claimable.</p>
{:else}
  <p class="muted">No code is claimable for this meter.</p>
{/if}

<form method="post" action="?/issue" use:enhance>
  <button type="submit">{data.claimCode ? "Rotate the code" : "Issue a code"}</button>
</form>

<h2>Devices</h2>
{#if form?.error}
  <p class="error" role="alert">{form.error}</p>
{/if}

{#if data.grants.length > 0}
  <ul class="grants">
    {#each data.grants as grant (grant.id)}
      <li>
        <span>{grant.device ?? "A device that did not say what it was"}</span>
        <span class="muted">Claimed {at.format(grant.createdAt)}</span>
        <form method="post" action="?/revoke" use:enhance>
          <input type="hidden" name="grantId" value={grant.id} />
          <button type="submit">Revoke</button>
        </form>
      </li>
    {/each}
  </ul>
{:else}
  <p class="muted">No device holds access to this meter.</p>
{/if}

<style>
  .issued code {
    font-size: 1.25rem;
    letter-spacing: 0.1em;
  }

  .grants {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .grants li {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    align-items: flex-start;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border);
    font-size: 0.875rem;
  }

  .muted {
    font-size: 0.75rem;
  }

  .error {
    color: var(--danger);
  }
</style>

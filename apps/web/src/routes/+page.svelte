<script lang="ts">
  import { enhance } from "$app/forms";
  import type { ActionData } from "./$types.js";

  let { form }: { form: ActionData } = $props();
</script>

<svelte:head><title>Meter Reader</title></svelte:head>

<h1>Meter Reader</h1>
<p>Enter the code you were given to see your water meter.</p>

<form method="post" use:enhance>
  <label for="code">Claim code</label>
  <input
    id="code"
    name="code"
    autocomplete="off"
    autocapitalize="characters"
    spellcheck="false"
    required
    aria-invalid={form?.error ? "true" : undefined}
  />
  <button type="submit">View my meter</button>
</form>

{#if form?.error}
  <p class="error" role="alert">{form.error}</p>
{/if}

<style>
  form {
    display: grid;
    gap: 0.5rem;
  }

  input {
    font-size: 1.25rem;
    padding: 0.5rem;
    letter-spacing: 0.1em;
  }

  button {
    font-size: 1rem;
    padding: 0.5rem;
  }

  .error {
    color: #b00020;
  }
</style>

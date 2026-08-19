<script lang="ts">
  import { enhance } from "$app/forms";
  import type { ActionData } from "./$types.js";

  let { form }: { form: ActionData } = $props();
</script>

<svelte:head><title>Admin</title></svelte:head>

<h1>Admin</h1>

<form method="post" use:enhance>
  <label for="password">Password</label>
  <input
    id="password"
    name="password"
    type="password"
    autocomplete="current-password"
    required
    aria-invalid={form?.error ? "true" : undefined}
  />
  <button type="submit">Sign in</button>
</form>

{#if form?.error}
  <p class="error" role="alert">{form.error}</p>
{/if}

<style>
  form {
    display: grid;
    gap: 0.5rem;
  }

  input,
  button {
    font-size: 1rem;
    padding: 0.5rem;
  }

  .error {
    color: var(--broken);
  }
</style>

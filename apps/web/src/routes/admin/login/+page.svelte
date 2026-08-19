<script lang="ts">
  import { enhance } from "$app/forms";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Card } from "$lib/components/ui/card/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import KeyRound from "@lucide/svelte/icons/key-round";
  import type { ActionData } from "./$types.js";

  let { form }: { form: ActionData } = $props();
</script>

<svelte:head><title>Admin</title></svelte:head>

<div class="mx-auto max-w-sm py-8">
  <div
    class="bg-primary/10 mb-5 flex size-11 items-center justify-center rounded-xl text-primary"
    aria-hidden="true"
  >
    <KeyRound class="size-5" />
  </div>

  <h1 class="text-2xl font-semibold tracking-tight">Admin</h1>
  <p class="mt-1.5 text-sm text-muted-foreground">
    Sign in to see every meter the receiver has heard of.
  </p>

  <Card class="mt-6 p-5">
    <form method="post" use:enhance class="grid gap-3">
      <div class="grid gap-2">
        <Label for="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autocomplete="current-password"
          required
          aria-invalid={form?.error ? "true" : undefined}
        />
      </div>
      <Button type="submit">Sign in</Button>
    </form>

    {#if form?.error}
      <p class="text-sm text-danger" role="alert">{form.error}</p>
    {/if}
  </Card>
</div>

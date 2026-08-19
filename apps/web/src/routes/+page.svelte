<script lang="ts">
  import { enhance } from "$app/forms";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Card } from "$lib/components/ui/card/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import Droplet from "@lucide/svelte/icons/droplet";
  import type { ActionData } from "./$types.js";

  let { form }: { form: ActionData } = $props();
</script>

<svelte:head><title>Meter Reader</title></svelte:head>

<div class="mx-auto max-w-sm py-8">
  <div
    class="bg-primary/10 mb-5 flex size-11 items-center justify-center rounded-xl text-primary"
    aria-hidden="true"
  >
    <Droplet class="size-5" />
  </div>

  <h1 class="text-2xl font-semibold tracking-tight">Meter Reader</h1>
  <p class="mt-1.5 text-sm text-muted-foreground">
    Enter the code you were given to see your water meter.
  </p>

  <Card class="mt-6 p-5">
    <form method="post" use:enhance class="grid gap-3">
      <div class="grid gap-2">
        <Label for="code">Claim code</Label>
        <Input
          id="code"
          name="code"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          required
          class="text-lg tracking-[0.15em]"
          aria-invalid={form?.error ? "true" : undefined}
        />
      </div>
      <Button type="submit">View my meter</Button>
    </form>

    {#if form?.error}
      <p class="text-sm text-danger" role="alert">{form.error}</p>
    {/if}
  </Card>
</div>

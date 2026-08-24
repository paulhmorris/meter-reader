<script lang="ts">
  import { Card } from "$lib/components/ui/card/index.js";
  import { animate } from "motion";

  let {
    label,
    gallons: total,
    hint = null,
  }: { label: string; gallons: number; hint?: string | null } = $props();

  const gallons = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  /** Counts from zero to the figure on mount, then tracks it plainly if the data changes. */
  function countUp(node: HTMLElement, value: number) {
    let shown = 0;
    const render = (n: number) => (node.textContent = gallons.format(n));

    const run = (to: number) => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return render(to);
      animate(shown, to, {
        duration: 0.6,
        ease: [0.16, 1, 0.3, 1],
        onUpdate: (n) => render((shown = n)),
      });
    };

    run(value);
    return { update: run };
  }
</script>

<Card class="gap-0 p-3.5">
  <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
  <p class="mt-0.5 flex items-baseline gap-1.5">
    <span class="text-3xl font-semibold" use:countUp={total}>
      {gallons.format(total)}
    </span>
    <span class="text-sm text-muted-foreground">gal</span>
  </p>
  {#if hint}
    <p class="mt-0.5 text-xs text-muted-foreground">{hint}</p>
  {/if}
</Card>

<script lang="ts">
  import { Card } from "$lib/components/ui/card/index.js";
  import { animate } from "motion";

  interface Stat {
    label: string;
    gallons: number;
    hint?: string;
  }

  let { hero, secondary }: { hero: Stat; secondary: Stat } = $props();

  const gallons = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

  /** Counts from zero to the figure on mount, then tracks it plainly if the data changes. */
  function countUp(node: HTMLElement, value: number) {
    let shown = 0;
    const render = (n: number) => (node.textContent = gallons.format(n));

    const run = (to: number) => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return render(to);
      animate(shown, to, {
        duration: 0.7,
        ease: [0.16, 1, 0.3, 1],
        onUpdate: (n) => render((shown = n)),
      });
    };

    run(value);
    return { update: run };
  }
</script>

<Card class="flex flex-row items-stretch gap-0 overflow-hidden p-0">
  <div class="flex-1 p-5">
    <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{hero.label}</p>
    <p class="mt-1 flex items-baseline gap-1.5">
      <span class="text-4xl font-semibold tabular-nums" use:countUp={hero.gallons}>
        {gallons.format(hero.gallons)}
      </span>
      <span class="text-sm text-muted-foreground">gal</span>
    </p>
    {#if hero.hint}
      <p class="mt-1 text-xs text-muted-foreground">{hero.hint}</p>
    {/if}
  </div>

  <div class="w-px bg-border" aria-hidden="true"></div>

  <div class="flex-1 p-5">
    <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {secondary.label}
    </p>
    <p class="mt-1 flex items-baseline gap-1.5">
      <span class="text-2xl font-medium tabular-nums">{gallons.format(secondary.gallons)}</span>
      <span class="text-sm text-muted-foreground">gal</span>
    </p>
    {#if secondary.hint}
      <p class="mt-1 text-xs text-muted-foreground">{secondary.hint}</p>
    {/if}
  </div>
</Card>

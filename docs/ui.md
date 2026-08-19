# UI

How the neighbour and Admin surfaces are built, and what a change to them has to keep.

## Decisions

Settled with the repo owner. Do not relitigate them without asking.

| Decision | Choice |
| --- | --- |
| Surfaces | Claim landing, meter page, Admin list, Admin meter |
| JavaScript | **Required.** The surfaces do not work with JS off. Deliberate; the owner declined an ADR for it |
| CSS | Tailwind v4, CSS-first. Every token lives in `apps/web/src/app.css` |
| Components | shadcn-svelte, primitives in `$lib/components/ui` |
| Palette | Warm: a paper-white background, warm greys, and a clay accent. Anthropic's, roughly |
| Icons | `@lucide/svelte`. One icon set, no mixing |
| Charts | LayerChart, because shadcn-svelte's own chart component wraps it |
| Dark mode | Follows `prefers-color-scheme`. No toggle. The `dark:` variant is redefined to the media query in `app.css` |
| Motion | motion.dev, rich: bar transitions, hero count-up, banner entrance. Honour `prefers-reduced-motion` |
| Chart state | Preset and drill-down in the URL; the transient brush in component state |
| Ranges | Presets (Today / 7d / 30d / 12mo) plus brush-to-zoom. No free-form date picker |
| Data transport | SvelteKit remote functions, falling back to a JSON endpoint if they misbehave |
| Loading | Dim the previous chart rather than swapping in a skeleton. Empty windows are plain text |
| Tests | Unit tests, server-side only. No component or browser tests |

### Chart colour language

Four marks have to stay distinguishable in both themes, and the tokens for them are in `app.css`:

- **Usage** — `--chart-usage`, an ochre that carries the warm palette without reaching the red a
  leak is drawn in
- **An Active Leak overlapping the period** — `--chart-leak`, tinting the whole bar
- **Partial** — a hatch drawn over whichever tone is beneath. It stays on the bar rather than
  moving into the tooltip, because ADR-0002 is a promise about what the reader can see
- **The comparison overlay** — `--chart-ghost`, ghost bars behind the real ones, off by default

## Conventions

- **The chart's state is split on purpose.** The preset and the drill-down are in the URL, so they
  survive a reload and a share; the brush is component state, because it is a gesture. Brushing
  filters the data rather than using LayerChart's `zoomOnBrush`, which narrows its own scale and
  leaves the `Bars` layers drawing at `NaN`.
- **A tap and a drag are the same gesture to `BrushContext`.** It swallows pointer events over the
  plot, so drilling in hangs off `onBrushEnd` with an inactive brush, on the period the tooltip
  last sat over. The sr-only table carries the same links for anyone not using a pointer.
- **Weeks and months take the *daily* Partial tolerance of an hour**, because their boundaries are
  Chicago midnights and every tier a prune leaves behind keeps the last Reading of its bucket —
  one an hour to 60 days, one a Chicago day to a year — which lands a Heartbeat before a
  midnight. Past a year only one Reading a Monday week survives, which a week boundary is and
  the first of a month is not, so months that old read Partial, which is what they are.
- **The Admin table says less than the meter page does.** `MeterHealthBadge` takes `short`, and the
  Admin list uses it, because a column has room for "Stale" and not for the sentence a neighbour
  reading one meter gets.
- **A dialog's buttons are portalled out of any form they sit in.** The Claim Code confirmation
  submits by `form="issue-code"` id rather than by containment.

- **`apps/web/tailwind.sort.config.js` is not a build config.** Tailwind v4 is configured in
  `app.css`. That file exists only because oxfmt's class sorter reads a v3-shaped config;
  without it every token-based utility sorts as an unknown class. Add new tokens to both.
- **oxfmt formats `.svelte` files** (`svelte: true`) and sorts Tailwind classes, including
  inside `cn`, `cva` and `tv`.
- **shadcn-svelte needs the type helpers in `$lib/utils.ts`** (`WithElementRef` and friends).
  A hand-written `utils.ts` holding only `cn` fails `svelte-check` on every vendored component.

## Seeing your work

There is no browser on this machine and Playwright's `install-deps` does not support Debian
trixie, so a scratchpad rig unpacks the shared libraries and fontconfig without root and runs
Chromium against them. Recreate it when the scratchpad is gone:

```sh
npm i playwright && npx playwright install chromium --only-shell
apt-get download libnspr4 libnss3 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libxkbcommon0 libpango-1.0-0 \
  libcairo2 libasound2t64 libatspi2.0-0t64 libdrm2 libxrender1 libxi6 \
  fontconfig fontconfig-config libfontconfig1 fonts-dejavu-core
for d in *.deb; do dpkg-deb -x "$d" libs; done
# then LD_LIBRARY_PATH=$PWD/libs/usr/lib/x86_64-linux-gnu and a FONTCONFIG_FILE
# pointing at a fonts.conf whose <dir> is $PWD/libs/usr/share/fonts
```

**Look at the screenshots.** Every fault in the commit "Fix what the redesigned meter page got
wrong" — a page that scrolled sideways, a hero reading 0 gallons above a chart showing water,
an axis drawn around an empty window — passed `check`, `lint` and the full test suite.

`npm run db:seed` seeds 400 days: quarter-hourly water use throughout, but only the Readings a
prune would have spared, plus a day-long gap and a leak window. It seeds one Meter, so an Admin
list worth looking at wants a few more rows inserted by hand. Storing anything other than a
bucket's *last* Reading is what an earlier seed got wrong, and it painted every month in the
12-month view Partial — a fault in the seed that looked exactly like a fault in the rule.

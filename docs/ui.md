# UI redesign

The plan the neighbour and Admin surfaces are being rebuilt to, and where it has got to.
Written for whoever picks this up next; delete it once step 4 lands.

## Decisions

Settled with the repo owner up front. Do not relitigate them without asking.

| Decision | Choice |
| --- | --- |
| Scope | All four surfaces: claim landing, meter page, Admin list, Admin meter |
| JavaScript | **Required.** The surfaces no longer work with JS off. Deliberate; the owner declined an ADR for it |
| CSS | Tailwind v4, CSS-first. Every token lives in `apps/web/src/app.css` |
| Components | shadcn-svelte (zinc base, sky accent), primitives in `$lib/components/ui` |
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

- **Usage** — `--chart-usage`
- **An Active Leak overlapping the period** — `--chart-leak`, tinting the whole bar
- **Partial** — a hatch drawn over whichever tone is beneath. It stays on the bar rather than
  moving into the tooltip, because ADR-0002 is a promise about what the reader can see
- **The comparison overlay** — `--chart-ghost`, ghost bars behind the real ones, off by default

## Where it has got to

Steps 1 and 2 are committed to `main`.

1. **Foundation.** Tailwind, shadcn-svelte, the token layer, dark mode, oxfmt config.
2. **Neighbour surfaces.** The meter page leads with today's Usage and the seven-day average in
   one card, lifetime Consumption and last-heard demoted to muted text, a Leak Banner above
   everything, both charts drawn by LayerChart, an event timeline, and `Card`-based landing and
   leak-warnings surfaces. Components named after `CONTEXT.md` terms sit in `$lib/components`
   for the Admin surface to share. `$lib/server/leaks.ts` derives which periods overlapped an
   Active Leak from the Meter Events already recorded.

### 3. Presets, brush and drill-down — not started

- `Granularity` in `periods.ts` gains `week` and `month`; `usage.ts` needs a `STALE_AFTER_MS`
  entry for each. **Reason the Partial rule through against ADR-0003 first**: pruning thins
  Readings to one an hour past a week old, so a month bucket built from thinned Readings is
  still exact at its boundaries and should rarely be Partial. Getting this wrong misleads
  people about leaks, so it wants its own tests before any UI is written.
- Presets, brush-to-zoom (LayerChart's `BarChart` takes a `brush` prop), tap-a-day drill-down.
- `CONTEXT.md`'s **Partial** entry describes period boundaries; amend it to cover the coarser
  periods once they exist.

### 4. Admin surface — not started

Tokens are already inherited. Remaining: a table for the meter list with sortable columns and
health badges, and — the one change worth making on merit — a confirmation dialog before
rotating a Claim Code, which today happens on a single unguarded click.

## Conventions this introduced

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

`npm run db:seed` seeds half a day of Readings, which is not enough to exercise the chart: no
Partial periods, no leak, nothing in the 30-day view. Seed a month with a gap and a leak window
instead when you need to see the colour language work.

<script lang="ts">
  // Every drill, grouped by what you practise (drills-layout), filterable by instrument.
  // A card per drill: its icon in its hue inside a mastery ring, then the modes.
  import { onMount } from "svelte";
  import Play from "lucide-svelte/icons/play";
  import { INSTRUMENTS, type Instrument } from "@repo/music-core";
  import { COACH_MIN_ATTEMPTS } from "@repo/music-core/progress/coach";
  import { INSTRUMENT_LABEL } from "../bench.svelte";
  import { hueForRoute, hueVar } from "../hues";
  import { INSTRUMENT_ICON } from "../components/instrument-icons";
  import { practice } from "../practice.svelte";
  import { settings } from "../runtime";
  import { SectionSpy } from "../section-spy.svelte";
  import { DRILL_GROUPS, rowMastery, withInstrument, type DrillRow } from "./drills-layout";
  import { DRILL_ICON, HUE_ICON } from "./hue-icons";

  /** A second line for mode names that do not explain themselves. */
  const MODE_HINT: Record<string, string> = { "Pocket recall": "from memory" };
  const now = Date.now();
  /** The instruments a drill serves, one icon each (guitar and ukulele share one). */
  const servedIcons = (r: DrillRow) => [...new Set(r.entry.instruments.map((i) => INSTRUMENT_ICON[i]))];

  let filter = $state<Instrument | "all">("all");
  // The strip's instrument, once the saved settings are in (not the default).
  onMount(() => void settings.ready.then(() => (filter = settings.value.activeInstrument)));
  const forFilter = $derived(filter === "all" ? undefined : filter);
  const visible = (r: DrillRow) => filter === "all" || r.entry.instruments.includes(filter);
  const shown = $derived(DRILL_GROUPS.map((g) => ({ ...g, rows: g.rows.filter(visible) })).filter((g) => g.rows.length));
  /** Jump links: one per section (ear training's three groups are one). */
  const jumps = $derived(
    shown.reduce<{ id: string; title: string; count: number }[]>((out, g) => {
      const title = g.section ?? g.title;
      const last = out.at(-1);
      if (last && last.title === title) last.count += g.rows.length;
      else out.push({ id: g.id, title, count: g.rows.length });
      return out;
    }, []),
  );
  // The jump chip for the section on screen lights up as the page scrolls.
  let spy = $state<SectionSpy>();
  $effect(() => {
    const s = new SectionSpy(jumps.map((j) => `g-${j.id}`));
    spy = s;
    return s.watch();
  });
</script>

<div class="flex flex-col gap-6">
  <div class="flex min-w-0 flex-col gap-1.5">
    <span class="text-sm font-medium text-ws-soft" id="drills-for">Show drills for</span>
    <div class="chips -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-labelledby="drills-for">
      {#each ["all", ...INSTRUMENTS] as const as i (i)}
        <button
          type="button"
          class="min-h-11 shrink-0 rounded-full border px-4 text-sm {filter === i
            ? 'border-transparent bg-ws-ink font-semibold text-ws-bg'
            : 'border-ws-line bg-ws-surface hover:bg-ws-raised'}"
          aria-pressed={filter === i}
          onclick={() => (filter = i)}>{i === "all" ? "Everything" : INSTRUMENT_LABEL[i]}</button
        >
      {/each}
    </div>
  </div>

  <!-- Jump chips, pinned under the strip, with the section on screen lit. -->
  <nav
    aria-label="Jump to"
    class="chips sticky top-[var(--ws-strip-h,3.75rem)] z-10 -mx-4 -mt-2 flex gap-1.5 overflow-x-auto border-b border-ws-line bg-ws-bg/95 px-4 py-2 backdrop-blur sm:mx-0 sm:flex-wrap sm:rounded-2xl sm:border sm:px-2"
  >
    {#each jumps as j (j.id)}
      {@const on = spy?.current === `g-${j.id}`}
      <a
        href="#g-{j.id}"
        aria-current={on ? "location" : undefined}
        class="flex min-h-10 shrink-0 items-center rounded-full px-3 text-sm {on ? 'bg-instr-wash font-semibold text-instr-ink' : 'text-ws-soft hover:bg-ws-raised hover:text-ws-ink'}"
        >{j.title} <span class="tnum ml-1">({j.count})</span></a
      >
    {/each}
  </nav>

  {#each shown as g, gi (g.id)}
    {@const opens = g.section && shown[gi - 1]?.section !== g.section}
    <section aria-labelledby="g-{g.id}-title" id="g-{g.id}" class="scroll-mt-[calc(var(--ws-strip-h,3.75rem)+4rem)]">
      {#if opens}<h2 class="mb-3 font-display text-2xl font-semibold">{g.section}</h2>{/if}
      {#if g.section}
        <h3 id="g-{g.id}-title" class="font-display text-lg font-semibold">{g.title}</h3>
      {:else}
        <h2 id="g-{g.id}-title" class="font-display text-2xl font-semibold">{g.title}</h2>
      {/if}
      {#if g.note}<p class="mt-1 max-w-prose text-sm text-ws-soft">{g.note}</p>{/if}
      <ul class="mt-3 grid gap-3 sm:grid-cols-2">
        {#each g.rows as r (r.key)}
          {@const h = hueForRoute(r.entry.route, forFilter)}
          {@const Icon = DRILL_ICON[r.entry.id] ?? HUE_ICON[h]}
          {@const m = rowMastery(r, practice.mastery, now)}
          {@const anywhere = r.entry.instruments.length >= INSTRUMENTS.length}
          <!-- The title's link covers the card; each mode chip is its own link above it. -->
          <li class="card relative flex flex-col gap-2 rounded-2xl border border-ws-line p-3 hover:border-[color:var(--h)]" style:--h={hueVar(h)}>
            <div class="flex items-start gap-3">
              <span class="relative grid size-14 shrink-0 place-items-center" aria-hidden="true">
                {#if r.skillIds.length}
                  <svg viewBox="0 0 36 36" class="absolute inset-0 -rotate-90">
                    <circle cx="18" cy="18" r="16" fill="none" stroke-width="2.5" class="stroke-ws-line" stroke-dasharray={m.value === undefined ? "2 2.2" : undefined} />
                    {#if m.value !== undefined}
                      <circle cx="18" cy="18" r="16" fill="none" stroke-width="3" stroke="var(--h)" stroke-linecap="round" pathLength="100" stroke-dasharray="{Math.max(2, m.value * 100)} 100" />
                    {/if}
                  </svg>
                {/if}
                <span class="tile grid size-10 place-items-center rounded-full"><Icon class="size-5" /></span>
              </span>
              <span class="min-w-0 flex-1">
                <span class="flex items-baseline justify-between gap-2">
                  <a href={withInstrument(r.href, forFilter)} class="font-semibold after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ws-ink">{r.title}</a>
                  {#if m.value !== undefined}
                    <span class="tnum shrink-0 text-sm font-semibold"><span class="sr-only">Mastery </span>{Math.round(m.value * 100)}%</span>
                  {:else if r.skillIds.length}
                    <span class="tnum shrink-0 text-xs text-ws-soft">
                      {#if m.checked}{m.checked} of {COACH_MIN_ATTEMPTS} checked<span class="sr-only">, not measured yet</span>{:else}<span class="sr-only">Not measured yet</span>{/if}
                    </span>
                  {/if}
                </span>
                <span class="line-clamp-2 text-sm text-ws-soft">{r.blurb}</span>
                {#if filter === "all"}
                  <span class="mt-1 flex items-center gap-1.5 text-ws-soft">
                    {#if anywhere}<span class="text-xs">Any instrument</span>{:else}
                      <span class="sr-only">{r.entry.instruments.map((i) => INSTRUMENT_LABEL[i]).join(", ")}</span>
                      {#each servedIcons(r) as I, k (k)}<I class="size-3.5" aria-hidden="true" />{/each}
                    {/if}
                  </span>
                {/if}
              </span>
            </div>
            <!-- The card opens the drill; the modes are a secondary way straight into one of them. -->
            <span class="flex items-end justify-between gap-2">
              {#if r.modes.length}
                <span class="relative flex min-w-0 flex-wrap items-center gap-1">
                  <span class="mr-0.5 text-xs text-ws-soft">Also:</span>
                  {#each r.modes as mo (mo.id)}
                    <a
                      href={withInstrument(mo.href, forFilter)}
                      class="flex min-h-11 flex-col items-start justify-center rounded-full px-2.5 text-xs text-ws-soft underline decoration-ws-line underline-offset-4 hover:bg-ws-raised hover:text-ws-ink"
                      aria-label="{r.title}: {mo.label}"
                      >{mo.label}{#if MODE_HINT[mo.label]}<span class="text-[0.6875rem] no-underline opacity-80">{MODE_HINT[mo.label]}</span>{/if}</a
                    >
                  {/each}
                </span>
              {:else}<span></span>{/if}
              <span class="pointer-events-none grid size-9 shrink-0 place-items-center rounded-full bg-[color:var(--h)] text-ws-stage" aria-hidden="true"><Play class="size-4" /></span>
            </span>
          </li>
        {/each}
      </ul>
    </section>
  {/each}
</div>

<style>
  /* A wash of the drill's hue, so a group reads by colour at a glance. */
  .card {
    background: linear-gradient(
      135deg,
      color-mix(in oklch, var(--h) 12%, var(--ws-surface)),
      var(--ws-surface) 55%
    );
  }
  /* Chip rows that scroll sideways on a phone fade at the right edge, so a cut chip reads as more. */
  @media (width < 40rem) {
    .chips {
      mask-image: linear-gradient(to right, black calc(100% - 2rem), transparent);
    }
  }
  .tile {
    background: color-mix(in oklch, var(--h) 22%, transparent);
    color: color-mix(in oklch, var(--h), black 42%);
  }
  :global(.dark) .tile {
    color: var(--h);
  }
</style>

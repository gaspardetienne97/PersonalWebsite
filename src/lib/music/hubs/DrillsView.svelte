<script lang="ts">
  // Every drill, grouped by what you practise (drills-layout), filterable by instrument.
  // A card per drill: its icon in its hue inside a mastery ring, then the modes.
  import { onMount } from "svelte";
  import EarIcon from "lucide-svelte/icons/ear";
  import FileMusicIcon from "lucide-svelte/icons/file-music";
  import ActivityIcon from "lucide-svelte/icons/activity";
  import SparklesIcon from "lucide-svelte/icons/sparkles";
  import { INSTRUMENTS, type Instrument } from "@repo/music-core";
  import { COACH_MIN_ATTEMPTS } from "@repo/music-core/progress/coach";
  import { INSTRUMENT_LABEL, type Hue } from "../bench.svelte";
  import { hueForRoute, hueVar } from "../hues";
  import { INSTRUMENT_ICON } from "../components/instrument-icons";
  import { practice } from "../practice.svelte";
  import { settings } from "../runtime";
  import { DRILL_GROUPS, rowMastery, withInstrument, type DrillRow } from "./drills-layout";

  const HUE_ICON: Record<Hue, typeof EarIcon> = {
    ...INSTRUMENT_ICON,
    ear: EarIcon,
    reading: FileMusicIcon,
    rhythm: ActivityIcon,
    create: SparklesIcon,
  };
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
</script>

<div class="flex flex-col gap-6">
  <div class="flex flex-wrap gap-1.5" role="group" aria-label="Show drills for">
    {#each ["all", ...INSTRUMENTS] as const as i (i)}
      <button
        type="button"
        class="min-h-11 rounded-full border px-4 text-sm {filter === i
          ? 'border-transparent bg-ws-ink font-semibold text-ws-bg'
          : 'border-ws-line bg-ws-surface hover:bg-ws-raised'}"
        aria-pressed={filter === i}
        onclick={() => (filter = i)}>{i === "all" ? "Everything" : INSTRUMENT_LABEL[i]}</button
      >
    {/each}
  </div>

  <nav aria-label="Jump to" class="-mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
    {#each jumps as j (j.id)}
      <a href="#g-{j.id}" class="text-ws-soft underline-offset-4 hover:text-ws-ink hover:underline">{j.title} <span class="tnum">({j.count})</span></a>
    {/each}
  </nav>

  {#each shown as g, gi (g.id)}
    {@const opens = g.section && shown[gi - 1]?.section !== g.section}
    <section aria-labelledby="g-{g.id}-title" id="g-{g.id}" class="scroll-mt-24">
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
          {@const Icon = HUE_ICON[h]}
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
                  <a href={withInstrument(r.href, forFilter)} class="font-semibold after:absolute after:inset-0 after:rounded-2xl">{r.title}</a>
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
            {#if r.modes.length}
              <span class="relative flex flex-wrap gap-1.5">
                {#each r.modes as mo (mo.id)}
                  <a href={withInstrument(mo.href, forFilter)} class="flex min-h-11 items-center rounded-full border border-ws-line bg-ws-surface px-3 text-xs hover:border-[color:var(--h)] hover:bg-ws-raised" aria-label="{r.title}: {mo.label}">{mo.label}</a>
                {/each}
              </span>
            {/if}
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
  .tile {
    background: color-mix(in oklch, var(--h) 22%, transparent);
    color: color-mix(in oklch, var(--h), black 42%);
  }
  :global(.dark) .tile {
    color: var(--h);
  }
</style>

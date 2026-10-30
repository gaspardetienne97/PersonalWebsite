<script lang="ts">
  // Every drill, grouped by what you practise (drills-layout), filterable by
  // instrument. Rows, not a card grid: a coloured spine, what you will play, and the modes.
  import { onMount } from "svelte";
  import { INSTRUMENTS, type Instrument } from "@repo/music-core";
  import { INSTRUMENT_LABEL } from "../bench.svelte";
  import { hueForRoute, hueVar } from "../hues";
  import { settings } from "../runtime";
  import { DRILL_GROUPS, withInstrument, type DrillRow } from "./drills-layout";

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
      <ul class="mt-2 divide-y divide-ws-line overflow-hidden rounded-2xl border border-ws-line bg-ws-surface">
        {#each g.rows as r (r.key)}
          {@const hue = hueVar(hueForRoute(r.entry.route, forFilter))}
          <!-- The title's link covers the row; each mode chip is its own link above it. -->
          <li class="group relative flex min-h-16 items-center gap-4 py-3 pl-6 pr-4 hover:bg-ws-raised">
            <span class="absolute inset-y-2 left-2 w-1.5 rounded-full" style:background={hue} aria-hidden="true"></span>
            <span class="min-w-0 flex-1">
              <a href={withInstrument(r.href, forFilter)} class="block font-semibold after:absolute after:inset-0">{r.title}</a>
              <span class="block text-sm text-ws-soft">{r.blurb}</span>
              {#if r.modes.length}
                <span class="relative mt-1 flex flex-wrap gap-1">
                  {#each r.modes as m (m.id)}
                    <a href={withInstrument(m.href, forFilter)} class="rounded-md bg-ws-raised px-2 py-0.5 text-xs hover:bg-ws-line" aria-label="{r.title}: {m.label}">{m.label}</a>
                  {/each}
                </span>
              {/if}
            </span>
            <span class="hidden shrink-0 text-right text-xs text-ws-soft sm:block">
              {r.entry.instruments.length >= INSTRUMENTS.length ? "Any instrument" : r.entry.instruments.map((i) => INSTRUMENT_LABEL[i]).join(", ")}
            </span>
          </li>
        {/each}
      </ul>
    </section>
  {/each}
</div>

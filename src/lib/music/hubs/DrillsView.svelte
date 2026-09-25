<script lang="ts">
  // Every drill, grouped by what you practise, filterable by instrument.
  // Rows, not a card grid: a coloured spine, what you will play, and the modes.
  import { onMount } from "svelte";
  import { INSTRUMENTS, type Instrument } from "@repo/music-core";
  import { CATALOG, type CatalogEntry } from "@repo/music-core/content/catalog";
  import { INSTRUMENT_LABEL } from "../bench.svelte";
  import { hueForRoute, hueVar } from "../hues";
  import { settings } from "../runtime";

  const GROUPS: { title: string; test: (e: CatalogEntry) => boolean }[] = [
    { title: "Ears, reading and time", test: (e) => /\/music\/(ear|reading|rhythm)/.test(e.route) },
    { title: "Piano and jazz", test: (e) => /\/music\/(scales|two-hand|comping|voicings|licks|chord-scales)/.test(e.route) },
    { title: "Guitar and ukulele", test: (e) => /\/music\/(fretboard|chords|strum)/.test(e.route) },
    { title: "Pads and wind", test: (e) => /\/music\/(pads|aerophone)/.test(e.route) },
    { title: "Play freely", test: (e) => /\/music\/(lab|jam|library)/.test(e.route) },
  ];

  let filter = $state<Instrument | "all">("all");
  onMount(() => {
    filter = settings.value.activeInstrument;
  });
  const visible = (e: CatalogEntry) => filter === "all" || e.instruments.includes(filter);
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

  {#each GROUPS as g (g.title)}
    {@const rows = CATALOG.filter((e) => g.test(e) && visible(e))}
    {#if rows.length}
      <section aria-labelledby="g-{g.title}">
        <h2 id="g-{g.title}" class="font-display text-xl font-semibold">{g.title}</h2>
        <ul class="mt-2 divide-y divide-ws-line overflow-hidden rounded-2xl border border-ws-line bg-ws-surface">
          {#each rows as e (e.id)}
            {@const hue = hueVar(hueForRoute(e.route, filter === "all" ? undefined : filter))}
            <li>
              <a
                href={e.route}
                class="group relative flex min-h-16 items-center gap-4 py-3 pl-6 pr-4 hover:bg-ws-raised"
              >
                <span class="absolute inset-y-2 left-2 w-1.5 rounded-full" style:background={hue} aria-hidden="true"></span>
                <span class="min-w-0 flex-1">
                  <span class="block font-semibold">{e.title}</span>
                  <span class="block text-sm text-ws-soft">{e.blurb}</span>
                  {#if e.modes.length > 1}
                    <span class="mt-1 flex flex-wrap gap-1">
                      {#each e.modes as m (m.id)}<span class="rounded-md bg-ws-raised px-2 py-0.5 text-xs">{m.label}</span>{/each}
                    </span>
                  {/if}
                </span>
                <span class="hidden shrink-0 text-right text-xs text-ws-soft sm:block">
                  {e.instruments.length >= INSTRUMENTS.length ? "Any instrument" : e.instruments.map((i) => INSTRUMENT_LABEL[i]).join(", ")}
                </span>
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  {/each}
</div>

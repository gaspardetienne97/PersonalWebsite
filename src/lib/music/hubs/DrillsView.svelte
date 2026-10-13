<script lang="ts">
  // Every drill, grouped by what you practise, filterable by instrument.
  // Rows, not a card grid: a coloured spine, what you will play, and the modes.
  import { onMount } from "svelte";
  import { INSTRUMENTS, type Instrument } from "@repo/music-core";
  import { CATALOG, type CatalogEntry } from "@repo/music-core/content/catalog";
  import { INSTRUMENT_LABEL } from "../bench.svelte";
  import { hueForRoute, hueVar } from "../hues";
  import { settings } from "../runtime";

  const ear = (...slugs: string[]) => (e: CatalogEntry) => slugs.some((x) => e.route === `/music/ear/${x}`);
  const GROUPS: { id: string; title: string; test: (e: CatalogEntry) => boolean }[] = [
    { id: "pitch", title: "Pitch and melody by ear", test: ear("intervals", "interval-compare", "fine-pitch", "scale-degrees", "melody-dictation", "wrong-note", "repertoire-transfer") },
    { id: "harmony", title: "Chords and harmony by ear", test: ear("chord-qualities", "cadences", "chord-functions", "progressions", "scales", "inversions", "bass-lines") },
    { id: "review", title: "Review and studio ears", test: (e) => e.route === "/music/ear/mixed" || e.route === "/music/listening" },
    { id: "time", title: "Reading, rhythm and theory", test: (e) => /\/music\/(reading|rhythm|circle)/.test(e.route) },
    { id: "piano", title: "Piano and jazz", test: (e) => /\/music\/(scales|two-hand|pedal|comping|voicings|licks|chord-scales)/.test(e.route) },
    { id: "guitar", title: "Guitar and ukulele", test: (e) => /\/music\/(fretboard|chords|strum)/.test(e.route) },
    { id: "pads", title: "Pads and wind", test: (e) => /\/music\/(pads|aerophone)/.test(e.route) },
    { id: "free", title: "Play freely", test: (e) => /\/music\/(lab|jam|library)/.test(e.route) },
  ];

  let filter = $state<Instrument | "all">("all");
  onMount(() => {
    filter = settings.value.activeInstrument;
  });
  const visible = (e: CatalogEntry) => filter === "all" || e.instruments.includes(filter);
  const shown = $derived(GROUPS.map((g) => ({ ...g, rows: CATALOG.filter((e) => g.test(e) && visible(e)) })).filter((g) => g.rows.length));

  /** Which setup key picks a drill's mode, so a mode chip opens that mode directly. */
  const MODE_KEY: [RegExp, string][] = [
    [/^\/music\/ear\//, "answer"],
    [/^\/music\/reading/, "activity"],
    [/^\/music\/voicings/, "variant"],
    [/^\/music\/licks/, "category"],
    [/^\/music\/chord-scales/, "changes"],
    [/^\/music\/listening/, "exercise"],
    [/^\/music\/(rhythm|fretboard|chords|pads|aerophone|circle)/, "mode"],
  ];
  const modeHref = (e: CatalogEntry, mode: string) => {
    const key = MODE_KEY.find(([r]) => r.test(e.route))?.[1];
    return key ? `${e.route}${e.route.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(mode)}` : e.route;
  };
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
    {#each shown as g (g.id)}
      <a href="#g-{g.id}" class="text-ws-soft underline-offset-4 hover:text-ws-ink hover:underline">{g.title} <span class="tnum">({g.rows.length})</span></a>
    {/each}
  </nav>

  {#each shown as g (g.id)}
    {@const rows = g.rows}
    {#if rows.length}
      <section aria-labelledby="g-{g.id}" class="scroll-mt-24">
        <h2 id="g-{g.id}" class="font-display text-xl font-semibold">{g.title}</h2>
        <ul class="mt-2 divide-y divide-ws-line overflow-hidden rounded-2xl border border-ws-line bg-ws-surface">
          {#each rows as e (e.id)}
            {@const hue = hueVar(hueForRoute(e.route, filter === "all" ? undefined : filter))}
            <!-- The title's link covers the row; each mode chip is its own link above it. -->
            <li class="group relative flex min-h-16 items-center gap-4 py-3 pl-6 pr-4 hover:bg-ws-raised">
              <span class="absolute inset-y-2 left-2 w-1.5 rounded-full" style:background={hue} aria-hidden="true"></span>
              <span class="min-w-0 flex-1">
                <a href={e.route} class="block font-semibold after:absolute after:inset-0">{e.title}</a>
                <span class="block text-sm text-ws-soft">{e.blurb}</span>
                {#if e.modes.length > 1}
                  <span class="relative mt-1 flex flex-wrap gap-1">
                    {#each e.modes as m (m.id)}
                      <a href={modeHref(e, m.id)} class="rounded-md bg-ws-raised px-2 py-0.5 text-xs hover:bg-ws-line" aria-label="{e.title}: {m.label}">{m.label}</a>
                    {/each}
                  </span>
                {/if}
              </span>
              <span class="hidden shrink-0 text-right text-xs text-ws-soft sm:block">
                {e.instruments.length >= INSTRUMENTS.length ? "Any instrument" : e.instruments.map((i) => INSTRUMENT_LABEL[i]).join(", ")}
              </span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  {/each}
</div>

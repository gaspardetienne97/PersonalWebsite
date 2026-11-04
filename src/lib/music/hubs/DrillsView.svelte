<script lang="ts">
  // Every drill, grouped by what you practise (drills-layout), for the strip's instrument or for
  // all of them. A card per drill: a picture of what it plays, its last score, then its modes.
  import Play from "lucide-svelte/icons/play";
  import X from "lucide-svelte/icons/x";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { INSTRUMENTS, type Instrument } from "@repo/music-core";
  import { COACH_MIN_ATTEMPTS } from "@repo/music-core/progress/coach";
  import { INSTRUMENT_LABEL } from "../bench.svelte";
  import { hueForRoute, hueVar } from "../hues";
  import { INSTRUMENT_ICON } from "../components/instrument-icons";
  import { practice } from "../practice.svelte";
  import { settings } from "../runtime";
  import { SectionSpy } from "../section-spy.svelte";
  import { DRILL_GROUPS, lastRun, rowMastery, type DrillRow } from "./drills-layout";
  import { pct, relativeDay } from "./progress/model";
  import DrillPreview from "./DrillPreview.svelte";

  /** Mode names said plainly on the cards. */
  const MODE_LABEL: Record<string, string> = { "Pocket recall": "From memory" };
  const now = Date.now();
  /** The instruments a drill serves, one icon each (guitar and ukulele share one). */
  const servedIcons = (r: DrillRow) => [...new Set(r.entry.instruments.map((i) => INSTRUMENT_ICON[i]))];

  // One instrument control: the strip's. "All instruments" widens the list without changing it.
  let everything = $state(false);
  const strip = $derived(settings.value.activeInstrument);
  const filter = $derived<Instrument | "all">(everything ? "all" : strip);
  const forFilter = $derived(filter === "all" ? undefined : filter);
  // Words from the search palette's "Show all in Drills" narrow the list by title and description.
  const q = $derived((page.url.searchParams.get("q") ?? "").trim().toLowerCase());
  const matches = (r: DrillRow) => !q || `${r.title} ${r.blurb} ${r.modes.map((m) => m.label).join(" ")}`.toLowerCase().includes(q);
  const visible = (r: DrillRow) => (filter === "all" || r.entry.instruments.includes(filter)) && matches(r);
  const shown = $derived(DRILL_GROUPS.map((g) => ({ ...g, rows: g.rows.filter(visible) })).filter((g) => g.rows.length));
  const total = $derived(shown.reduce((n, g) => n + g.rows.length, 0));
  const runs = $derived(practice.sessions.flatMap((s) => s.runs));
  /** The drill drawn on the instrument it will open on. */
  const drawOn = (r: DrillRow): Instrument => (r.entry.instruments.includes(strip) ? strip : (r.entry.instruments[0] ?? strip));
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
  <!-- The list follows the strip's instrument; one toggle shows every drill. -->
  <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
    <p class="tnum flex flex-wrap items-center gap-x-2 text-ws-soft" role="status">
      <span>{#if everything}{total} drills for every instrument{:else}{total} drills for <span class="font-semibold text-ws-ink">{INSTRUMENT_LABEL[strip]}</span>{/if}{#if q}&nbsp;matching "{q}"{/if}</span>
      {#if q}
        <button type="button" class="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-medium text-instr-ink hover:bg-ws-raised" onclick={() => goto("/music?tab=drills", { replaceState: true, noScroll: true })}
          ><X class="size-4" aria-hidden="true" />Clear search</button
        >
      {/if}
    </p>
    <button
      type="button"
      class="min-h-11 shrink-0 rounded-full border px-4 text-sm {everything
        ? 'border-transparent bg-ws-ink font-semibold text-ws-bg'
        : 'border-ws-line bg-ws-surface hover:bg-ws-raised'}"
      aria-pressed={everything}
      onclick={() => (everything = !everything)}>All instruments</button
    >
  </div>

  <!-- Jump chips, pinned under the strip, with the section on screen lit. -->
  <nav
    aria-label="Jump to"
    class="chips sticky top-[var(--ws-strip-h,3.75rem)] z-10 -mx-4 -mt-2 flex gap-1.5 overflow-x-auto border-b border-ws-line bg-ws-bg/95 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:px-2"
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
          {@const h = hueForRoute(r.entry.route, forFilter ?? drawOn(r))}
          {@const m = rowMastery(r, practice.mastery, now)}
          {@const last = lastRun(r, runs)}
          {@const anywhere = r.entry.instruments.length >= INSTRUMENTS.length}
          <!-- The title's link covers the card; each mode chip is its own link above it. -->
          <li class="card relative flex flex-col gap-3 rounded-2xl border border-ws-line p-3 hover:border-[color:var(--h)]" style:--h={hueVar(h)}>
            <div class="flex items-start gap-3">
              <DrillPreview href={r.href} instrument={drawOn(r)} class="rounded-xl bg-ws-surface/70 p-1" />
              <span class="min-w-0 flex-1">
                <a href={r.href} class="font-semibold after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ws-ink">{r.title}</a>
                <span class="line-clamp-2 text-sm text-ws-soft">{r.blurb}</span>
                <!-- What you have done with it: the last score, then mastery once Check mode has measured it. -->
                <span class="tnum mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ws-soft">
                  {#if last}<span><span class="font-semibold text-ws-ink">Last: {pct(last.score ?? 0)}</span>, {relativeDay(last.endedAt, now)}</span>{/if}
                  {#if m.value !== undefined}
                    <span class="inline-flex items-center gap-1.5"
                      ><span class="h-1.5 w-12 rounded-full bg-ws-raised" aria-hidden="true"><span class="block h-full rounded-full bg-[color:var(--h)]" style:width="{m.value * 100}%"></span></span
                      >Mastery {pct(m.value)}</span
                    >
                  {:else if r.skillIds.length && m.checked}
                    <span>{m.checked} of {COACH_MIN_ATTEMPTS} checked<span class="sr-only">, not measured yet</span></span>
                  {:else if !last}<span>Not played yet</span>{/if}
                  {#if filter === "all"}
                    {#if anywhere}<span>Any instrument</span>{:else}
                      <span class="inline-flex items-center gap-1"
                        ><span class="sr-only">{r.entry.instruments.map((i) => INSTRUMENT_LABEL[i]).join(", ")}</span>
                        {#each servedIcons(r) as I, k (k)}<I class="size-3.5" aria-hidden="true" />{/each}</span
                      >
                    {/if}
                  {/if}
                </span>
              </span>
              <span class="pointer-events-none flex h-9 shrink-0 items-center gap-1 rounded-full bg-[color:var(--h)] px-3 text-xs font-semibold text-ws-stage max-sm:hidden" aria-hidden="true"
                ><Play class="size-3.5" />Start</span
              >
            </div>
            <!-- The card opens the drill; a mode chip opens straight into that mode. -->
            {#if r.modes.length}
              <span class="relative flex min-w-0 flex-wrap items-center gap-1.5">
                {#each r.modes as mo (mo.id)}
                  {@const label = MODE_LABEL[mo.label] ?? mo.label}
                  <a
                    href={mo.href}
                    class="flex min-h-11 items-center rounded-full border border-ws-line bg-ws-surface/80 px-3.5 text-sm hover:border-[color:var(--h)] hover:bg-ws-raised"
                    aria-label="{r.title}: {label}">{label}</a
                  >
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
  /* The jump row stays one line and scrolls sideways; its right edge fades, so a cut chip reads as more. */
  .chips {
    mask-image: linear-gradient(to right, black calc(100% - 2rem), transparent);
    scrollbar-width: none;
  }
</style>

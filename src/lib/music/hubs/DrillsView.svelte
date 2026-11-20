<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  // Every drill, grouped by what you practise (drills-layout), for the strip's instrument or for
  // all of them. A card per drill: a picture of what it plays, its last score, then its modes.
  import Play from "@lucide/svelte/icons/play";
  import X from "@lucide/svelte/icons/x";
  import Search from "@lucide/svelte/icons/search";
  import SearchX from "@lucide/svelte/icons/search-x";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
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
  import Ring from "./progress/Ring.svelte";
  import { DRILL_ICON, HUE_ICON } from "./hue-icons";

  /** Mode names said plainly on the cards. */
  const MODE_LABEL: Record<string, string> = { "Pocket recall": m.music_hubs_drills_mode_from_memory() };
  const now = Date.now();
  /** The instruments a drill serves, one icon each (guitar and ukulele share one). */
  const servedIcons = (r: DrillRow) => [...new Set(r.entry.instruments.map((i) => INSTRUMENT_ICON[i]))];

  // One instrument filter beside the search: the strip's instrument, or all of them (which widens the list without changing the strip).
  let everything = $state(false);
  const strip = $derived(settings.value.activeInstrument);
  const filter = $derived<Instrument | "all">(everything ? "all" : strip);
  const forFilter = $derived(filter === "all" ? undefined : filter);
  // Words typed in the field (or sent by the palette's "Show all in Drills") narrow the list by
  // title, description and mode. The URL holds them, so Back and a reload keep the search.
  const q = $derived((page.url.searchParams.get("q") ?? "").trim().toLowerCase());
  const search = (v: string) =>
    goto(v.trim() ? `/music?tab=drills&q=${encodeURIComponent(v)}` : "/music?tab=drills", {
      replace: true,
      reset: false,
    });
  const matches = (r: DrillRow) => !q || `${r.title} ${r.blurb} ${r.modes.map((mo) => mo.label).join(" ")}`.toLowerCase().includes(q);
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
  /** The card's icon: the drill's own glyph, the same one the search palette shows. */
  const iconOf = (r: DrillRow, h: ReturnType<typeof hueForRoute>) => DRILL_ICON[r.entry.id] ?? HUE_ICON[h];
  // One card's mode menu open at a time (its key), so the cards keep one Start each.
  let modesOpen = $state<string | null>(null);
  // The jump chip for the section on screen lights up as the page scrolls.
  let spy = $state<SectionSpy>();
  $effect(() => {
    const s = new SectionSpy(jumps.map((j) => `g-${j.id}`));
    spy = s;
    return s.watch();
  });
</script>

<div class="flex flex-col gap-6">
  <!-- Search, with the count in the field, and the instrument filter on one line. -->
  <div class="flex items-center gap-2">
    <label class="relative block min-w-0 flex-1">
      <span class="sr-only">{m.music_hubs_drills_search_label()}</span>
      <Search class="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ws-soft" aria-hidden="true" />
      <input
        type="search"
        value={page.url.searchParams.get("q") ?? ""}
        oninput={(e) => search(e.currentTarget.value)}
        placeholder={m.music_hubs_drills_search_placeholder({ total })}
        class="h-12 w-full rounded-full border border-ws-line bg-ws-surface pl-10 pr-4 text-base placeholder:text-ws-soft focus-visible:outline-2 focus-visible:outline-ws-ink"
      />
    </label>
    <div role="group" aria-label={m.music_hubs_drills_filter()} class="flex shrink-0 gap-1 rounded-full border border-ws-line bg-ws-surface p-1">
      {#each [false, true] as all (all)}
        <button
          type="button"
          class="min-h-10 rounded-full px-3 text-sm {everything === all ? 'bg-ws-ink font-semibold text-ws-bg' : 'text-ws-soft hover:text-ws-ink'}"
          aria-pressed={everything === all}
          onclick={() => (everything = all)}
          >{#if all}{m.music_hubs_drills_all()}<span class="max-sm:sr-only">&nbsp;{m.music_hubs_drills_all_rest()}</span>{:else}{INSTRUMENT_LABEL[strip]}{/if}</button
        >
      {/each}
    </div>
  </div>
  <p class="tnum -mt-3 flex flex-wrap items-center gap-x-2 text-sm text-ws-soft {q ? '' : 'sr-only'}" role="status">
    <span>{#if everything}{m.music_hubs_drills_count_all({ total })}{:else}{m.music_hubs_drills_count_for({ total, instrument: INSTRUMENT_LABEL[strip] })}{/if}{#if q}&nbsp;{m.music_hubs_drills_matching({ q })}{/if}</span>
    {#if q}
      <button type="button" class="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-medium text-instr-ink hover:bg-ws-raised" onclick={() => goto("/music?tab=drills", { replace: true, reset: false })}
        ><X class="size-4" aria-hidden="true" />{m.music_hubs_drills_clear()}</button
      >
    {/if}
  </p>

  <!-- Jump chips with the section on screen lit: every one in view (they wrap), pinned under the strip from sm up. -->
  <div class="z-10 -mt-2 sm:sticky sm:top-[var(--ws-strip-h,3.75rem)] sm:rounded-2xl sm:border sm:border-ws-line sm:bg-ws-bg">
  <nav aria-label={m.music_hubs_drills_jump()} class="jumps flex gap-1.5 max-sm:-mx-4 max-sm:overflow-x-auto max-sm:px-4 sm:flex-wrap sm:px-2 sm:py-2">
    {#each jumps as j (j.id)}
      {@const on = spy?.current === `g-${j.id}`}
      <a
        href="#g-{j.id}"
        aria-current={on ? "location" : undefined}
        class="flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-full px-2.5 text-sm sm:px-3 {on ? 'bg-instr-wash font-semibold text-instr-ink' : 'border border-ws-line text-ws-soft hover:bg-ws-raised hover:text-ws-ink sm:border-transparent'}"
        >{j.title} <span class="tnum ml-1">({j.count})</span></a
      >
    {/each}
  </nav>
  </div>

  {#if !shown.length}
    <div class="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-ws-line px-4 py-10 text-center">
      <SearchX class="size-6 text-ws-soft" aria-hidden="true" />
      <p class="font-medium">{q ? m.music_hubs_drills_no_matches_for({ q }) : m.music_hubs_drills_no_matches()}</p>
      <p class="text-sm text-ws-soft">{everything ? m.music_hubs_drills_try_word() : m.music_hubs_drills_try_word_all()}</p>
    </div>
  {/if}

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
        {#each g.rows as r, ri (r.key)}
          {@const h = hueForRoute(r.entry.route, forFilter ?? drawOn(r))}
          {@const Icon = iconOf(r, h)}
          {@const mas = rowMastery(r, practice.mastery, now)}
          {@const last = lastRun(r, runs)}
          {@const anywhere = r.entry.instruments.length >= INSTRUMENTS.length}
          <!-- The title's link covers the card; each mode chip is its own link above it. -->
          <li class="card relative flex flex-col gap-3 rounded-2xl border border-ws-line p-3 hover:border-[color:var(--h)]" style:--h={hueVar(h)}>
            <div class="flex items-start gap-3">
              <span class="relative shrink-0">
                <DrillPreview href={r.href} instrument={drawOn(r)} class="rounded-xl bg-ws-surface/70 p-1" />
                <span class="absolute -bottom-1.5 -left-1.5 grid size-7 place-items-center rounded-full border border-ws-line bg-ws-surface text-ws-ink shadow-sm" aria-hidden="true"><Icon class="size-3.5" /></span>
              </span>
              <span class="min-w-0 flex-1">
                <a href={r.href} class="font-semibold after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ws-ink">{r.title}</a>
                <span class="block text-sm text-ws-soft">{r.blurb}</span>
                <!-- What you have done with it: the last score, then mastery once Check mode has measured it. -->
                <span class="tnum mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-ws-soft">
                  {#if last}
                    <span class="inline-flex items-center gap-1.5"
                      ><Ring value={last.score ?? 0} stroke={(last.score ?? 0) >= 0.85 ? "var(--success)" : "var(--warn)"} class="size-5" /><span
                        ><span class="font-semibold text-ws-ink">{m.music_hubs_drills_last({ pct: pct(last.score ?? 0) })}</span>, {relativeDay(last.endedAt, now)}</span
                      ></span
                    >
                  {/if}
                  {#if mas.value !== undefined}
                    <span class="inline-flex items-center gap-1.5"
                      ><span class="h-1.5 w-12 rounded-full bg-ws-raised" aria-hidden="true"><span class="block h-full rounded-full bg-[color:var(--h)]" style:width="{mas.value * 100}%"></span></span
                      >{m.music_hubs_drills_skill_score({ pct: pct(mas.value) })}</span
                    >
                  {:else if r.skillIds.length && mas.checked}
                    <span>{m.music_hubs_drills_checked_of({ n: mas.checked, total: COACH_MIN_ATTEMPTS })}<span class="sr-only">{m.music_hubs_drills_not_measured_sr()}</span></span>
                  {:else if !last && ri === 0}<span class="rounded-full border border-ws-ink/40 bg-ws-surface px-2 py-0.5 font-semibold text-ws-ink">{m.music_hubs_drills_start_here()}</span>
                  {:else if !last}<span class="inline-flex items-center gap-1.5"><Ring class="size-5" />{m.music_hubs_drills_not_played()}</span>{/if}
                  {#if filter === "all"}
                    {#if anywhere}<span>{m.music_hubs_drills_any_instrument()}</span>{:else}
                      <span class="inline-flex items-center gap-1"
                        ><span class="sr-only">{r.entry.instruments.map((i) => INSTRUMENT_LABEL[i]).join(", ")}</span>
                        {#each servedIcons(r) as I, k (k)}<I class="size-3.5" aria-hidden="true" />{/each}</span
                      >
                    {/if}
                  {/if}
                </span>
              </span>
              <!-- On a laptop Start sits at the card's top right, in the same place on every card. -->
              <span class="pointer-events-none flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-ws-ink px-4 text-sm font-semibold text-ws-bg max-sm:hidden" aria-hidden="true"
                ><Play class="size-4" />{m.music_hubs_start()}</span
              >
            </div>
            <!-- One Start (the card's own link opens the first mode); the other modes wait behind one Mode menu. -->
            <div class="mt-auto flex flex-col gap-2">
              <div class="flex items-center gap-2">
                <span class="pointer-events-none flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-ws-ink px-4 text-sm font-semibold text-ws-bg sm:hidden" aria-hidden="true"
                  ><Play class="size-4" />{m.music_hubs_start()}</span
                >
                {#if r.modes.length}
                  <button
                    type="button"
                    class="relative z-10 flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-ws-line bg-ws-surface px-3.5 text-sm font-medium hover:bg-ws-raised"
                    aria-expanded={modesOpen === r.key}
                    aria-controls="modes-{r.key}"
                    aria-label={m.music_hubs_drills_exercises_in({ title: r.title })}
                    onclick={() => (modesOpen = modesOpen === r.key ? null : r.key)}
                    >{m.music_hubs_drills_exercises()}<span class="tnum text-ws-soft">&nbsp;({r.modes.length})</span><ChevronDown
                      class="size-4 motion-safe:transition-transform {modesOpen === r.key ? 'rotate-180' : ''}"
                      aria-hidden="true"
                    /></button
                  >
                {/if}
              </div>
              {#if r.modes.length && modesOpen === r.key}
                <div id="modes-{r.key}" class="relative flex flex-wrap items-center gap-1.5">
                  {#each r.modes as mo (mo.id)}
                    {@const label = MODE_LABEL[mo.label] ?? mo.label}
                    <a
                      href={mo.href}
                      class="flex min-h-11 items-center whitespace-nowrap rounded-full border border-ws-line bg-ws-surface px-3.5 text-sm font-medium hover:border-[color:var(--h)] hover:bg-ws-raised"
                      aria-label={m.music_hubs_pair({ a: r.title, b: label })}>{label}</a
                    >
                  {/each}
                </div>
              {/if}
            </div>
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
  /* On a phone the jump chips are one row that scrolls sideways, fading at its right edge. */
  @media (max-width: 639.98px) {
    .jumps {
      scrollbar-width: none;
      mask-image: linear-gradient(to right, black calc(100% - 2.5rem), transparent);
    }
  }
</style>

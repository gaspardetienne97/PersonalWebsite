<script lang="ts" module>
  export interface LaneNote {
    beat: number;
    dur: number;
    text: string;
  }
  export interface LaneRow {
    id: string;
    /** L or R for a hand (the form marker next to the hue). */
    mark: string;
    label: string;
    hand?: "left" | "right";
    notes: LaneNote[];
  }
</script>

<script lang="ts">
  import type { LaneOutcome } from "./lane-outcomes";
  import Check from "lucide-svelte/icons/check";
  import X from "lucide-svelte/icons/x";
  import ChevronsLeft from "lucide-svelte/icons/chevrons-left";
  import ChevronsRight from "lucide-svelte/icons/chevrons-right";
  // What lands on each beat, per hand, above the keys: notes that sit in the same
  // column strike together, left to right is the order. The playhead follows the
  // demo or the run clock, so the lane, the keys and the sound move as one.
  interface Props {
    rows: LaneRow[];
    beats: number;
    beat?: number | null;
    beatsPerBar?: number;
    chords?: { beat: number; symbol: string }[];
    /** Check mode: keep the rhythm grid, each note an outlined blank slot. */
    hidden?: boolean;
    /** Show "&" between beats (eighth-note material). */
    eighths?: boolean;
    label: string;
    /** How each note landed, per row id and note index: a glyph and a ring on its chip. */
    outcomes?: Record<string, readonly (LaneOutcome | undefined)[]>;
    /** Notes struck that no target wanted: counted beside the marks, so the tally and the "Wrong note" word agree. */
    wrong?: number;
    /** Where those wrong notes fell, in beats from the downbeat: a cross under the rows at each, so the lane shows them too. */
    strays?: readonly number[];
    /** A short screen: an eighth-note beat takes 4rem, not 5.5, so three bars sit on one row above the staff and the keys. */
    dense?: boolean;
  }
  let { rows, beats, beat = null, beatsPerBar = 4, chords = [], hidden = false, eighths = true, label, outcomes = {}, wrong = 0, strays = [], dense = false }: Props = $props();
  // The same glyphs the results breakdown uses, so a mark reads the same on the lane and after the run.
  const GLYPH = { ok: Check, early: ChevronsLeft, late: ChevronsRight, miss: X } as const;
  const SAID: Record<LaneOutcome, string> = { ok: "on time", early: "early", late: "late", miss: "missed" };
  const ORDER: LaneOutcome[] = ["ok", "early", "late", "miss"];
  /** The legend shows once a note has been marked, with each mark's count. */
  const tally = $derived.by(() => {
    const t: Record<LaneOutcome, number> = { ok: 0, early: 0, late: 0, miss: 0 };
    for (const list of Object.values(outcomes)) for (const o of list) if (o) t[o]++;
    return t;
  });
  const marked = $derived(ORDER.some((o) => tally[o] > 0) || wrong > 0);

  // Bars that do not fit the width wrap onto rows of whole bars (a phone: one bar a row), as long as that
  // makes two rows at most; a longer lane keeps one row that scrolls with the playhead (the keys stay in view).
  const REM = 16;
  /** The least width of a beat, in rem. */
  const beatRem = $derived(eighths ? (dense ? 4 : 5.5) : 3);
  const unit = $derived(beatRem * REM);
  let outer = $state(0);
  const bars = $derived(Math.ceil(beats / beatsPerBar));
  const perRow = $derived(outer ? Math.max(1, Math.floor((outer - 16 - 36) / (beatsPerBar * unit))) : bars);
  const wrap = $derived(perRow < bars && Math.ceil(bars / perRow) <= 2);
  const ticks = $derived(Array.from({ length: beats * (eighths ? 2 : 1) }, (_, i) => (eighths ? i / 2 : i)));
  /** Each system's beat range: one for the whole lane, or whole bars a row when it wraps. */
  const systems = $derived(
    wrap
      ? Array.from({ length: Math.ceil(bars / perRow) }, (_, i) => [i * perRow * beatsPerBar, Math.min(beats, (i + 1) * perRow * beatsPerBar)] as const)
      : [[0, beats] as const],
  );
  // A chip never runs into the next one in its row (swung eighths start late but keep their written length).
  const widthOf = (row: LaneRow, i: number) => {
    const n = row.notes[i];
    const next = row.notes.slice(i + 1).find((m) => m.beat > n.beat);
    return next ? Math.min(n.dur, next.beat - n.beat) : n.dur;
  };
  // A lane wider than the screen follows the playhead, keeping it in the first third of the view.
  let box: HTMLDivElement | undefined = $state();
  let scrolled = $state(false);
  $effect(() => {
    if (wrap || !box || beat === null || box.scrollWidth <= box.clientWidth) return;
    const x = 36 + (box.scrollWidth - 36) * Math.max(0, beat / beats);
    if (x < box.scrollLeft + 36 || x > box.scrollLeft + box.clientWidth * 0.75) box.scrollLeft = Math.max(0, x - box.clientWidth / 3);
  });
  const live = (n: LaneNote) => beat !== null && beat >= n.beat && beat < n.beat + Math.max(0.2, n.dur * 0.9);
  /** The chord sounding now (or at the start), pinned at the lane's left edge so it never scrolls away. */
  const nowChord = $derived(chords.length ? chords.filter((c) => c.beat <= Math.max(0, beat ?? 0)).at(-1)?.symbol ?? chords[0].symbol : null);
</script>

<!-- The region a live stage grows (DrillShell, S3): the rows take the free height, up to a comfortable size, and
     the keys under the lane stay right below it. -->
<div bind:clientWidth={outer} class="flex flex-col gap-2" class:mb-3={!marked} role="img" aria-label={label} data-grow>
  {#each systems as [b0, b1] (b0)}
    <div
      bind:this={box}
      onscroll={() => (scrolled = (box?.scrollLeft ?? 0) > 8)}
      class="lane flex flex-col overflow-x-auto overscroll-x-contain rounded-xl"
      class:tight={wrap}
      data-scrolls={!wrap && outer > 0 && outer < Math.max(18, beats * beatRem) * REM ? "" : undefined}
    >
      {@render system(b0, b1)}
    </div>
  {/each}
</div>
{#if marked}
  <!-- What the marks mean, as labelled chips with the counts so far (not part of the scrolling lane). -->
  <ul class="mt-2 mb-3 flex flex-wrap gap-1.5 text-sm" aria-label="Lane marks so far">
    {#each ORDER as o (o)}
      {@const G = GLYPH[o]}
      <li class="legend inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5" data-outcome={o}>
        <span class="mark static" aria-hidden="true"><G class="size-3" strokeWidth={3} /></span>{SAID[o].charAt(0).toUpperCase() + SAID[o].slice(1)}
        <span class="tnum font-semibold">{tally[o]}</span>
      </li>
    {/each}
    {#if wrong}
      <li class="legend inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5" data-outcome="miss" data-wrong="">
        <span class="mark static" aria-hidden="true"><X class="size-3" strokeWidth={3} /></span>Wrong note
        <span class="tnum font-semibold">{wrong}</span>
      </li>
    {/if}
  </ul>
{/if}

<!-- One system of the lane: the beat count, a track per row, the playhead. Positions are within [b0, b1). -->
{#snippet system(b0: number, b1: number)}
  {@const len = b1 - b0}
  {@const pos = (b: number) => `${((b - b0) / len) * 100}%`}
  <!-- A short last row keeps the bar width of the rows above it (three bars on two rows: the third is half wide). -->
  <div
    class="relative flex flex-1 flex-col"
    style:min-width={wrap ? undefined : `${Math.max(18, beats * beatRem)}rem`}
    style:width={wrap ? `calc(2.25rem + (100% - 2.25rem) * ${len / (perRow * beatsPerBar)})` : undefined}
  >
    <!-- A wrapped row draws the chord row only where a chord changes in it (the first row always). -->
    {#if chords.length && (!wrap || b0 === 0 || chords.some((c) => c.beat >= b0 && c.beat < b1))}
      <div class="flex h-6 text-sm font-semibold text-ws-stage-ink">
        <span class="gutter now-chord" aria-hidden="true">{wrap ? (b0 > 0 && !chords.some((c) => c.beat === b0) ? (chords.filter((c) => c.beat < b0).at(-1)?.symbol ?? "") : "") : scrolled ? nowChord : ""}</span>
        <div class="relative flex-1">
          {#each chords.filter((c) => c.beat >= b0 && c.beat < b1) as c (c.beat)}
            <span class="absolute top-0 whitespace-nowrap" style:left={pos(c.beat)}>{c.symbol}</span>
          {/each}
        </div>
      </div>
    {/if}
    <!-- The count over the lane; a phone keeps the beats and drops the "&"s, which would crowd one bar a row. -->
    <div class="relative ml-9 h-5 text-[0.8125rem] leading-5 text-ws-stage-soft" aria-hidden="true">
      {#each ticks.filter((t) => t >= b0 && t < b1) as t (t)}
        <span
          class="tnum absolute top-0 -translate-x-0.5 {t % 1 ? 'max-sm:hidden' : 'font-semibold'}"
          style:left={pos(t)}>{t % 1 ? "&" : (Math.floor(t) % beatsPerBar) + 1}</span
        >
      {/each}
    </div>
    {#each rows as row (row.id)}
      <div class="row flex flex-1 items-center py-0.5" style:--row-max={beat === null && !marked ? undefined : rows.length === 1 ? "9rem" : rows.length === 2 ? "7.5rem" : undefined}>
        <span class="gutter"><span class="hand-mark" data-hand={row.hand} title={row.label}>{row.mark}</span></span>
        <!-- Rows share the height the stage gives the lane (a live run), never under 40 px nor over 96. -->
        <div class="track relative flex-1 self-stretch rounded-md {wrap ? 'min-h-10' : 'min-h-[clamp(2.5rem,5.5dvh,4.5rem)]'}">
          {#each Array.from({ length: Math.ceil(len / beatsPerBar) }, (_, i) => b0 + i * beatsPerBar) as bar (bar)}
            <span class="bar-line" style:left={pos(bar)} aria-hidden="true"></span>
          {/each}
          {#each row.notes as n, i (i)}
            {#if n.beat >= b0 && n.beat < b1}
              {@const out = outcomes[row.id]?.[i]}
              <span
                class="chip"
                data-hand={row.hand}
                data-live={live(n) || undefined}
                data-outcome={out}
                data-hidden={hidden || undefined}
                title={out ? `${n.text}: ${SAID[out]}` : undefined}
                style:left={pos(n.beat)}
                style:width="max(1.15rem, calc({((Math.min(widthOf(row, i), b1 - n.beat)) / len) * 100}% - 3px))"
                >{hidden ? "" : n.text}{#if out}{@const G = GLYPH[out]}<span class="mark" aria-hidden="true"><G class="size-3" strokeWidth={3} /></span>{/if}</span
              >
            {/if}
          {/each}
        </div>
      </div>
    {/each}
    {#if strays.some((b) => b >= b0 && b < b1)}
      <div class="flex h-5 items-center" data-strays>
        <span class="gutter self-stretch" aria-hidden="true"></span>
        <div class="relative flex-1 self-stretch" role="img" aria-label="Wrong notes: {strays.filter((b) => b >= b0 && b < b1).length}">
          {#each strays as b, i (i)}
            {#if b >= b0 && b < b1}
              <span class="mark stray" style:left={pos(Math.max(b0, b))} aria-hidden="true"><X class="size-3" strokeWidth={3} /></span>
            {/if}
          {/each}
        </div>
      </div>
    {/if}
    {#if beat !== null && beat >= b0 && (beat < b1 || (b1 === beats && beat <= beats))}
      <span class="playhead" style:left="calc(2.25rem + (100% - 2.25rem) * {(beat - b0) / len})" aria-hidden="true"></span>
    {/if}
  </div>
{/snippet}

<style>
  .lane {
    flex: 1 1 auto;
    background: color-mix(in oklch, var(--ws-stage-ink, white) 5%, transparent);
    padding: 0.4rem 0.5rem 0.5rem;
  }
  /* In a run, one or two rows take more of the lane's height than three would each, so a single line is not a strip in an empty card. */
  .row {
    max-height: var(--row-max, 6rem);
  }
  /* The left column (hand marks, the chord now) stays put while a long lane scrolls under it. */
  .gutter {
    position: sticky;
    left: -0.5rem;
    z-index: 3;
    margin-left: -0.5rem;
    padding-left: 0.5rem;
    box-sizing: content-box;
    flex: none;
    width: 2.25rem;
    display: flex;
    align-items: center;
    background: color-mix(in oklch, var(--ws-stage-ink, white) 5%, var(--ws-stage, #15121c));
  }
  /* A lane that scrolls fades at its right edge, so a note cut by the edge reads as more to come. */
  .lane[data-scrolls] {
    mask-image: linear-gradient(to right, black calc(100% - 2rem), transparent);
  }
  /* One bar a row on a phone: eighth-note chips are narrow, so the name and the mark shrink to fit. */
  .tight .chip {
    font-size: 0.8125rem;
  }
  .lane.tight {
    padding: 0.25rem 0.5rem;
  }
  .tight .chip[data-outcome] {
    padding-right: 0.95rem;
  }
  .tight .mark {
    width: 0.85rem;
    height: 0.85rem;
  }
  .now-chord {
    font-size: 0.8125rem;
    line-height: 1;
    overflow: hidden;
    white-space: nowrap;
  }
  .track {
    background: color-mix(in oklch, var(--ws-stage-ink, white) 6%, transparent);
  }
  .bar-line {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: color-mix(in oklch, var(--ws-stage-ink, white) 22%, transparent);
  }
  .hand-mark {
    width: 1.75rem;
    height: 1.75rem;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 0.5rem;
    font-size: 0.8125rem;
    font-weight: 800;
    color: #17120c;
    background: var(--instr);
  }
  .hand-mark[data-hand="left"],
  .chip[data-hand="left"] {
    background: var(--hand-left);
  }
  .hand-mark[data-hand="right"],
  .chip[data-hand="right"] {
    background: var(--hand-right);
  }
  /* Left hand chips carry a second cue besides hue: a notch on the leading edge. */
  .chip[data-hand="left"] {
    border-left: 4px solid #0e2a33;
  }
  .chip {
    position: absolute;
    top: 3px;
    bottom: 3px;
    display: flex;
    align-items: center;
    padding: 0 0.2rem;
    border-radius: 0.4rem;
    background: var(--instr);
    color: #17120c;
    font-size: 0.875rem;
    font-weight: 800;
    white-space: nowrap;
    overflow: hidden;
    opacity: 0.88;
  }
  /* Check: an outlined slot a note, in its hand's colour, blank (when, not what). */
  .chip[data-hidden] {
    opacity: 1;
    background: transparent;
    box-shadow: inset 0 0 0 2px color-mix(in oklch, var(--slot, var(--instr)) 85%, transparent);
  }
  .chip[data-hidden][data-hand="left"] {
    --slot: var(--hand-left);
    background: transparent;
    border-left-color: var(--hand-left);
  }
  .chip[data-hidden][data-hand="right"] {
    --slot: var(--hand-right);
    background: transparent;
  }
  .chip[data-live] {
    opacity: 1;
    box-shadow:
      0 0 0 2px #fff,
      0 0 12px color-mix(in oklch, var(--instr) 70%, transparent);
  }
  /* A landed note: a glyph in a ring of its verdict's colour, so colour is never the only cue. */
  .chip[data-outcome] {
    opacity: 1;
    padding-right: 1.2rem;
  }
  .chip[data-outcome="ok"] {
    box-shadow: inset 0 0 0 2px var(--success);
  }
  .chip[data-outcome="early"] {
    box-shadow: inset 0 0 0 2px var(--early, var(--warn));
  }
  .chip[data-outcome="late"] {
    box-shadow: inset 0 0 0 2px var(--late, var(--warn));
  }
  /* A missed note goes dark with light ink (not a faded chip), so its name and its cross still read. */
  .chip[data-outcome="miss"],
  .chip[data-outcome="miss"][data-hand] {
    background: color-mix(in oklch, var(--destructive) 22%, var(--ws-stage, #15121c));
    color: var(--ws-stage-ink, white);
    box-shadow: inset 0 0 0 2px var(--destructive);
  }
  /* The mark sits in the chip's corner, clear of the note name. */
  .mark {
    position: absolute;
    top: 2px;
    right: 2px;
    display: grid;
    place-items: center;
    width: 1rem;
    height: 1rem;
    border-radius: 999px;
    color: white;
    background: var(--success);
  }
  .mark.static {
    position: static;
  }
  .mark.stray {
    background: var(--destructive);
    color: var(--on-destructive, white);
    top: 2px;
    right: auto;
    translate: -50% 0;
  }
  [data-outcome="early"] .mark {
    background: var(--early, var(--warn));
    color: var(--on-destructive, white);
  }
  [data-outcome="late"] .mark {
    background: var(--late, var(--warn));
    color: var(--on-destructive, white);
  }
  .legend {
    background: color-mix(in oklch, var(--ws-stage-ink, white) 8%, transparent);
    color: var(--ws-stage-ink, white);
  }
  [data-outcome="miss"] .mark {
    background: var(--destructive);
    color: var(--on-destructive, white);
  }
  .playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #fff;
    box-shadow: 0 0 8px #fff8;
    pointer-events: none;
  }
</style>

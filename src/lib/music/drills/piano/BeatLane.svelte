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
    /** Check mode: keep the rhythm grid, hide the notes. */
    hidden?: boolean;
    /** Show "&" between beats (eighth-note material). */
    eighths?: boolean;
    label: string;
    /** How each note landed, per row id and note index: a glyph and a ring on its chip. */
    outcomes?: Record<string, readonly (LaneOutcome | undefined)[]>;
  }
  let { rows, beats, beat = null, beatsPerBar = 4, chords = [], hidden = false, eighths = true, label, outcomes = {} }: Props = $props();
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
  const marked = $derived(ORDER.some((o) => tally[o] > 0));

  const at = (b: number) => `${(b / beats) * 100}%`;
  const ticks = $derived(Array.from({ length: beats * (eighths ? 2 : 1) }, (_, i) => (eighths ? i / 2 : i)));
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
    if (!box || beat === null || box.scrollWidth <= box.clientWidth) return;
    const x = 36 + (box.scrollWidth - 36) * Math.max(0, beat / beats);
    if (x < box.scrollLeft + 36 || x > box.scrollLeft + box.clientWidth * 0.75) box.scrollLeft = Math.max(0, x - box.clientWidth / 3);
  });
  const live = (n: LaneNote) => beat !== null && beat >= n.beat && beat < n.beat + Math.max(0.2, n.dur * 0.9);
  /** Where a note falls in its bar, the way it is counted: "1", "&", "2"... (Check shows this instead of the note). */
  const count = (b: number) => (Math.abs(b % 1) < 0.01 ? String((Math.floor(b) % beatsPerBar) + 1) : "&");
  /** The chord sounding now (or at the start), pinned at the lane's left edge so it never scrolls away. */
  const nowChord = $derived(chords.length ? chords.filter((c) => c.beat <= Math.max(0, beat ?? 0)).at(-1)?.symbol ?? chords[0].symbol : null);
</script>

<div bind:this={box} onscroll={() => (scrolled = (box?.scrollLeft ?? 0) > 8)} class="lane mb-3 overflow-x-auto overscroll-x-contain rounded-xl" role="img" aria-label={label}>
  <div class="relative" style:min-width="{Math.max(18, beats * (eighths ? 5.5 : 3))}rem">
    {#if chords.length}
      <div class="flex h-6 text-sm font-semibold text-ws-stage-ink">
        <span class="gutter now-chord" aria-hidden="true">{scrolled ? nowChord : ""}</span>
        <div class="relative flex-1">
          {#each chords as c (c.beat)}
            <span class="absolute top-0 whitespace-nowrap" style:left={at(c.beat)}>{c.symbol}</span>
          {/each}
        </div>
      </div>
    {/if}
    <div class="relative ml-9 h-5 text-xs text-ws-stage-soft" aria-hidden="true">
      {#each ticks as t (t)}
        <span
          class="tnum absolute top-0 -translate-x-0.5 {t % 1 ? 'opacity-60' : 'font-semibold'}"
          style:left={at(t)}>{t % 1 ? "&" : (Math.floor(t) % beatsPerBar) + 1}</span
        >
      {/each}
    </div>
    {#each rows as row (row.id)}
      <div class="flex items-center py-0.5">
        <span class="gutter"><span class="hand-mark" data-hand={row.hand} title={row.label}>{row.mark}</span></span>
        <!-- Rows grow with a tall screen (a phone held upright), so the lane takes the room, not a gap. -->
        <div class="track relative h-[clamp(2.75rem,7dvh,4.5rem)] flex-1 rounded-md">
          {#each Array.from({ length: Math.ceil(beats / beatsPerBar) }, (_, i) => i * beatsPerBar) as bar (bar)}
            <span class="bar-line" style:left={at(bar)} aria-hidden="true"></span>
          {/each}
          {#each row.notes as n, i (i)}
            {@const out = outcomes[row.id]?.[i]}
            <span
              class="chip"
              data-hand={row.hand}
              data-live={live(n) || undefined}
              data-outcome={out}
              data-off={hidden && n.beat % 1 ? "" : undefined}
              title={out ? `${n.text}: ${SAID[out]}` : undefined}
              style:left={at(n.beat)}
              style:width="max(1.15rem, calc({at(widthOf(row, i))} - 3px))"
              >{hidden ? count(n.beat) : n.text}{#if out}{@const G = GLYPH[out]}<span class="mark" aria-hidden="true"><G class="size-3" strokeWidth={3} /></span>{/if}</span
            >
          {/each}
        </div>
      </div>
    {/each}
    {#if beat !== null && beat >= 0 && beat <= beats}
      <span class="playhead" style:left="calc(2.25rem + (100% - 2.25rem) * {beat / beats})" aria-hidden="true"></span>
    {/if}
  </div>
</div>
{#if marked}
  <!-- What the marks mean, as labelled chips with the counts so far (not part of the scrolling lane). -->
  <ul class="-mt-1 mb-3 flex flex-wrap gap-1.5 text-sm" aria-label="Lane marks so far">
    {#each ORDER as o (o)}
      {@const G = GLYPH[o]}
      <li class="legend inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5" data-outcome={o}>
        <span class="mark static" aria-hidden="true"><G class="size-3" strokeWidth={3} /></span>{SAID[o].charAt(0).toUpperCase() + SAID[o].slice(1)}
        <span class="tnum font-semibold">{tally[o]}</span>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .lane {
    background: color-mix(in oklch, var(--ws-stage-ink, white) 5%, transparent);
    padding: 0.4rem 0.5rem 0.5rem;
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
  .now-chord {
    font-size: 0.7rem;
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
    font-size: 0.8rem;
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
  /* Check: the blocks carry the count instead of the note; the off-beats step back. */
  .chip[data-off] {
    opacity: 0.55;
    font-weight: 600;
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
  .chip[data-outcome="miss"] {
    opacity: 0.45;
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

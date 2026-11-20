<script lang="ts">
  // The pattern as rhythm notation: a one-line staff with note values, beams,
  // rests, ties and accents, a cursor that runs with the click, each note lit
  // by its state, and under the staff the count and the taps that landed
  // (shape and colour say early, on time, late, extra or in a rest; a missed
  // note gets a hollow ring where its tap should have been).
  import { onMount } from "svelte";
  import { m } from "@repo/i18n/messages.js";
  import type { RhythmPatternDef } from "@repo/music-core/data/index";
  import { loadVexFlow, NotationError, type Layout } from "#lib/music/notation/engrave.ts";
  import type { GroupState } from "#lib/music/notation/NotationFrame.svelte";
  import { cursorAt } from "#lib/music/notation/selection.svelte.ts";
  import type { GridHit } from "./RhythmGrid.svelte";
  import { drawRhythm, rhythmLine, type RhythmLine } from "./notation";

  interface Props {
    pattern: RhythmPatternDef;
    /** Where the click is, in the click's beats. */
    cursorBeat?: number | null;
    /** By event index. */
    states?: Record<number, GroupState>;
    hits?: GridHit[];
    label: string;
    onfallback?: (reason: string) => void;
    /** A two-beat bar written in 6/8 even with no note inside a beat. */
    compound?: boolean;
  }
  let { pattern, cursorBeat = null, states = {}, hits = [], label, onfallback, compound = false }: Props = $props();

  type VF = Awaited<ReturnType<typeof loadVexFlow>>;
  let VF = $state.raw<VF | null>(null);
  let host = $state<HTMLDivElement>();
  let width = $state(0);
  let line = $state.raw<RhythmLine | null>(null);
  let layout = $state.raw<Layout | null>(null);

  function fail(e: unknown) {
    layout = null;
    host?.replaceChildren();
    onfallback?.(e instanceof NotationError ? e.message : m.music_drills_rhythm_notation_stopped({ error: String((e as Error)?.message ?? e) }));
  }
  onMount(() => void loadVexFlow().then((mod) => (VF = mod), fail));

  $effect(() => {
    if (!VF || !host || width < 40) return;
    try {
      const l = rhythmLine(pattern, { compound });
      layout = drawRhythm(VF, host, pattern, l, width);
      line = l;
    } catch (e) {
      fail(e);
    }
  });

  $effect(() => {
    if (!layout) return;
    for (const [g, els] of layout.groupEls)
      for (const el of els) {
        if (states[g]) el.setAttribute("data-state", states[g]);
        else el.removeAttribute("data-state");
      }
  });

  /** A click beat on the drawn line; taps a hair before the first note or after the last stay on it. */
  const at = (beat: number) => (layout && line ? cursorAt(layout, Math.max(0, Math.min(line.length, line.written(beat)))) : null);
  const cursor = $derived(cursorBeat === null ? null : at(cursorBeat));
  const counts = $derived(layout && line ? line.counts.map((c) => ({ ...c, pos: cursorAt(layout!, c.beat) })) : []);
  const marks = $derived(layout ? hits.map((h) => ({ ...h, pos: at(h.beat) })) : []);
</script>

<div class="rn" data-testid="rhythm-notation">
  {#if line?.swing}
    <p class="swing">{m.music_drills_rhythm_notation_swing()}</p>
  {/if}
  <div class="paper" role="img" aria-label={label} title={m.music_drills_rhythm_notation_title()} bind:clientWidth={width}>
    <div class="canvas" style:height={layout ? `${layout.height}px` : undefined}>
      <div class="host" bind:this={host} aria-hidden="true"></div>
      {#each counts as c (c.beat)}
        {#if c.pos}
          <span class="count" class:beat={c.text !== "&" && c.text !== "a"} style:left="{c.pos.x}px" style:top="{c.pos.bottom + 20}px" aria-hidden="true">{c.text}</span>
        {/if}
      {/each}
      {#each marks as h, i (i)}
        {#if h.pos}
          <svg class="hit" data-kind={h.kind} viewBox="-6 -6 12 12" style:left="{h.pos.x}px" style:top="{h.pos.bottom + 46}px" aria-hidden="true">
            {#if h.kind === "early"}<path class="chev early" d="M1 -5 L-4 0 L1 5 M5 -5 L0 0 L5 5" />
            {:else if h.kind === "late"}<path class="chev late" d="M-1 -5 L4 0 L-1 5 M-5 -5 L0 0 L-5 5" />
            {:else if h.kind === "pocket"}<path class="tick" d="M-4.5 0 L-1.5 3.5 L4.5 -4" />
            {:else if h.kind === "missed"}<circle r="4.5" class="hollow" />
            {:else}<path d="M-4.5 -4.5 L4.5 4.5 M4.5 -4.5 L-4.5 4.5" class="cross" />{/if}
          </svg>
        {/if}
      {/each}
      {#if cursor}
        <div class="cursor" data-cursor style:left="{cursor.x - 1}px" style:top="{cursor.top}px" style:height="{cursor.bottom - cursor.top}px"></div>
      {/if}
    </div>
  </div>
</div>

<style>
  .swing {
    margin: 0 0 0.5rem;
    font-size: 0.875rem;
    color: var(--ws-stage-soft);
  }
  /* Notation is printed paper in both themes, as on every staff in the app. */
  .paper {
    --ws-surface: oklch(0.99 0.004 285);
    --ws-ink: oklch(0.2 0.045 287);
    --ws-soft: oklch(0.45 0.03 287);
    background: var(--ws-surface);
    color: var(--ws-ink);
    border-radius: 0.5rem;
    min-width: 0;
  }
  :global(.dark) .paper {
    --ws-surface: oklch(0.92 0.008 285);
  }
  .canvas {
    position: relative;
    overflow: clip;
  }
  .host :global(svg) {
    display: block;
    fill: currentColor;
  }
  .host :global(svg :is(path, rect, text)[fill]:not([fill="none"]):not([fill="white"])) {
    fill: currentColor;
  }
  .host :global(svg [stroke]:not([stroke="none"])) {
    stroke: currentColor;
  }
  .host :global(svg rect[fill="white"]) {
    fill: var(--ws-surface);
  }
  .host :global(g[data-state="active"]) {
    color: var(--instr-ink);
  }
  .host :global(g[data-state="correct"]) {
    color: var(--success);
  }
  .host :global(g[data-state="wrong"]) {
    color: var(--destructive);
  }
  .host :global(g[data-state]) {
    transition: color 120ms ease-out;
  }
  .count {
    position: absolute;
    transform: translateX(-50%);
    font-size: 0.8125rem;
    line-height: 1;
    color: var(--ws-soft);
    pointer-events: none;
  }
  .count.beat {
    color: var(--ws-ink);
    font-weight: 600;
  }
  .hit {
    position: absolute;
    width: 16px;
    height: 16px;
    margin: -8px 0 0 -8px;
    overflow: visible;
    pointer-events: none;
  }
  .hit circle {
    fill: var(--warn);
  }
  .hit .chev,
  .chev {
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .chev.early {
    stroke: var(--early, var(--warn));
  }
  .chev.late {
    stroke: var(--late, var(--warn));
  }

  /* On time: a check, the same glyph as the results strip. */
  .hit .tick {
    fill: none;
    stroke: var(--success);
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .hit .hollow {
    fill: none;
    stroke: var(--destructive);
    stroke-width: 2;
  }
  .hit .cross {
    fill: none;
    stroke: var(--destructive);
    stroke-width: 2.5;
  }
  .cursor {
    position: absolute;
    width: 2px;
    background: var(--instr-ink, currentColor);
    pointer-events: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .host :global(g[data-state]) {
      transition: none;
    }
  }
</style>

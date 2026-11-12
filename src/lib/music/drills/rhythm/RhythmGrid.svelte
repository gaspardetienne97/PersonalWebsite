<script lang="ts" module>
  export interface GridEvent {
    beat: number;
    accent: boolean;
    stroke?: "down" | "up" | "mute";
    /** Beats the stroke rings, drawn as a tail so quarters read longer than eighths. */
    duration?: number;
  }
  export type GridVerdict = "early" | "pocket" | "late" | "missed";
  export interface GridHit {
    beat: number;
    /** Missed: a note with no tap, drawn hollow where its tap should have been. */
    kind: "early" | "pocket" | "late" | "extra" | "rest" | "missed";
  }
</script>

<script lang="ts">
  // One line of rhythm per bar: noteheads on a single line, accents, strum
  // strokes, drawn rests, chord symbols, counting underneath, and the taps
  // that landed (shape and colour both say early, on time, late or extra; a
  // missed note is a hollow head, explained by the TapKey under the stage).
  interface Props {
    bars: number;
    perBar: number;
    events: GridEvent[];
    rests?: { startBeat: number; endBeat: number }[];
    chords?: { symbol: string; startBeat: number }[];
    hits?: GridHit[];
    verdicts?: (GridVerdict | undefined)[];
    playhead?: number | null;
    lit?: number | null;
    label: string;
    /** Count the "&" between beats; a pulse taps beats only, so it leaves them out. */
    offbeats?: boolean;
    /** Draw the notes as a faint target (Echo in Practice): hollow dashed heads, not written music. */
    ghost?: boolean;
  }
  let { bars, perBar, events, rests = [], chords = [], hits = [], verdicts = [], playhead = null, lit = null, label, offbeats = true, ghost = false }: Props = $props();

  const W = 400;
  const x = (b: number) => 22 + (b / perBar) * (W - 40);
  const uid = `rg-${Math.random().toString(36).slice(2, 7)}`;
  const fine = $derived(events.some((e) => Math.abs((e.beat * 2) % 1) > 1e-6));
  const counts = $derived(
    Array.from({ length: perBar * (fine || !offbeats ? 1 : 2) }, (_, i) => {
      const b = fine || !offbeats ? i : i / 2;
      return { b, text: Number.isInteger(b) ? String(b + 1) : "&" };
    }),
  );
  const barList = $derived(Array.from({ length: bars }, (_, i) => i));
  const inBar = <T extends { beat: number }>(xs: T[], bar: number) => xs.map((e, i) => ({ e, i })).filter(({ e }) => e.beat >= bar * perBar - 1e-6 && e.beat < (bar + 1) * perBar - 1e-6);
  /** A tap a hair before a bar's first beat belongs to that bar, not drawn at the end of the one before. */
  const hitsIn = (bar: number) => hits.map((e, i) => ({ e, i })).filter(({ e }) => Math.floor((e.beat + 0.25) / perBar) === bar);
  const glyph = { down: "↓", up: "↑", mute: "✕" } as const;
  /** With no chord symbols or strum arrows the space above the accents is empty: leave it out, so a phone shows more bars. */
  const top = $derived(chords.length || events.some((e) => e.stroke) ? 0 : 36);
</script>

<div class="grid gap-2 {bars > 1 ? 'sm:grid-cols-2' : ''}" role="img" aria-label={label}>
  {#each barList as bar (bar)}
    <svg viewBox="0 {top} {W} {128 - top}" class="w-full" aria-hidden="true">
      <defs>
        <pattern id="{uid}-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" class="hatch" />
        </pattern>
      </defs>
      {#if bars > 1}<text x="4" y={top + 14} class="bar-no">{bar + 1}</text>{/if}
      {#each chords.filter((c) => c.startBeat >= bar * perBar && c.startBeat < (bar + 1) * perBar) as c (c.startBeat)}
        <text x={x(c.startBeat - bar * perBar)} y="16" class="chord">{c.symbol}</text>
      {/each}
      {#each rests.filter((r) => r.startBeat >= bar * perBar - 1e-6 && r.startBeat < (bar + 1) * perBar - 1e-6) as r (r.startBeat)}
        <rect x={x(r.startBeat - bar * perBar) - 6} y="58" width={x(r.endBeat - bar * perBar) - x(r.startBeat - bar * perBar)} height="24" rx="4" fill="url(#{uid}-hatch)" class="rest" />
        <text x={x(r.startBeat - bar * perBar) + (x(r.endBeat - bar * perBar) - x(r.startBeat - bar * perBar)) / 2 - 6} y="75" class="rest-glyph">𝄾</text>
      {/each}
      <line x1="10" x2={W - 10} y1="70" y2="70" class="staff" />
      <line x1="10" x2="10" y1="54" y2="86" class="barline" />
      <line x1={W - 10} x2={W - 10} y1="54" y2="86" class="barline" />
      {#each Array.from({ length: perBar }, (_, i) => i) as b (b)}
        <line x1={x(b)} x2={x(b)} y1="66" y2="74" class="tick" />
      {/each}
      {#each inBar(events, bar) as { e, i } (i)}
        {@const cx = x(e.beat - bar * perBar)}
        {@const v = verdicts[i]}
        <g class="note" data-lit={lit === i || (playhead !== null && playhead >= e.beat && playhead - e.beat < 0.3) || undefined} data-verdict={v} data-ghost={ghost || undefined}>
          {#if e.duration && e.duration >= 0.75 && e.stroke !== "mute"}
            <line x1={cx + 8} x2={x(Math.min(perBar, e.beat - bar * perBar + e.duration)) - 10} y1="70" y2="70" class="tail" />
          {/if}
          {#if e.stroke}<text x={cx} y="36" class="stroke">{glyph[e.stroke]}</text>{/if}
          {#if e.accent}<text x={cx} y="52" class="accent">&gt;</text>{/if}
          {#if e.stroke === "mute"}
            <text x={cx} y="76" class="mute">✕</text>
          {:else}
            <ellipse {cx} cy="70" rx={e.accent ? 9 : 7.5} ry={e.accent ? 7 : 6} class="head" />
          {/if}
        </g>
      {/each}
      {#each counts as c (c.b)}
        <text x={x(c.b)} y="104" class="count" class:beat={c.text !== "&"}>{c.text}</text>
      {/each}
      {#each hitsIn(bar) as { e: h, i } (i)}
        {@const hx = x(h.beat - bar * perBar)}
        <g class="hit" data-kind={h.kind} transform="translate({hx} 118) scale(1.7)">
          {#if h.kind === "early"}<path class="chev early" d="M1 -5 L-4 0 L1 5 M5 -5 L0 0 L5 5" />
          {:else if h.kind === "late"}<path class="chev late" d="M-1 -5 L4 0 L-1 5 M-5 -5 L0 0 L-5 5" />
          {:else if h.kind === "pocket"}<path class="tick" d="M-4.5 0 L-1.5 3.5 L4.5 -4" />
          {:else if h.kind === "missed"}<circle r="4.5" class="hollow" />
          {:else}<path d="M-5 -5 L5 5 M5 -5 L-5 5" class="cross" />{/if}
        </g>
      {/each}
      {#if playhead !== null && playhead >= bar * perBar && playhead < (bar + 1) * perBar}
        <line x1={x(playhead - bar * perBar)} x2={x(playhead - bar * perBar)} y1={top + 8} y2="90" class="playhead" />
      {/if}
    </svg>
  {/each}
</div>

<style>
  svg {
    overflow: visible;
    font-family: inherit;
  }
  .staff,
  .barline {
    stroke: var(--ws-stage-ink);
    stroke-width: 1.5;
  }
  .tick {
    stroke: var(--ws-stage-soft);
    stroke-width: 1;
    opacity: 0.6;
  }
  .hatch {
    stroke: var(--ws-stage-soft);
    stroke-width: 2;
    opacity: 0.55;
  }
  .rest {
    stroke: var(--ws-stage-soft);
    stroke-dasharray: 3 3;
  }
  .rest-glyph {
    fill: var(--ws-stage-ink);
    font-size: 18px;
  }
  .bar-no {
    fill: var(--ws-stage-soft);
    font-size: 16px;
  }
  .chord {
    fill: var(--instr);
    font-size: 15px;
    font-weight: 700;
    text-anchor: middle;
  }
  .head {
    fill: var(--ws-stage-ink);
  }
  .tail {
    stroke: var(--instr);
    stroke-width: 5;
    stroke-linecap: round;
    opacity: 0.7;
  }
  .stroke,
  .accent,
  .mute {
    fill: var(--ws-stage-ink);
    text-anchor: middle;
    font-weight: 700;
  }
  .stroke {
    font-size: 16px;
  }
  .accent {
    font-size: 14px;
  }
  .mute {
    font-size: 15px;
  }
  .note[data-lit] .head,
  .note[data-lit] .mute {
    fill: var(--instr);
    filter: drop-shadow(0 0 6px var(--instr));
  }
  /* The beat under the playhead swells as the click lands, then settles: the pulse is seen as well as heard. */
  @media (prefers-reduced-motion: no-preference) {
    .head {
      transform-box: fill-box;
      transform-origin: center;
      transition: transform 260ms ease-out;
    }
    .note[data-lit] .head {
      transform: scale(1.7);
      transition-duration: 50ms;
    }
  }
  .note[data-ghost] .head {
    fill: none;
    stroke: var(--ws-stage-soft);
    stroke-width: 1.5;
    stroke-dasharray: 3 2.5;
  }
  .note[data-ghost] .accent,
  .note[data-ghost] .tail {
    opacity: 0.4;
  }
  .note[data-verdict="pocket"] .head {
    fill: var(--success);
  }
  .note[data-verdict="early"] .head {
    fill: var(--early, var(--warn));
  }
  .note[data-verdict="late"] .head {
    fill: var(--late, var(--warn));
  }
  .note[data-verdict="missed"] .head {
    fill: none;
    stroke: var(--destructive);
    stroke-width: 2;
  }
  /* In viewBox units: a bar drawn under 400 px wide (a phone) still sets them at 13 px or more. */
  .count {
    fill: var(--ws-stage-soft);
    font-size: 16px;
    text-anchor: middle;
  }
  .count.beat {
    fill: var(--ws-stage-ink);
    font-weight: 600;
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

  .hit .tick {
    fill: none;
    opacity: 1;
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
  .playhead {
    stroke: var(--instr);
    stroke-width: 3;
    stroke-linecap: round;
    filter: drop-shadow(0 0 4px var(--instr));
  }
</style>

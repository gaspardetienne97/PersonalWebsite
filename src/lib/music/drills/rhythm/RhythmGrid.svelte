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
    kind: "early" | "pocket" | "late" | "extra" | "rest";
  }
</script>

<script lang="ts">
  // One line of rhythm per bar: noteheads on a single line, accents, strum
  // strokes, drawn rests, chord symbols, counting underneath, and the taps
  // that landed (shape and colour both say early, in the pocket, late or extra).
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
  }
  let { bars, perBar, events, rests = [], chords = [], hits = [], verdicts = [], playhead = null, lit = null, label }: Props = $props();

  const W = 400;
  const x = (b: number) => 22 + (b / perBar) * (W - 40);
  const uid = `rg-${Math.random().toString(36).slice(2, 7)}`;
  const fine = $derived(events.some((e) => Math.abs((e.beat * 2) % 1) > 1e-6));
  const counts = $derived(
    Array.from({ length: perBar * (fine ? 1 : 2) }, (_, i) => {
      const b = fine ? i : i / 2;
      return { b, text: Number.isInteger(b) ? String(b + 1) : "&" };
    }),
  );
  const barList = $derived(Array.from({ length: bars }, (_, i) => i));
  const inBar = <T extends { beat: number }>(xs: T[], bar: number) => xs.map((e, i) => ({ e, i })).filter(({ e }) => e.beat >= bar * perBar - 1e-6 && e.beat < (bar + 1) * perBar - 1e-6);
  const glyph = { down: "↓", up: "↑", mute: "✕" } as const;
</script>

<div class="grid gap-2 {bars > 1 ? 'sm:grid-cols-2' : ''}" role="img" aria-label={label}>
  {#each barList as bar (bar)}
    <svg viewBox="0 0 {W} 128" class="w-full" aria-hidden="true">
      <defs>
        <pattern id="{uid}-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" class="hatch" />
        </pattern>
      </defs>
      <text x="4" y="14" class="bar-no">{bar + 1}</text>
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
        <g class="note" data-lit={lit === i || undefined} data-verdict={v}>
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
          {#if v === "missed"}<text x={cx} y="92" class="miss">missed</text>{/if}
        </g>
      {/each}
      {#each counts as c (c.b)}
        <text x={x(c.b)} y="104" class="count" class:beat={c.text !== "&"}>{c.text}</text>
      {/each}
      {#each inBar(hits, bar) as { e: h, i } (i)}
        {@const hx = x(h.beat - bar * perBar)}
        <g class="hit" data-kind={h.kind} transform="translate({hx} 118)">
          {#if h.kind === "early"}<path d="M5 -5 L-5 0 L5 5 Z" />
          {:else if h.kind === "late"}<path d="M-5 -5 L5 0 L-5 5 Z" />
          {:else if h.kind === "pocket"}<circle r="5" />
          {:else}<path d="M-5 -5 L5 5 M5 -5 L-5 5" class="cross" />{/if}
        </g>
      {/each}
      {#if playhead !== null && playhead >= bar * perBar && playhead < (bar + 1) * perBar}
        <line x1={x(playhead - bar * perBar)} x2={x(playhead - bar * perBar)} y1="24" y2="124" class="playhead" />
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
    font-size: 11px;
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
  .note[data-verdict="pocket"] .head {
    fill: var(--success);
  }
  .note[data-verdict="early"] .head,
  .note[data-verdict="late"] .head {
    fill: var(--warn);
  }
  .note[data-verdict="missed"] .head {
    fill: none;
    stroke: var(--destructive);
    stroke-width: 2;
  }
  .miss {
    fill: var(--destructive);
    font-size: 10px;
    text-anchor: middle;
  }
  .count {
    fill: var(--ws-stage-soft);
    font-size: 11px;
    text-anchor: middle;
  }
  .count.beat {
    fill: var(--ws-stage-ink);
    font-weight: 600;
  }
  .hit path,
  .hit circle {
    fill: var(--warn);
  }
  .hit[data-kind="pocket"] circle {
    fill: var(--success);
  }
  .hit .cross {
    fill: none;
    stroke: var(--destructive);
    stroke-width: 2.5;
  }
  .playhead {
    stroke: var(--instr);
    stroke-width: 2;
  }
</style>

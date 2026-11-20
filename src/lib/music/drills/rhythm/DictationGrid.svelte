<script lang="ts">
  // The groove dictation grid: one row per drum (or one row for a rhythm), one column per count, a bar at a time,
  // each bar in its own box. Cells never narrow below 44 px: on a phone a bar of eighths takes two rows of four;
  // a bar of sixteenths that does not fit wraps at a beat, inside the same box. While the pattern plays, a
  // playhead sweeps the bar and the column under it lights. The drill makes it writable; a lesson shows it read-only.
  import { m } from "@repo/i18n/messages.js";
  import { beatsPerRow, CELL_GAP } from "./rhythm";

  interface Props {
    bars: number;
    rows: { id: string; label: string }[];
    perBeat: 2 | 3 | 4;
    beatsPerBar: number;
    marks: Record<string, boolean[]>;
    /** Right, extra or missed, once a dictation is checked. */
    state?: (row: string, i: number) => string | null;
    disabled?: boolean;
    ontoggle?: (row: string, i: number) => void;
    /** The number each bar is called, when the bars shown are not 1, 2, 3 in order. */
    barNumbers?: number[];
    /** Where the pattern is while it plays, in beats from the first downbeat; null when silent. */
    playhead?: number | null;
  }
  let { bars, rows, perBeat, beatsPerBar, marks, state: stateOf, disabled = true, ontoggle, barNumbers, playhead = null }: Props = $props();

  const COUNTS = { 2: ["", "&"], 3: ["", "&", "a"], 4: ["", "e", "&", "a"] } as const;
  const GLYPH: Record<string, string> = { right: "✓", extra: "✕", missed: "○" };
  const STATE_WORD: Record<string, () => string> = { right: m.music_drills_rhythm_v_right, extra: m.music_drills_rhythm_v_extra, missed: m.music_drills_rhythm_v_missed };
  /** The cell's name for a screen reader: "Kick, bar 1, & 2, right". */
  function cellName(label: string, n: number, i: number, st: string | null) {
    const at = { bar: n, count: cellLabel(i) || m.music_drills_rhythm_beat_word(), beat: Math.floor((i % cellsPerBar) / perBeat) + 1 };
    const name = label ? m.music_drills_rhythm_grid_cell_drum({ drum: label, ...at }) : m.music_drills_rhythm_grid_cell(at);
    return st ? m.music_drills_rhythm_grid_cell_state({ label: name, state: STATE_WORD[st]?.() ?? st }) : name;
  }
  const cellLabel = (i: number) => {
    const sub = i % perBeat;
    return sub ? COUNTS[perBeat][sub] : String((Math.floor(i / perBeat) % beatsPerBar) + 1);
  };

  let width = $state(0);
  /** The drum name column (2.75rem) and its gap. */
  const labelPx = $derived(rows.some((r) => r.label) ? 50 : 0);
  const BAR_GAP = 12;
  /** The bar box's border and padding, each side. */
  const BOX_PAD = 9;
  /** Two bars side by side (as the ruler above draws them) only when each still fits whole. */
  const cols = $derived(bars > 1 && width && beatsPerRow((width - BAR_GAP) / 2 - 2 * BOX_PAD, perBeat, beatsPerBar, labelPx) === beatsPerBar ? 2 : 1);
  const perRow = $derived(beatsPerRow((cols === 2 ? (width - BAR_GAP) / 2 : width) - 2 * BOX_PAD, perBeat, beatsPerBar, labelPx));
  const segs = $derived(Array.from({ length: Math.ceil(beatsPerBar / perRow) }, (_, s) => s));
  const cellsPerBar = $derived(beatsPerBar * perBeat);
  const cellsPerSeg = $derived(perRow * perBeat);
  const range = (n: number, from: number) => Array.from({ length: n }, (_, k) => from + k);
  /** The cell under the playhead, and the segment (bar and row) it sweeps. */
  const nowCell = $derived(playhead === null ? -1 : Math.floor(playhead * perBeat + 1e-6));
  const nowSeg = $derived(playhead === null ? null : { bar: Math.floor(playhead / beatsPerBar), seg: Math.floor((playhead % beatsPerBar) / perRow), at: ((playhead % beatsPerBar) % perRow) / perRow });
</script>

<div class="grid" style:gap="{BAR_GAP}px" style:grid-template-columns="repeat({cols}, minmax(0, 1fr))" bind:clientWidth={width}>
  {#each range(bars, 0) as bar (bar)}
    {@const n = barNumbers?.[bar] ?? bar + 1}
    <div class="box" style:padding="{BOX_PAD - 1}px">
      {#if bars > 1 || segs.length > 1}<p class="mb-1.5 text-sm font-semibold text-ws-stage-soft">{m.music_drills_rhythm_bar({ n })}</p>{/if}
      <div class="space-y-2">
        {#each segs as seg (seg)}
          <div class="relative space-y-1">
            {#each rows as row (row.id)}
              <div class="flex items-center gap-1.5">
                {#if row.label}<span class="w-11 shrink-0 text-sm leading-tight font-semibold text-ws-stage-soft">{row.label}</span>{/if}
                <div class="grid min-w-0 flex-1" style:gap="{CELL_GAP}px" style:grid-template-columns="repeat({cellsPerSeg}, minmax(0, 1fr))">
                  {#each range(Math.min(cellsPerSeg, cellsPerBar - seg * cellsPerSeg), bar * cellsPerBar + seg * cellsPerSeg) as i (i)}
                    {@const on = !!marks[row.id]?.[i]}
                    {@const st = stateOf?.(row.id, i) ?? null}
                    <button
                      type="button"
                      class="cell"
                      class:beat={i % perBeat === 0}
                      data-row={row.id}
                      data-state={st}
                      data-now={i === nowCell || undefined}
                      aria-pressed={on}
                      aria-label={cellName(row.label, n, i, st)}
                      {disabled}
                      onclick={() => ontoggle?.(row.id, i)}
                      ><span>{cellLabel(i)}</span>{#if st}<span class="mark ws-pop" aria-hidden="true">{GLYPH[st]}</span>{:else if on}<svg class="head ws-pop" viewBox="-6 -4 12 8" aria-hidden="true"><ellipse rx="5" ry="3.4" transform="rotate(-22)" /></svg>{/if}</button
                    >
                  {/each}
                </div>
              </div>
            {/each}
            {#if nowSeg && nowSeg.bar === bar && nowSeg.seg === seg}
              <div class="pointer-events-none absolute inset-y-0 right-0" style:left="{labelPx}px" aria-hidden="true">
                <div class="playhead ws-sweep" style:--ws-progress={nowSeg.at}></div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/each}
</div>

<style>
  .box {
    min-width: 0;
    border-radius: 0.75rem;
    border: 1px solid color-mix(in oklch, var(--ws-stage-ink) 14%, transparent);
  }
  .cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.1rem;
    min-width: 0;
    min-height: 3rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    line-height: 1;
    color: var(--ws-stage-ink);
    background: color-mix(in oklch, var(--ws-stage-ink) 8%, transparent);
    /* Every cell's edge at 3:1 on the stage, the "&" cells as much as the beats. */
    border: 2px solid color-mix(in oklch, var(--ws-stage-ink) 45%, transparent);
    transition: box-shadow 80ms ease-out;
  }
  .cell.beat {
    background: color-mix(in oklch, var(--ws-stage-ink) 14%, transparent);
    font-weight: 700;
  }
  .cell:not(:disabled):hover {
    border-color: color-mix(in oklch, var(--ws-stage-ink) 40%, transparent);
  }
  .cell:focus-visible {
    outline: 3px solid var(--ws-stage-ink);
    outline-offset: 2px;
  }
  .cell[aria-pressed="true"] {
    background: var(--instr-strong, var(--instr));
    border-color: var(--instr-strong, var(--instr));
    color: var(--on-instr, var(--ws-stage));
  }
  /* The column the playhead is over: lit, so a still frame shows where the music is. */
  .cell[data-now] {
    box-shadow: 0 0 0 2px var(--ws-stage-ink);
  }
  /* Placed by .ws-sweep at --ws-progress of the cells' width. */
  .playhead {
    top: -3px;
    bottom: -3px;
    width: 3px;
    margin-left: -1.5px;
    border-radius: 2px;
    background: var(--ws-stage-ink);
    box-shadow: 0 0 8px color-mix(in oklch, var(--ws-stage-ink) 60%, transparent);
  }
  /* A marked cell carries a notehead: the mark reads as a note, as on the staff above. */
  .head {
    width: 0.95rem;
    height: 0.65rem;
    fill: currentColor;
  }
  .mark {
    font-size: 1rem;
    font-weight: 700;
  }
  .cell[data-state="right"] {
    border-color: var(--success);
  }
  .cell[data-state="extra"] {
    border-color: var(--destructive);
  }
  .cell[data-state="missed"] {
    border-color: var(--destructive);
    border-style: dashed;
  }
  .cell[data-state="missed"] .mark {
    color: var(--destructive);
  }
  @media (prefers-reduced-motion: reduce) {
    .cell {
      transition: none;
    }
  }
</style>

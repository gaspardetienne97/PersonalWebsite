<script lang="ts">
  // The groove dictation grid: one row per drum (or one row for a rhythm), one column per count, a bar at a time.
  // Cells stay 44 px wide: where a whole bar does not fit (a phone), the bar wraps at a beat, half a bar a row.
  // The drill makes it writable; a lesson shows it read-only.
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
  }
  let { bars, rows, perBeat, beatsPerBar, marks, state: stateOf, disabled = true, ontoggle, barNumbers }: Props = $props();

  const COUNTS = { 2: ["", "&"], 3: ["", "&", "a"], 4: ["", "e", "&", "a"] } as const;
  const GLYPH: Record<string, string> = { right: "✓", extra: "✕", missed: "○" };
  const cellLabel = (i: number) => {
    const sub = i % perBeat;
    return sub ? COUNTS[perBeat][sub] : String((Math.floor(i / perBeat) % beatsPerBar) + 1);
  };

  let width = $state(0);
  /** The drum name column (3.5rem) and its gap. */
  const labelPx = $derived(rows.some((r) => r.label) ? 64 : 0);
  const BAR_GAP = 16;
  /** Two bars side by side (as the ruler above draws them) only when each still fits whole. */
  const cols = $derived(bars > 1 && width && beatsPerRow((width - BAR_GAP) / 2, perBeat, beatsPerBar, labelPx) === beatsPerBar ? 2 : 1);
  const perRow = $derived(beatsPerRow(cols === 2 ? (width - BAR_GAP) / 2 : width, perBeat, beatsPerBar, labelPx));
  const segs = $derived(Array.from({ length: Math.ceil(beatsPerBar / perRow) }, (_, s) => s));
  const cellsPerBar = $derived(beatsPerBar * perBeat);
  const cellsPerSeg = $derived(perRow * perBeat);
  const range = (n: number, from: number) => Array.from({ length: n }, (_, k) => from + k);
</script>

<div class="grid" style:gap="{BAR_GAP}px" style:grid-template-columns="repeat({cols}, minmax(0, 1fr))" bind:clientWidth={width}>
  {#each range(bars, 0) as bar (bar)}
    {@const n = barNumbers?.[bar] ?? bar + 1}
    <div class="space-y-2">
      {#if bars > 1 || segs.length > 1}<p class="text-xs font-semibold text-ws-stage-soft">Bar {n}</p>{/if}
      {#each segs as seg (seg)}
        <div class="space-y-1">
          {#each rows as row (row.id)}
            <div class="flex items-center gap-2">
              {#if row.label}<span class="w-14 shrink-0 text-xs font-semibold text-ws-stage-soft">{row.label}</span>{/if}
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
                    aria-pressed={on}
                    aria-label="{row.label ? `${row.label}, b` : 'B'}ar {n}, {cellLabel(i) || 'beat'} {Math.floor((i % cellsPerBar) / perBeat) + 1}{st ? `, ${st}` : ''}"
                    {disabled}
                    onclick={() => ontoggle?.(row.id, i)}
                    ><span>{cellLabel(i)}</span>{#if st}<span class="mark" aria-hidden="true">{GLYPH[st]}</span>{:else if on}<span class="mark" aria-hidden="true">●</span>{/if}</button
                  >
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/each}
    </div>
  {/each}
</div>

<style>
  .cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.1rem;
    min-width: 0;
    min-height: 2.75rem;
    border-radius: 0.5rem;
    font-size: 0.8125rem;
    line-height: 1;
    background: color-mix(in oklch, var(--ws-stage-ink) 8%, transparent);
    border: 2px solid color-mix(in oklch, var(--ws-stage-ink) 16%, transparent);
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
    background: var(--instr);
    border-color: var(--instr);
    color: var(--ws-stage);
  }
  .mark {
    font-size: 0.75rem;
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
</style>

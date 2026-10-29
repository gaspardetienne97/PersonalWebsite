<script lang="ts">
  // The groove dictation grid: one row per drum (or one row for a rhythm), one column per count, a bar at a time.
  // The drill makes it writable; a lesson shows it read-only.
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
  }
  let { bars, rows, perBeat, beatsPerBar, marks, state, disabled = true, ontoggle }: Props = $props();

  const cellsPerBar = $derived(beatsPerBar * perBeat);
  const COUNTS = { 2: ["", "&"], 3: ["", "&", "a"], 4: ["", "e", "&", "a"] } as const;
  const cellLabel = (i: number) => {
    const sub = i % perBeat;
    return sub ? COUNTS[perBeat][sub] : String((Math.floor(i / perBeat) % beatsPerBar) + 1);
  };
</script>

{#each Array.from({ length: bars }, (_, b) => b) as bar (bar)}
  <div class="space-y-1">
    {#each rows as row (row.id)}
      <div class="flex items-center gap-2">
        {#if row.label}<span class="w-14 shrink-0 text-xs font-semibold text-ws-stage-soft">{row.label}</span>{/if}
        <div class="grid min-w-0 flex-1 gap-1" style:grid-template-columns="repeat({cellsPerBar}, minmax(0, 1fr))">
          {#each Array.from({ length: cellsPerBar }, (_, k) => bar * cellsPerBar + k) as i (i)}
            {@const on = !!marks[row.id]?.[i]}
            <button
              type="button"
              class="cell"
              class:beat={i % perBeat === 0}
              data-row={row.id}
              data-state={state?.(row.id, i) ?? null}
              aria-pressed={on}
              aria-label="{row.label ? `${row.label}, b` : "B"}ar {bar + 1}, {cellLabel(i) || 'beat'} {Math.floor((i % cellsPerBar) / perBeat) + 1}"
              {disabled}
              onclick={() => ontoggle?.(row.id, i)}
            >{cellLabel(i)}</button>
          {/each}
        </div>
      </div>
    {/each}
  </div>
{/each}

<style>
  .cell {
    min-height: 2.6rem;
    border-radius: 0.5rem;
    font-size: 0.75rem;
    background: color-mix(in oklch, var(--ws-stage-ink) 8%, transparent);
    border: 2px solid transparent;
  }
  .cell.beat {
    background: color-mix(in oklch, var(--ws-stage-ink) 14%, transparent);
    font-weight: 700;
  }
  .cell[aria-pressed="true"] {
    background: var(--instr);
    color: var(--ws-stage);
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
</style>

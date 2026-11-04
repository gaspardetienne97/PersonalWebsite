<script lang="ts">
  // After a dictation: what was heard above what you wrote, a bar at a time, with a tick,
  // a cross or a hollow ring in each cell, so the comparison reads without colour.
  import { cellVerdict } from "./rhythm";

  interface Props {
    bars: number;
    rows: { id: string; label: string }[];
    perBeat: 2 | 3 | 4;
    beatsPerBar: number;
    heard: (row: string, i: number) => boolean;
    marked: (row: string, i: number) => boolean;
  }
  let { bars, rows, perBeat, beatsPerBar, heard, marked }: Props = $props();

  const COUNTS = { 2: ["", "&"], 3: ["", "&", "a"], 4: ["", "e", "&", "a"] } as const;
  const GLYPH = { right: "✓", extra: "✕", missed: "○" } as const;
  const cells = $derived(beatsPerBar * perBeat);
  const range = (n: number, from = 0) => Array.from({ length: n }, (_, k) => from + k);
  const count = (k: number) => (k % perBeat ? COUNTS[perBeat][k % perBeat] : String(k / perBeat + 1));
</script>

<section class="rounded-2xl border border-ws-line bg-ws-surface p-4" aria-label="Heard and written, cell by cell" data-testid="dictation-compare">
  <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
    <h3 class="font-display text-base font-semibold">What you heard, and what you wrote</h3>
    <p class="text-sm text-ws-soft"><span class="ok">✓</span> right, <span class="bad">✕</span> extra, <span class="bad">○</span> missed</p>
  </div>
  <div class="mt-3 grid gap-4 {bars > 1 ? 'sm:grid-cols-2' : ''}">
    {#each range(bars) as bar (bar)}
      <div class="sheet" style:--cells={cells} role="table" aria-label="Bar {bar + 1}">
        <div class="row" role="row">
          <span class="lab" role="rowheader">Bar {bar + 1}</span>
          {#each range(cells) as k (k)}<span class="cell count" class:beat={k % perBeat === 0} role="columnheader">{count(k)}</span>{/each}
        </div>
        {#each rows as row (row.id)}
          <div class="row" role="row">
            <span class="lab" role="rowheader">{row.label ? `${row.label} heard` : "Heard"}</span>
            {#each range(cells, bar * cells) as i (i)}
              <span class="cell" class:beat={i % perBeat === 0} role="cell" aria-label={heard(row.id, i) ? "a note" : "no note"}>{heard(row.id, i) ? "●" : ""}</span>
            {/each}
          </div>
          <div class="row yours" role="row">
            <span class="lab" role="rowheader">You wrote</span>
            {#each range(cells, bar * cells) as i (i)}
              {@const v = cellVerdict(heard(row.id, i), marked(row.id, i))}
              <span class="cell" class:beat={i % perBeat === 0} data-v={v} role="cell" aria-label={v ?? "nothing"}>{v ? GLYPH[v] : ""}</span>
            {/each}
          </div>
        {/each}
      </div>
    {/each}
  </div>
</section>

<style>
  .sheet {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .row {
    display: grid;
    grid-template-columns: 5.25rem repeat(var(--cells), minmax(0, 1fr));
    align-items: center;
  }
  .row.yours {
    margin-bottom: 0.35rem;
  }
  .lab {
    font-size: 0.75rem;
    color: var(--ws-soft);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .yours .lab {
    color: var(--ws-ink);
    font-weight: 600;
  }
  .cell {
    display: grid;
    place-items: center;
    min-width: 0;
    height: 1.5rem;
    font-size: 0.8125rem;
    font-weight: 700;
    line-height: 1;
    border-left: 1px solid color-mix(in oklch, var(--ws-ink) 8%, transparent);
  }
  .cell.beat {
    border-left-color: color-mix(in oklch, var(--ws-ink) 28%, transparent);
  }
  .count {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--ws-soft);
  }
  .count.beat {
    color: var(--ws-ink);
    font-weight: 700;
  }
  .ok,
  .cell[data-v="right"] {
    color: var(--success);
  }
  .bad,
  .cell[data-v="extra"],
  .cell[data-v="missed"] {
    color: var(--destructive);
  }
</style>

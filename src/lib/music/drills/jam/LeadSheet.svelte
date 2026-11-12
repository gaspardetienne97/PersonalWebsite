<script lang="ts">
  // The chart as a band reads it: a staff with bar lines, a slash on every beat, the chord symbols over
  // the beat they start on, a section's letter boxed on its first bar, a double bar at the end. The bar
  // being played is washed in the hue and its beat's slash is lit; nothing else moves.
  let {
    chords,
    beatsPerBar = 4,
    sections = [],
    at = null,
  }: {
    chords: readonly { symbol: string; bars: number }[];
    beatsPerBar?: number;
    sections?: readonly { label: string; bar: number }[];
    /** Where the form is, in beats from the top of the chorus; null while nothing plays. */
    at?: number | null;
  } = $props();

  const bars = $derived.by(() => {
    const total = Math.max(1, Math.round(chords.reduce((n, c) => n + c.bars, 0)));
    const out = Array.from({ length: total }, (_, i) => ({ i, mark: sections.find((s) => s.bar === i)?.label, chords: [] as { symbol: string; beat: number }[] }));
    let start = 0;
    for (const c of chords) {
      const bar = Math.min(total - 1, Math.floor(start + 1e-6));
      out[bar].chords.push({ symbol: c.symbol, beat: Math.round((start - bar) * beatsPerBar) });
      start += c.bars;
    }
    return out;
  });
  const beats = $derived(Array.from({ length: beatsPerBar }, (_, k) => k));
  const nowBar = $derived(at === null ? -1 : Math.floor(at / beatsPerBar + 1e-6) % bars.length);
  const nowBeat = $derived(at === null ? -1 : Math.floor((at % beatsPerBar) + 1e-6));
</script>

<!-- Drawn for the eye; the form is read out by the list beside it. -->
<ol class="sheet grid grid-cols-4 gap-y-2 lg:grid-cols-8" aria-hidden="true" style:--beats={beatsPerBar}>
  {#each bars as b (b.i)}
    <li class="bar" class:now={b.i === nowBar} class:end={b.i === bars.length - 1} data-bar={b.i + 1} data-now={b.i === nowBar ? "" : undefined}>
      <span class="syms" class:tight={b.chords.length > 1}>
        {#each b.chords as c, k (k)}
          <span class="sym font-display" style:grid-column="{c.beat + 1} / {(b.chords[k + 1]?.beat ?? beatsPerBar) + 1}">{#if b.mark && k === 0}<span class="mark">{b.mark}</span>{/if}{c.symbol}</span>
        {:else}
          {#if b.mark}<span class="sym"><span class="mark">{b.mark}</span></span>{/if}
        {/each}
      </span>
      <span class="staff">
        {#each beats as k (k)}<span class="slash" class:on={b.i === nowBar && k === nowBeat}></span>{/each}
      </span>
    </li>
  {/each}
</ol>

<style>
  .sheet {
    --line: color-mix(in oklch, var(--ws-stage-ink) 30%, transparent);
  }
  .bar {
    min-width: 0;
    margin-right: -1px;
  }
  .syms,
  .staff {
    display: grid;
    grid-template-columns: repeat(var(--beats), minmax(0, 1fr));
    padding-left: 0.375rem;
  }
  .syms {
    height: 1.5rem;
    align-items: end;
  }
  .sym {
    display: flex;
    align-items: baseline;
    gap: 0.3rem;
    font-size: 1rem;
    font-weight: 600;
    line-height: 1.3;
    white-space: nowrap;
  }
  /* Two chords in a bar: a size down, so Am7b5 and D7 keep a gap. */
  .syms.tight .sym {
    font-size: 0.875rem;
  }
  /* The rehearsal mark: a section's letter in a box, as on a printed chart. */
  .mark {
    padding: 0 0.3rem;
    border: 1px solid var(--ws-stage-soft);
    border-radius: 0.2rem;
    font-size: 0.8125rem;
    font-weight: 600;
    line-height: 1.25;
    color: var(--ws-stage-soft);
  }
  /* Five staff lines, a bar line at each side (neighbours share one). */
  .staff {
    height: calc(1.5rem + 1px);
    align-items: center;
    border-inline: 1px solid var(--ws-stage-soft);
    background: repeating-linear-gradient(to bottom, var(--line) 0 1px, transparent 1px 0.375rem);
  }
  .bar.end .staff {
    border-right: 4px double var(--ws-stage-ink);
  }
  .slash {
    width: 0.3rem;
    height: 0.8rem;
    margin-left: 0.25rem;
    border-radius: 1px;
    background: color-mix(in oklch, var(--ws-stage-ink) 75%, transparent);
    transform: skewX(-28deg);
  }
  .bar.now .staff {
    background-color: color-mix(in oklch, var(--instr) 24%, transparent);
    box-shadow: 0 0 0 1px var(--instr);
  }
  .bar.now .sym {
    color: var(--instr);
  }
  .slash.on {
    background: var(--instr);
  }
</style>

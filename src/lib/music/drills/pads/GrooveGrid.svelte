<script lang="ts">
  // The expected groove as a step grid, one block per bar, counts written
  // "1 e & a" (sixteenths), "1 & a" (triplets) or "1 2 3" (7/8's eighths). Accents carry a ">" (not colour alone); after a run each target
  // shows how it landed with a glyph. Fits 375 px: 16 columns plus a name column.
  import type { GrooveTarget } from "@repo/music-core/content/winds-pads";
  import { GROOVE_VOICES } from "@repo/music-core/content/winds-pads";
  import { CHOP_SLICES, slicePad, sliceVoice } from "@repo/music-core/content/pads-studio";
  import { padLabel } from "./midi-status";

  interface Props {
    targets: GrooveTarget[];
    bars: number;
    sectionLabels: readonly string[];
    /** Step index from the downbeat while a run or demo plays. */
    playhead?: number | null;
    /** Grid steps a click (4 sixteenths, 3 or 6 triplets, 2 for 7/8). */
    stepsPerBeat?: number;
    beatsPerBar?: number;
    /** Per target: error ms (positive late) or null when missed; undefined before results. */
    outcomes?: (number | null)[];
    /** A hit this far off or less shows as on time: the same window the results call good. */
    windowMs?: number;
  }
  let { targets, bars, sectionLabels, playhead = null, outcomes, windowMs = 30, stepsPerBeat = 4, beatsPerBar = 4 }: Props = $props();

  const COUNT_SETS: Record<number, string[]> = { 2: ["", "&"], 3: ["", "&", "a"], 4: ["", "e", "&", "a"], 6: ["", "", "&", "", "a", ""] };
  const per = $derived(stepsPerBeat);
  const barSteps = $derived(per * beatsPerBar);
  // 7/8 clicks eighths on a sixteenth grid: count the eighths, "&" between.
  const COUNTS = $derived(COUNT_SETS[per] ?? COUNT_SETS[4]);
  /** The count over step c of a bar. */
  const countAt = (c: number) => (c % per === 0 ? String(c / per + 1) : COUNTS[c % per]);
  /** The kit's drums, then any slices (a written piece's chop section). */
  const SLICES = Array.from({ length: CHOP_SLICES }, (_, i) => ({ id: sliceVoice(i), name: `Slice ${i + 1}`, midi: slicePad(i) }));
  const voices = $derived([...GROOVE_VOICES, ...SLICES].filter((v) => targets.some((t) => t.voice === v.id)));
  const at = $derived.by(() => {
    const m = new Map<string, number>();
    targets.forEach((t, i) => m.set(`${t.voice}:${Math.round(t.beat * per)}`, i));
    return m;
  });
  // A bar-5 downbeat target (turnaround fill) gets one extra column on the last bar.
  const tail = $derived(targets.some((t) => t.beat >= bars * beatsPerBar));
  const total = $derived(bars * barSteps + (tail ? 1 : 0));
  const cols = $derived(Array.from({ length: total }, (_, g) => g));
  const colsOf = (bar: number) => barSteps + (tail && bar === bars - 1 ? 1 : 0);

  // Keep a moving playhead in view: a page turn when it nears the right edge.
  let scroller = $state<HTMLElement | null>(null);
  $effect(() => {
    if (playhead === null || !scroller) return;
    const cell = scroller.querySelector<HTMLElement>(`[data-col="${playhead}"]`);
    if (!cell) return;
    const x = cell.offsetLeft;
    const view = scroller.clientWidth;
    if (x > scroller.scrollLeft + view * 0.85 || x < scroller.scrollLeft + 60) scroller.scrollLeft = Math.max(0, x - view * 0.15);
  });

  function verdict(i: number) {
    if (!outcomes) return null;
    const e = outcomes[i];
    if (e === null || e === undefined) return { glyph: "✕", word: "missed", kind: "miss" };
    if (Math.abs(e) <= windowMs) return { glyph: "✓", word: `on time, ${Math.round(e)} ms`, kind: "ok" };
    return e > 0 ? { glyph: "›", word: `late by ${Math.round(e)} ms`, kind: "off" } : { glyph: "‹", word: `early by ${Math.round(-e)} ms`, kind: "off" };
  }
</script>

<!-- One line, all the bars side by side, scrolling sideways; the drum names stay put. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -- a scrollable region must be reachable by keyboard -->
<div class="scroll" bind:this={scroller} role="region" aria-label="The groove, {bars} bar{bars > 1 ? 's' : ''}, scroll sideways" tabindex="0">
  <div class="grid" style:--cols={total}>
    <span class="name corner"></span>
    {#each Array.from({ length: bars }, (_, b) => b) as bar (bar)}
      <p class="bar-label" style:grid-column="span {colsOf(bar)}">
        Bar {bar + 1}{#if sectionLabels.length > 1 || sectionLabels[0] !== "groove"}, {sectionLabels[Math.min(bar, sectionLabels.length - 1)]}{/if}
      </p>
    {/each}
    <span class="name corner"></span>
    {#each cols as g (g)}
      {@const c = g % barSteps}
      <span class="count" class:beat={c % per === 0} class:barline={c === 0 && g > 0} class:now={playhead === g}>{g === bars * barSteps ? "1" : countAt(c)}</span>
    {/each}
    {#each voices as v (v.id)}
      <span class="name" title="{v.name}, pad {padLabel(v.midi)}">{v.name}</span>
      {#each cols as g (g)}
        {@const c = g % barSteps}
        {@const i = at.get(`${v.id}:${g}`)}
        {@const t = i === undefined ? null : targets[i]}
        {@const vd = i === undefined ? null : verdict(i)}
        <span
          class="cell"
          class:beat={c % per === 0}
          class:barline={c === 0 && g > 0}
          class:now={playhead === g}
          data-col={g}
          data-hit={t ? (t.accent ? "accent" : t.ghost ? "ghost" : "normal") : undefined}
          data-kind={vd?.kind}
          title={t ? `${v.name}, bar ${Math.floor(g / barSteps) + 1} on ${Math.floor(c / per) + 1}${COUNTS[c % per] ? ` ${COUNTS[c % per]}` : ""}${t.accent ? ", accent" : t.ghost ? ", ghost note" : ""}${vd ? `: ${vd.word}` : ""}` : undefined}
        >
          {#if t}
            <span class="dot" aria-hidden="true">{vd ? vd.glyph : t.accent ? ">" : t.ghost ? "( )" : ""}</span>
            <span class="sr-only">{v.name}, bar {Math.floor(g / barSteps) + 1}, beat {Math.floor(c / per) + 1}{COUNTS[c % per] ? ` ${COUNTS[c % per]}` : ""}{t.accent ? ", accent" : t.ghost ? ", ghost note" : ""}{vd ? `, ${vd.word}` : ""}</span>
          {/if}
        </span>
      {/each}
    {/each}
  </div>
</div>

<style>
  .scroll {
    /* The cells' screen-reader words are absolutely placed: positioned here, the scroller holds them, not the page. */
    position: relative;
    overflow-x: auto;
    padding-bottom: 0.35rem;
    scrollbar-width: thin;
  }
  .scroll:focus-visible {
    outline: 2px solid var(--instr);
    outline-offset: 2px;
    border-radius: 6px;
  }
  .grid {
    display: grid;
    grid-template-columns: 4.6rem repeat(var(--cols), 1.75rem);
    gap: 2px;
    align-items: center;
    width: max-content;
  }
  .bar-label {
    font-size: 0.72rem;
    color: var(--ws-stage-soft);
    padding-left: 2px;
  }
  /* The drum names stay put while the bars scroll under them. */
  .name,
  .corner {
    position: sticky;
    left: 0;
    z-index: 1;
    align-self: stretch;
    display: flex;
    align-items: center;
    padding-right: 0.3rem;
    background: var(--ws-stage);
  }
  .barline {
    margin-left: 6px;
  }
  .count {
    text-align: center;
    font-size: 0.66rem;
    color: var(--ws-stage-soft);
    border-radius: 3px;
  }
  .count.beat {
    color: var(--ws-stage-ink);
    font-weight: 700;
  }
  .name {
    font-size: 0.72rem;
    color: var(--ws-stage-soft);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cell {
    aspect-ratio: 1;
    max-height: 2.4rem;
    border-radius: 4px;
    background: color-mix(in oklch, var(--ws-stage-ink) 5%, transparent);
    display: grid;
    place-items: center;
  }
  .cell.beat {
    background: color-mix(in oklch, var(--ws-stage-ink) 10%, transparent);
  }
  .now {
    box-shadow: inset 0 0 0 1.5px var(--ws-stage-ink);
  }
  .dot {
    width: 72%;
    height: 72%;
    border-radius: 999px;
    display: grid;
    place-items: center;
    font-size: 0.62rem;
    font-weight: 800;
    color: #140a10;
    background: color-mix(in oklch, var(--instr) 70%, var(--ws-stage-ink));
  }
  /* A ghost note: small and hollow, played soft. */
  [data-hit="ghost"] .dot {
    width: 45%;
    height: 45%;
    background: transparent;
    box-shadow: inset 0 0 0 1.5px color-mix(in oklch, var(--instr) 80%, var(--ws-stage-ink));
  }
  [data-hit="accent"] .dot {
    width: 90%;
    height: 90%;
    background: var(--instr);
  }
  [data-kind="ok"] .dot {
    background: var(--success);
    color: white;
  }
  [data-kind="off"] .dot {
    background: var(--warn);
  }
  [data-kind="miss"] .dot {
    background: transparent;
    color: var(--destructive);
    box-shadow: inset 0 0 0 1.5px var(--destructive);
  }
</style>

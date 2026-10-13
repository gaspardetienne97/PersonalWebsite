<script lang="ts">
  // The expected groove as a sixteenth grid, one block per bar, counts written
  // "1 e & a". Accents carry a ">" (not colour alone); after a run each target
  // shows how it landed with a glyph. Fits 375 px: 16 columns plus a name column.
  import type { GrooveTarget } from "@repo/music-core/content/winds-pads";
  import { GROOVE_VOICES } from "@repo/music-core/content/winds-pads";
  import { padLabel } from "./midi-status";

  interface Props {
    targets: GrooveTarget[];
    bars: number;
    sectionLabels: readonly string[];
    /** Sixteenth index from the downbeat while a run or demo plays. */
    playhead?: number | null;
    /** Per target: error ms (positive late) or null when missed; undefined before results. */
    outcomes?: (number | null)[];
    windowMs?: number;
  }
  let { targets, bars, sectionLabels, playhead = null, outcomes, windowMs = 60 }: Props = $props();

  const COUNTS = ["", "e", "&", "a"];
  const voices = $derived(GROOVE_VOICES.filter((v) => targets.some((t) => t.voice === v.id)));
  const at = $derived.by(() => {
    const m = new Map<string, number>();
    targets.forEach((t, i) => m.set(`${t.voice}:${Math.round(t.beat * 4)}`, i));
    return m;
  });
  // A bar-5 downbeat target (turnaround fill) gets one extra column on the last bar.
  const tail = $derived(targets.some((t) => t.beat >= bars * 4));

  function verdict(i: number) {
    if (!outcomes) return null;
    const e = outcomes[i];
    if (e === null || e === undefined) return { glyph: "✕", word: "missed", kind: "miss" };
    if (Math.abs(e) <= windowMs / 2) return { glyph: "✓", word: `on time, ${Math.round(e)} ms`, kind: "ok" };
    return e > 0 ? { glyph: "›", word: `late by ${Math.round(e)} ms`, kind: "off" } : { glyph: "‹", word: `early by ${Math.round(-e)} ms`, kind: "off" };
  }
</script>

<div class="flex flex-col gap-3">
  {#each Array.from({ length: bars }, (_, b) => b) as bar (bar)}
    {@const cols = 16 + (tail && bar === bars - 1 ? 1 : 0)}
    <div class="bar" style:--cols={cols}>
      <p class="col-span-full text-xs text-ws-stage-soft">
        Bar {bar + 1}{#if sectionLabels.length > 1 || sectionLabels[0] !== "groove"}, {sectionLabels[Math.min(bar, sectionLabels.length - 1)]}{/if}
      </p>
      <span></span>
      {#each Array.from({ length: cols }, (_, c) => c) as c (c)}
        <span class="count" class:beat={c % 4 === 0} class:now={playhead === bar * 16 + c}>{c === 16 ? "1" : c % 4 === 0 ? c / 4 + 1 : COUNTS[c % 4]}</span>
      {/each}
      {#each voices as v (v.id)}
        <span class="name" title="{v.name}, pad {padLabel(v.midi)}">{v.name}</span>
        {#each Array.from({ length: cols }, (_, c) => c) as c (c)}
          {@const i = at.get(`${v.id}:${bar * 16 + c}`)}
          {@const t = i === undefined ? null : targets[i]}
          {@const vd = i === undefined ? null : verdict(i)}
          <span
            class="cell"
            class:beat={c % 4 === 0}
            class:now={playhead === bar * 16 + c}
            data-hit={t ? (t.accent ? "accent" : t.ghost ? "ghost" : "normal") : undefined}
            data-kind={vd?.kind}
            title={t ? `${v.name} on ${Math.floor(c / 4) + 1}${COUNTS[c % 4] ? ` ${COUNTS[c % 4]}` : ""}${t.accent ? ", accent" : t.ghost ? ", ghost note" : ""}${vd ? `: ${vd.word}` : ""}` : undefined}
          >
            {#if t}
              <span class="dot" aria-hidden="true">{vd ? vd.glyph : t.accent ? ">" : ""}</span>
              <span class="sr-only">{v.name}, beat {Math.floor(c / 4) + 1}{COUNTS[c % 4] ? ` ${COUNTS[c % 4]}` : ""}{t.accent ? ", accent" : t.ghost ? ", ghost note" : ""}{vd ? `, ${vd.word}` : ""}</span>
            {/if}
          </span>
        {/each}
      {/each}
    </div>
  {/each}
</div>

<style>
  .bar {
    display: grid;
    grid-template-columns: 3.4rem repeat(var(--cols), minmax(0, 1fr));
    gap: 2px;
    align-items: center;
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

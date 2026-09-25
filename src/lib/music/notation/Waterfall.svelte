<script lang="ts">
  import type { Score } from "@repo/music-core";
  import { bars, scoreGroups, selectedVoices, whiteKeyLayout } from "./groups";
  import type { GroupState } from "./NotationFrame.svelte";

  let {
    score,
    voiceIds,
    low,
    high,
    beat,
    lookaheadBeats = 8,
    groupStates = {},
    height = "min(44dvh, 22rem)",
  }: {
    score: Score;
    voiceIds?: string[] | null;
    low: number;
    high: number;
    /** Current position in beats, driven by the parent clock. */
    beat: number;
    lookaheadBeats?: number;
    groupStates?: Record<number, GroupState>;
    height?: string;
  } = $props();

  const keys = $derived(whiteKeyLayout(low, high));
  const voices = $derived(selectedVoices(score, voiceIds));
  // Hand decides colour and form; voices without a hand alternate so two lines still differ.
  const side = $derived(
    Object.fromEntries(
      voices.map((v, i) => [v.id, v.hand ?? (i % 2 === 0 ? "right" : "left")] as const),
    ),
  );
  const notes = $derived(
    scoreGroups(score, voiceIds).flatMap((g) =>
      g.notes
        .filter((n) => keys[n.midi])
        .map((n) => ({ ...n, group: g.index, side: side[n.voiceId] })),
    ),
  );
  // ponytail: filters every note per frame; window by index if scores get long.
  const visible = $derived(
    notes.filter(
      (n) => n.startBeat + n.durationBeats > beat - 0.5 && n.startBeat < beat + lookaheadBeats,
    ),
  );
  const lines = $derived(
    bars(score).filter((b) => b.startBeat > beat - 1 && b.startBeat < beat + lookaheadBeats),
  );
  const pct = (b: number) => `${(b / lookaheadBeats) * 100}%`;
  const legend = $derived(
    voices.some((v) => v.hand)
      ? [
          { side: "right", name: "Right hand" },
          { side: "left", name: "Left hand" },
        ].filter((l) => voices.some((v) => v.hand === l.side))
      : voices.slice(0, 2).map((v) => ({ side: side[v.id], name: v.name })),
  );
</script>

<div class="wf">
  <div class="lane" style:height aria-hidden="true">
    <div class="layer" style:transform="translateY({pct(beat)})">
      {#each lines as l (l.number)}
        <div class="barline" style:bottom={pct(l.startBeat)}></div>
      {/each}
      {#each visible as n (`${n.voiceId}:${n.startBeat}:${n.midi}`)}
        {@const k = keys[n.midi]}
        <div
          class="note {n.side}"
          class:black={k.black}
          data-state={groupStates[n.group]}
          style:left="{k.x * 100}%"
          style:width="{k.width * 100}%"
          style:bottom={pct(n.startBeat)}
          style:height={pct(n.durationBeats)}
        ></div>
      {/each}
    </div>
    <div class="hit"></div>
  </div>
  <ul class="legend">
    {#each legend as l (l.side)}
      <li><span class="swatch {l.side}"></span>{l.name}: {l.side === "right" ? "filled" : "outlined"}</li>
    {/each}
  </ul>
</div>

<style>
  .wf {
    min-width: 0;
  }
  .lane {
    position: relative;
    overflow: hidden;
    background: var(--ws-surface, transparent);
    border-bottom: 2px solid var(--ws-ink, currentColor);
  }
  .layer {
    position: absolute;
    inset: 0;
    will-change: transform;
  }
  .barline {
    position: absolute;
    left: 0;
    right: 0;
    height: 1px;
    background: var(--ws-line, currentColor);
  }
  .note {
    position: absolute;
    box-sizing: border-box;
    border-radius: 4px;
    padding: 0 1px;
    background-clip: content-box;
    min-height: 6px;
  }
  .note.right {
    background-color: var(--hand-right);
  }
  .note.left {
    border: 2px solid var(--hand-left);
    background-color: color-mix(in oklab, var(--hand-left) 25%, transparent);
  }
  .note.black {
    z-index: 1;
  }
  .note[data-state="active"] {
    outline: 2px solid var(--instr-ink, currentColor);
    outline-offset: 1px;
  }
  .note[data-state="correct"] {
    opacity: 0.45;
  }
  .note[data-state="wrong"] {
    outline: 2px dashed var(--destructive);
  }
  .note[data-state="missed"] {
    opacity: 0.25;
  }
  .hit {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 3px;
    background: var(--instr-ink, currentColor);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    margin: 0.375rem 0 0;
    padding: 0;
    list-style: none;
    font-size: 0.8125rem;
    color: var(--ws-soft, inherit);
  }
  .legend li {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }
  .swatch {
    width: 0.875rem;
    height: 0.875rem;
    border-radius: 3px;
    box-sizing: border-box;
  }
  .swatch.right {
    background: var(--hand-right);
  }
  .swatch.left {
    border: 2px solid var(--hand-left);
  }
</style>

<script lang="ts">
  // A small piano-roll picture of a score: pitch up, time across, one colour
  // per hand (filled right, outlined left) so two voices still read apart.
  import type { Score } from "@repo/music-core";

  let { score, height = 72 }: { score: Score; height?: number } = $props();

  const notes = $derived(
    score.voices.flatMap((v, i) =>
      v.notes.filter((n) => !n.tieFrom).map((n) => ({ ...n, side: v.hand ?? (i % 2 ? "left" : "right") })),
    ),
  );
  const lo = $derived(Math.min(...notes.map((n) => n.midi), 60) - 1);
  const hi = $derived(Math.max(...notes.map((n) => n.midi), 72) + 1);
  const len = $derived(Math.max(4, score.lengthBeats));
</script>

<svg viewBox="0 0 {len} {hi - lo}" preserveAspectRatio="none" style:height="{height}px" class="block w-full" aria-hidden="true">
  {#each notes as n, i (i)}
    <rect
      x={n.startBeat}
      y={hi - n.midi - 1}
      width={Math.max(0.12, n.durationBeats - 0.06)}
      height="1"
      rx="0.2"
      class={n.side}
      vector-effect="non-scaling-stroke"
    />
  {/each}
</svg>

<style>
  .right {
    fill: var(--hand-right);
  }
  .left {
    fill: color-mix(in oklab, var(--hand-left) 30%, transparent);
    stroke: var(--hand-left);
    stroke-width: 1.5px;
  }
</style>

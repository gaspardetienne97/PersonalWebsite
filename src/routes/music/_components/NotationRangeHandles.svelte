<script lang="ts">
  import {
    barRangeOf,
    type ScoreSelectionBoundary,
  } from "@repo/music-core/engines/score-practice";

  import { rangeHandles, type BeatRange, type NotationHitTarget } from "./notation-selection";

  // The two ends of the practice range, drawn on the notation overlay. Colour
  // never carries the meaning on its own: each handle also says Start or End,
  // sits at its end of the range, and names its bar to a screen reader.
  let {
    selection,
    pendingStart,
    targets,
    measureBoundaries = [],
  }: {
    selection?: BeatRange;
    pendingStart?: BeatRange;
    targets: NotationHitTarget[];
    measureBoundaries?: ScoreSelectionBoundary[];
  } = $props();

  const handles = $derived.by(() => {
    const range = pendingStart ?? selection;
    if (!range) return [];
    const { startBar, endBar } = barRangeOf(range, measureBoundaries);
    return rangeHandles(range, targets)
      .filter(({ edge }) => !pendingStart || edge === "start")
      .map((handle) => ({
        ...handle,
        label: handle.edge === "start" ? "Start" : "End",
        bar: handle.edge === "start" ? startBar : endBar,
        hint: Boolean(pendingStart),
      }));
  });

</script>

<div class="pointer-events-none absolute inset-0 overflow-hidden rounded-md">
  {#each handles as handle (handle.edge)}
    <span
      data-range-handle={handle.edge}
      role="img"
      aria-label="{handle.label} of the practice range, bar {handle.bar}"
      class="absolute w-1 rounded-full {handle.edge === 'start'
        ? 'bg-range-start'
        : 'bg-range-end'}"
      style:left="{handle.left - 2}px"
      style:top="{handle.top - 6}px"
      style:height="{handle.height + 12}px"
    >
      <span
        class="absolute top-0 rounded border bg-background px-1 text-[0.6875rem] font-semibold leading-4 whitespace-nowrap text-foreground {handle.edge ===
        'start'
          ? 'left-2 border-range-start'
          : 'right-2 border-range-end'}"
      >
        {handle.label}
      </span>
      {#if handle.hint}
        <span
          class="absolute top-5 left-2 rounded border bg-background px-1 text-[0.6875rem] leading-4 whitespace-nowrap text-muted-foreground"
        >
          Now tap the end bar
        </span>
      {/if}
    </span>
  {/each}
</div>

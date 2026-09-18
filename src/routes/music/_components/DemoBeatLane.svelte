<script lang="ts">
  // One cell per beat, per hand: what lands together and in what order, before
  // the first attempt (review 21 O06). Layout only — the route owns the beats,
  // which one is sounding, and which ones the hands missed each other on.
  let {
    beats,
    current = -1,
    apart = [],
    label = "Beat lane",
  }: {
    /** One entry per beat, in order: which hand sounds on it. */
    beats: { left: boolean; right: boolean }[];
    /** Index of the beat sounding right now; -1 when nothing is. */
    current?: number;
    /** Beats where the two hands did not land inside the together window. */
    apart?: boolean[];
    label?: string;
  } = $props();

  const APART_SPOKEN = 8;
  const apartCells = $derived(apart.flatMap((flag, index) => (flag ? [index + 1] : [])));
  const apartSentence = $derived.by(() => {
    if (apartCells.length === 0) return "";
    const spoken = apartCells.slice(0, APART_SPOKEN).join(", ");
    const rest = apartCells.length - APART_SPOKEN;
    return ` Hands apart on cell ${spoken}${rest > 0 ? `, and ${rest} more` : ""}.`;
  });
  // A hand that plays nothing gets no row, so a one-hand drill shows one lane.
  const rows = $derived(
    (["left", "right"] as const).filter((hand) => beats.some((beat) => beat[hand])),
  );
  const rowsSentence = $derived(
    rows.length === 2 ? "left hand above right hand" : `${rows[0] ?? "no"} hand only`,
  );

  function cell(hand: "left" | "right", on: boolean): string {
    if (hand === "left") {
      return on ? "border-hand-left bg-hand-left/25" : "border-border/60";
    }
    return on ? "border-hand-right bg-hand-right" : "border-border/60";
  }
</script>

<div class="grid min-w-0 gap-1" role="group" aria-label={label}>
  {#each rows as hand (hand)}
    <div class="flex min-w-0 gap-1" data-hand={hand} aria-hidden="true">
      {#each beats as beat, index (index)}
        <span
          data-beat={index}
          data-on={beat[hand]}
          data-current={index === current}
          data-apart={apart[index] === true}
          class="h-3 min-w-1.5 flex-1 rounded-sm border {cell(hand, beat[hand])} {index === current
            ? 'ring-2 ring-practice-accent'
            : ''} {apart[index] ? 'outline outline-2 outline-offset-1 outline-destructive' : ''}"
        ></span>
      {/each}
    </div>
  {/each}
  <!-- "cells, one per onset": these patterns place onsets on eighths, so a cell is not always a beat. -->
  <p class="sr-only">{label}: {beats.length} cells, one per onset, {rowsSentence}.{apartSentence}</p>
</div>

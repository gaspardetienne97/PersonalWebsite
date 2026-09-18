<script lang="ts">
  import { buildTakeRoll, type Take } from "@repo/music-core/engines/recording";

  let {
    take,
    class: className = "h-10 w-full",
  }: {
    take: Take;
    class?: string;
  } = $props();

  const roll = $derived(buildTakeRoll(take));
  // Thin registers would otherwise render sub-pixel rows.
  const MIN_NOTE_HEIGHT = 2;

  function geometry(note: (typeof roll.notes)[number]) {
    const height = Math.max(MIN_NOTE_HEIGHT, note.height * 100);
    return {
      x: note.x * 100,
      y: Math.min(100 - height, note.y * 100),
      width: note.width * 100,
      height,
    };
  }
</script>

<svg
  class={["rounded-md border bg-muted/30", className]}
  viewBox="0 0 100 100"
  preserveAspectRatio="none"
  role="img"
  data-take-roll={take.id}
  aria-label={`Piano roll of ${take.name}: ${take.notes.length} ${take.notes.length === 1 ? "note" : "notes"} between MIDI ${roll.lowMidi} and ${roll.highMidi}`}
>
  {#if roll.middleCY !== undefined}
    <line
      x1="0"
      x2="100"
      y1={roll.middleCY * 100}
      y2={roll.middleCY * 100}
      class="stroke-border"
      stroke-dasharray="4 4"
      vector-effect="non-scaling-stroke"
    />
  {/if}
  {#each roll.notes as note, index (index)}
    {@const box = geometry(note)}
    <rect
      x={box.x}
      y={box.y}
      width={box.width}
      height={box.height}
      class={note.hand === "left" ? "fill-hand-left" : "fill-hand-right"}
    />
  {/each}
</svg>

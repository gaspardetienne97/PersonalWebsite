<script lang="ts">
  import { fingeringForMidi } from "@repo/music-core/engines/aerophone-fingering";
  import { midiToNote } from "@repo/music-core/engines/theory";

  import { AEROPHONE_PARTS, AEROPHONE_VIEWBOX } from "./aerophone-art";

  let {
    midi,
    label,
    size = 200,
    class: cls = "",
  }: {
    midi: number;
    /** Override the note label (defaults to the note name for `midi`). */
    label?: string;
    size?: number;
    class?: string;
  } = $props();

  const fingering = $derived(fingeringForMidi(midi));
  const pressed = $derived(new Set(fingering.keys));
  const noteLabel = $derived(label ?? midiToNote(midi));
  const height = $derived((size * AEROPHONE_VIEWBOX.height) / AEROPHONE_VIEWBOX.width);

  // Flat theme fills: body in muted, dark outlines in muted-foreground, key faces
  // in card (off) or primary (pressed) so each key highlights on its own.
  function fillClass(part: (typeof AEROPHONE_PARTS)[number]): string {
    if (part.r === "body") return "fill-muted";
    if (part.r === "outline") return "fill-muted-foreground";
    return part.k && pressed.has(part.k) ? "fill-primary" : "fill-card";
  }
</script>

<figure class="inline-flex flex-col items-center gap-1.5 {cls}">
  <svg
    width={size}
    {height}
    viewBox="{AEROPHONE_VIEWBOX.x} {AEROPHONE_VIEWBOX.y} {AEROPHONE_VIEWBOX.width} {AEROPHONE_VIEWBOX.height}"
    role="img"
    aria-label={fingering.inRange
      ? `${noteLabel} Aerophone fingering`
      : `${noteLabel} is outside the charted range`}
  >
    {#each AEROPHONE_PARTS as part, i (i)}
      <path d={part.d} class={fillClass(part)} />
    {/each}
  </svg>

  <figcaption class="text-sm font-bold tabular-nums">
    {noteLabel}
    {#if fingering.octave}
      <span class="ml-1 align-middle text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
        >8va</span
      >
    {/if}
  </figcaption>
</figure>

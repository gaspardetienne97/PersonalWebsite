<script lang="ts">
  import { fingeringForMidi } from "@repo/music-core/engines/aerophone-fingering";
  import { midiToNote } from "@repo/music-core/engines/theory";

  import {
    AEROPHONE_BODY_PATHS,
    AEROPHONE_KEY_CENTERS,
    AEROPHONE_TRANSFORM,
    AEROPHONE_VIEWBOX,
  } from "./aerophone-art";

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
  const noteLabel = $derived(label ?? midiToNote(midi));
  const height = $derived((size * AEROPHONE_VIEWBOX.height) / AEROPHONE_VIEWBOX.width);
  // The pressed keys, resolved to their highlight-blob geometry.
  const blobs = $derived(
    fingering.keys.map((id) => AEROPHONE_KEY_CENTERS[id]).filter(Boolean),
  );
</script>

<figure class="inline-flex flex-col items-center gap-1.5 {cls}">
  <svg
    width={size}
    {height}
    viewBox="0 0 {AEROPHONE_VIEWBOX.width} {AEROPHONE_VIEWBOX.height}"
    role="img"
    aria-label={fingering.inRange
      ? `${noteLabel} Aerophone fingering`
      : `${noteLabel} is outside the charted range`}
  >
    <!-- Pressed-key highlights, behind the traced outlines so the rim stays crisp -->
    {#each blobs as b, i (i)}
      <circle cx={b.cx} cy={b.cy} r={b.r} class="fill-primary" />
    {/each}

    <!-- Authentic instrument traced from the Roland AE app (recoloured to theme) -->
    <g
      transform={AEROPHONE_TRANSFORM}
      class="text-muted-foreground"
      fill="currentColor"
      stroke="none"
    >
      {#each AEROPHONE_BODY_PATHS as d, i (i)}
        <path {d} />
      {/each}
    </g>
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

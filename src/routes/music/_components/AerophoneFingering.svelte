<script lang="ts">
  import {
    AEROPHONE_KEYS,
    AEROPHONE_VIEWBOX,
    fingeringForMidi,
  } from "@repo/music-core/engines/aerophone-fingering";
  import { midiToNote } from "@repo/music-core/engines/theory";

  let {
    midi,
    label,
    size = 150,
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
    <!-- Instrument body -->
    <path
      d="M62 8 q16 -6 28 0 l4 22 q6 14 4 34 l-2 230 q-2 22 -16 26 q-14 -4 -16 -26 l-2 -230 q-2 -20 4 -34 z"
      class="fill-muted stroke-border"
      stroke-width="2"
    />

    <!-- Octave key indicator (thumb rocker, engaged in the upper register) -->
    <g aria-hidden="true">
      <circle
        cx="34"
        cy="70"
        r="9"
        class={fingering.octave ? "fill-primary stroke-primary" : "fill-background stroke-border"}
        stroke-width="2"
      />
      <text
        x="34"
        y="73"
        text-anchor="middle"
        class="fill-muted-foreground text-[9px] font-bold"
        style={fingering.octave ? "fill:var(--primary-foreground)" : ""}>8</text
      >
    </g>

    <!-- Keys -->
    {#each AEROPHONE_KEYS as key (key.id)}
      {@const on = pressed.has(key.id)}
      {#if key.shape === "circle"}
        <circle
          cx={key.x}
          cy={key.y}
          r={key.size}
          class={on ? "fill-primary stroke-primary" : "fill-background stroke-border"}
          stroke-width="2"
        />
      {:else}
        <rect
          x={key.x - key.size * 1.4}
          y={key.y - key.size}
          width={key.size * 2.8}
          height={key.size * 2}
          rx={key.size}
          class={on ? "fill-primary stroke-primary" : "fill-background stroke-border"}
          stroke-width="1.5"
        />
      {/if}
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

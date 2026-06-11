<script lang="ts" module>
  import type { AerophoneKeyId } from "@repo/music-core/engines/aerophone-fingering";

  type Circle = { id?: AerophoneKeyId; cx: number; cy: number; r: number };
  type Rect = { id?: AerophoneKeyId; x: number; y: number; w: number; h: number; rot?: number };

  // Geometry traced from the Roland AE app fingering screen (portrait body).
  // viewBox 0 0 300 660. `id`-bearing shapes are the keys a fingering can press;
  // the rest are drawn as outlines for fidelity.

  const BODY =
    "M150 8 C160 8 165 14 165 24 L170 80 C176 104 200 110 210 138 " +
    "C222 172 224 220 220 274 C216 340 210 410 197 476 " +
    "C189 524 178 560 150 586 C120 612 92 632 70 650 L60 645 " +
    "C82 590 90 524 94 462 C99 402 97 344 96 286 " +
    "C95 224 92 162 108 126 C120 100 138 94 140 72 L145 24 C145 14 142 8 150 8 Z";

  // Main tone keys (6) + the small bis-Bb aux key.
  const TONE_KEYS: Circle[] = [
    { id: "k1", cx: 150, cy: 222, r: 16 },
    { id: "k2", cx: 150, cy: 288, r: 16 },
    { id: "k3", cx: 167, cy: 322, r: 16 },
    { id: "k4", cx: 142, cy: 388, r: 16 },
    { id: "k5", cx: 139, cy: 428, r: 16 },
    { id: "k6", cx: 134, cy: 470, r: 16 },
    { id: "bisBb", cx: 150, cy: 256, r: 8 },
  ];

  // Side / pinky keys (rounded rects).
  const PAD_KEYS: Rect[] = [
    // right-hand side keys (upper-right of the tone column)
    { id: "sideBb", x: 188, y: 350, w: 30, h: 15, rot: -22 },
    { id: "sideC", x: 214, y: 372, w: 26, h: 14, rot: -22 },
    { id: "sideE", x: 236, y: 392, w: 24, h: 14, rot: -22 },
    // left-hand pinky table (G#, low C#, B, Bb) + right-hand spatulas (Eb, low C)
    { id: "gsharp", x: 100, y: 398, w: 26, h: 14, rot: -28 },
    { id: "lowCsharp", x: 82, y: 432, w: 26, h: 14, rot: -28 },
    { id: "lowB", x: 96, y: 462, w: 26, h: 14, rot: -28 },
    { id: "lowBb", x: 78, y: 492, w: 26, h: 14, rot: -28 },
    { id: "eb", x: 104, y: 516, w: 26, h: 14, rot: -28 },
    { id: "lowC", x: 86, y: 544, w: 26, h: 14, rot: -28 },
  ];

  // Decorative-only outlines (never highlighted): left palm crescents, left side
  // keys, the front key above the index, and the upper-right side keys.
  const DECOR_PATHS = [
    "M52 168 q14 -10 26 -2 q-12 4 -26 2 Z",
    "M52 192 q15 -10 27 -2 q-12 4 -27 2 Z",
    "M56 216 q15 -10 27 -2 q-12 4 -27 2 Z",
  ];
  const DECOR_RECTS: Rect[] = [
    { x: 56, y: 262, w: 20, h: 16, rot: -10 },
    { x: 64, y: 292, w: 18, h: 14, rot: -6 },
    { x: 64, y: 314, w: 18, h: 14, rot: -6 },
    { x: 140, y: 182, w: 22, h: 40 }, // front key above the index
    { x: 224, y: 208, w: 22, h: 34 },
    { x: 232, y: 252, w: 20, h: 34 },
  ];
  const DECOR_CIRCLES: Circle[] = [{ cx: 168, cy: 360, r: 10 }];
</script>

<script lang="ts">
  import { fingeringForMidi } from "@repo/music-core/engines/aerophone-fingering";
  import { midiToNote } from "@repo/music-core/engines/theory";

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
  const height = $derived((size * 660) / 300);

  function on(id?: AerophoneKeyId): boolean {
    return id !== undefined && pressed.has(id);
  }
</script>

<figure class="inline-flex flex-col items-center gap-1.5 {cls}">
  <svg
    width={size}
    {height}
    viewBox="0 0 300 660"
    role="img"
    aria-label={fingering.inRange
      ? `${noteLabel} Aerophone fingering`
      : `${noteLabel} is outside the charted range`}
  >
    <!-- Instrument body (line art) -->
    <path d={BODY} class="fill-card stroke-muted-foreground/60" stroke-width="2.5" stroke-linejoin="round" />

    <!-- Decorative outlines -->
    {#each DECOR_PATHS as d, i (i)}
      <path {d} class="fill-none stroke-muted-foreground/45" stroke-width="2" />
    {/each}
    {#each DECOR_RECTS as r, i (i)}
      <rect
        x={r.x}
        y={r.y}
        width={r.w}
        height={r.h}
        rx="6"
        transform={r.rot ? `rotate(${r.rot} ${r.x + r.w / 2} ${r.y + r.h / 2})` : undefined}
        class="fill-background stroke-muted-foreground/45"
        stroke-width="2"
      />
    {/each}
    {#each DECOR_CIRCLES as c, i (i)}
      <circle cx={c.cx} cy={c.cy} r={c.r} class="fill-background stroke-muted-foreground/45" stroke-width="2" />
    {/each}

    <!-- Pad / side keys -->
    {#each PAD_KEYS as r (r.id)}
      <rect
        x={r.x}
        y={r.y}
        width={r.w}
        height={r.h}
        rx="6"
        transform={r.rot ? `rotate(${r.rot} ${r.x + r.w / 2} ${r.y + r.h / 2})` : undefined}
        class={on(r.id) ? "fill-primary stroke-primary" : "fill-background stroke-muted-foreground"}
        stroke-width="2"
      />
    {/each}

    <!-- Tone keys -->
    {#each TONE_KEYS as c (c.id)}
      <circle
        cx={c.cx}
        cy={c.cy}
        r={c.r}
        class={on(c.id) ? "fill-primary stroke-primary" : "fill-background stroke-muted-foreground"}
        stroke-width="2.5"
      />
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

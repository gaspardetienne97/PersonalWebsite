<script lang="ts" module>
  // The AE-20 seen from the front, mouthpiece to foot (neck and foot
  // shortened so the keys read larger), laid out from Roland's product photo.
  // Seen from the front, the player's right is on the left: the right palm's
  // side keys C3/Tc/Ta run down the left edge, the left palm keys C1/C2/C4 up
  // the right; the left pinky table sits beside key 3, C5/Tf/Eb/C under the
  // right hand. The four octave keys are under the left thumb on the back,
  // drawn as crescents off the left edge the way Roland's own app draws them.
  type Hand = "left" | "right" | "thumb";
  type Key =
    | { id: string; hand: Hand; c: [number, number]; r: number }
    | { id: string; hand: Hand; c: [number, number]; w: number; h: number; rot?: number; taper?: boolean }
    | { id: string; hand: Hand; c: [number, number]; crescent: number };
  const KEYS: Key[] = [
    { id: "X", hand: "left", c: [109, 269], w: 22, h: 32 },
    { id: "k1", hand: "left", c: [109, 300], r: 15 },
    { id: "P", hand: "left", c: [107, 326], r: 10 },
    { id: "k2", hand: "left", c: [108, 356], r: 15 },
    { id: "k3", hand: "left", c: [126, 381], r: 15 },
    { id: "C1", hand: "left", c: [181, 290], w: 23, h: 28 },
    { id: "C2", hand: "left", c: [197, 312], w: 14, h: 26 },
    { id: "C4", hand: "left", c: [181, 342], w: 23, h: 29 },
    { id: "Gs", hand: "left", c: [149, 408], w: 49, h: 22, rot: -6 },
    { id: "Cs", hand: "left", c: [149, 443], w: 24, h: 22, rot: -14 },
    { id: "B", hand: "left", c: [174, 428], w: 23, h: 21, rot: -14 },
    { id: "Bb", hand: "left", c: [173, 458], w: 47, h: 21, rot: -16 },
    { id: "C3", hand: "right", c: [42, 361], w: 24, h: 31, taper: true },
    { id: "Tc", hand: "right", c: [46, 400], w: 18, h: 27 },
    { id: "Ta", hand: "right", c: [46, 434], w: 18, h: 28 },
    { id: "k4", hand: "right", c: [97, 446], r: 15 },
    { id: "C5", hand: "right", c: [71, 476], w: 15, h: 30 },
    { id: "k5", hand: "right", c: [100, 490], r: 15 },
    { id: "Tf", hand: "right", c: [63, 513], w: 36, h: 20, rot: 22 },
    { id: "k6", hand: "right", c: [94, 542], r: 15 },
    { id: "Eb", hand: "right", c: [64, 566], w: 36, h: 20, rot: 22 },
    { id: "C", hand: "right", c: [52, 590], w: 36, h: 20, rot: 22 },
    { id: "oct+2", hand: "thumb", c: [30, 212], crescent: 1.1 },
    { id: "oct+1", hand: "thumb", c: [26, 241], crescent: 1.3 },
    { id: "oct-1", hand: "thumb", c: [26, 291], crescent: 1.3 },
    { id: "oct-2", hand: "thumb", c: [30, 320], crescent: 1.1 },
  ];
  const MAIN = new Set(["k1", "k2", "k3", "k4", "k5", "k6"]);
  /** A crescent bowed to the left, `s` its scale. */
  const crescent = ([x, y]: [number, number], s: number) =>
    `M${x + 14 * s},${y - 9 * s} Q${x - 18 * s},${y} ${x + 14 * s},${y + 9 * s} Q${x - 1 * s},${y} ${x + 14 * s},${y - 9 * s} Z`;
  /** A key as a path: a rectangle, or a trapezoid narrowing at the bottom, its corners rounded by `r`. */
  const block = ([x, y]: [number, number], w: number, h: number, taper = false, r = 4) => {
    const i = taper ? 5 : 0;
    const pts: [number, number][] = [
      [x - w / 2, y - h / 2],
      [x + w / 2, y - h / 2],
      [x + w / 2 - i, y + h / 2],
      [x - w / 2 + i, y + h / 2],
    ];
    // Each corner: stop r short of it, curve round it, carry on r past it.
    const toward = (a: [number, number], b: [number, number]) => {
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      return [a[0] + ((b[0] - a[0]) * r) / d, a[1] + ((b[1] - a[1]) * r) / d];
    };
    return (
      pts
        .map((p, k) => {
          const [ax, ay] = toward(p, pts[(k + 3) % 4]);
          const [bx, by] = toward(p, pts[(k + 1) % 4]);
          return `${k ? "L" : "M"}${ax},${ay} Q${p[0]},${p[1]} ${bx},${by}`;
        })
        .join(" ") + " Z"
    );
  };
</script>

<script lang="ts">
  // The fingering for `midi` pressed on the AE-20 (sax fingering mode,
  // written pitch), each key lit in its hand's colour; a key down that the
  // note does not use (from `heldMidi`) shows red.
  import fingerings from "@repo/music-core/data/aerophone-fingerings.json";
  import { noteName } from "@repo/music-core";
  import { fingeringFor as chartEntry } from "@repo/music-core/content/winds-pads";

  interface Props {
    midi: number | null;
    /** The note sounding now: keys it uses that the target does not show red. */
    heldMidi?: number | null;
    label?: string;
    compact?: boolean;
  }
  let { midi, heldMidi = null, label, compact = false }: Props = $props();
  const uid = $props.id();

  type Fingering = { keys: string[]; octave: boolean };
  const fingeringFor = (m: number | null) =>
    m === null ? null : ((fingerings.fingeringsByMidi as Record<string, Fingering>)[m] ?? null);
  const target = $derived(fingeringFor(midi));
  const held = $derived(fingeringFor(heldMidi));
  const keyLabel = (id: string) => fingerings.keys.find((k) => k.id === id)?.label ?? id;
  const pressed = (id: string, f: Fingering | null) => !!f && (id === "oct+1" ? f.octave : f.keys.includes(id));
  const description = $derived(
    midi === null
      ? "No note"
      : target
        ? `${chartEntry(midi)?.name ?? noteName(midi)}: ${[target.octave ? keyLabel("oct+1") : "", ...target.keys.map(keyLabel)].filter(Boolean).join(", ") || "all keys open"}`
        : `${noteName(midi, "flat")}: outside the charted range, Bb3 to C#6`,
  );
</script>

<figure class="flex w-full flex-col items-center gap-2" class:max-w-52={compact} class:max-w-64={!compact}>
  <svg viewBox="0 0 224 820" class="h-auto max-h-[36rem] w-full" role="img" aria-label={label ?? `Fingering for ${description}`}>
    <defs>
      <linearGradient id="{uid}-col" x1="0" x2="1">
        <stop offset="0" stop-color="oklch(0.84 0.01 290)" />
        <stop offset="0.35" stop-color="oklch(0.985 0.004 290)" />
        <stop offset="1" stop-color="oklch(0.84 0.01 290)" />
      </linearGradient>
      <linearGradient id="{uid}-wing" x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0" stop-color="oklch(0.42 0.1 195)" />
        <stop offset="0.55" stop-color="oklch(0.36 0.11 265)" />
        <stop offset="1" stop-color="oklch(0.32 0.12 305)" />
      </linearGradient>
      <linearGradient id="{uid}-mp" x1="0" x2="1">
        <stop offset="0" stop-color="oklch(0.12 0.01 290)" />
        <stop offset="0.4" stop-color="oklch(0.36 0.012 290)" />
        <stop offset="1" stop-color="oklch(0.12 0.01 290)" />
      </linearGradient>
    </defs>
    <!-- The wings, the white column over them, then the mouthpiece and its ring. -->
    <path
      class="wing"
      fill="url(#{uid}-wing)"
      d="M86,140 C70,150 54,170 52,200 L50,470 L5,604 Q1,615 8,624 L84,772 L150,792 L168,772 L221,500 Q224,490 220,481 L185,352 L179,205 C175,170 161,150 148,140 Z"
    />
    <rect x="85" y="84" width="65" height="726" rx="31" fill="url(#{uid}-col)" class="column" />
    <path d="M106.5,6 Q117.5,1 128.5,6 L138.5,76 L96.5,76 Z" fill="url(#{uid}-mp)" />
    <rect x="94" y="74" width="47" height="11" rx="3" class="ring" />
    {#each KEYS as k (k.id)}
      {@const on = pressed(k.id, target)}
      {@const wrong = pressed(k.id, held) && !on}
      <path
        d={"crescent" in k ? crescent(k.c, k.crescent) : "r" in k ? `M${k.c[0] - k.r},${k.c[1]} a${k.r},${k.r} 0 1,0 ${2 * k.r},0 a${k.r},${k.r} 0 1,0 ${-2 * k.r},0` : block(k.c, k.w, k.h, k.taper)}
        transform={"rot" in k && k.rot ? `rotate(${k.rot} ${k.c[0]} ${k.c[1]})` : undefined}
        class="key"
        data-key={k.id}
        data-hand={k.hand}
        data-on={on || undefined}
        data-held={wrong || undefined}
      />
      {#if MAIN.has(k.id)}
        <text x={k.c[0]} y={k.c[1] + 4.5} class="num" class:lit={on || wrong}>{k.id.slice(1)}</text>
      {/if}
    {/each}
  </svg>
  <ul class="legend" aria-label="Key colours">
    <li><span style:--c="var(--ae-left)"></span>Left hand</li>
    <li><span style:--c="var(--ae-right)"></span>Right hand</li>
    <li><span style:--c="var(--ae-thumb)"></span>Left thumb, on the back</li>
  </ul>
  <!-- Which finger goes where, as Roland's lessons label the target keys. -->
  <figcaption class="text-center text-ws-stage-soft" class:text-xs={compact} class:text-sm={!compact}>{description}</figcaption>
</figure>

<style>
  figure {
    --ae-left: oklch(0.82 0.16 70);
    --ae-right: oklch(0.78 0.15 215);
    --ae-thumb: oklch(0.74 0.18 305);
  }
  .wing {
    stroke: oklch(0.62 0.09 250);
    stroke-width: 1.5;
    stroke-linejoin: round;
  }
  .column {
    stroke: oklch(0.7 0.01 290);
    stroke-width: 1;
  }
  .ring {
    fill: oklch(0.8 0.01 290);
  }
  /* Idle keys carry their hand's colour, deep; pressed ones light it fully. */
  .key {
    fill: oklch(from var(--c) 0.42 calc(c * 0.6) h);
    stroke: oklch(from var(--c) 0.86 calc(c * 0.8) h);
    stroke-width: 2.5;
    stroke-linejoin: round;
    transition:
      fill 90ms,
      filter 90ms;
  }
  .key[data-hand="left"] {
    --c: var(--ae-left);
  }
  .key[data-hand="right"] {
    --c: var(--ae-right);
  }
  .key[data-hand="thumb"] {
    --c: var(--ae-thumb);
  }
  .key[data-on] {
    fill: var(--c);
    stroke: white;
    filter: drop-shadow(0 0 7px var(--c));
  }
  .key[data-held] {
    fill: var(--destructive);
    stroke: white;
  }
  .num {
    fill: oklch(0.95 0.01 290);
    font-size: 12px;
    font-weight: 700;
    text-anchor: middle;
    pointer-events: none;
  }
  .num.lit {
    fill: oklch(0.2 0.01 290);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.25rem 0.75rem;
    font-size: 0.7rem;
    color: var(--ws-stage-soft);
  }
  .legend li {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }
  .legend span {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 999px;
    background: var(--c);
  }
  @media (prefers-reduced-motion: reduce) {
    .key {
      transition: none;
    }
  }
</style>

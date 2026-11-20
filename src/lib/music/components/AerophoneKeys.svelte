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
  /** Short names drawn on the side and palm keys (the main six carry their number). */
  const SHORT: Record<string, string> = { Gs: "G#", Cs: "C#", Bb: "Bb", B: "B", Eb: "Eb", C: "C", C1: "C1", C2: "C2", C3: "C3", C4: "C4", C5: "C5", Tc: "Tc", Ta: "Ta", Tf: "Tf", X: "X", P: "P" };
  /** The octave keys by the step they move. */
  const OCT: Record<string, string> = { "oct+2": "+2", "oct+1": "+1", "oct-1": "\u22121", "oct-2": "\u22122" };
  /** The drawing is cropped to the keys (mouthpiece and foot left out) so their names read at 13 px or more. */
  const VIEW_TOP = 199;
  const VIEW_H = 410;
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
  // The fingering for concert `midi` pressed on the AE-20 (sax fingering
  // mode), each key lit in its hand's colour; a key down that the note does
  // not use (from `heldMidi`) shows red. The player fingers the written note,
  // so both are looked up at the reading key's written pitch.
  import { noteName } from "@repo/music-core";
  import { fingeringWords } from "#lib/music/drills/aerophone/names.ts";
  import { fingeringFor as chartEntry } from "@repo/music-core/content/winds-pads";
  import { writtenOffset } from "@repo/music-core/theory/transposition";
  import { settings } from "#lib/music/runtime/index.ts";

  interface Props {
    midi: number | null;
    /** The note sounding now: keys it uses that the target does not show red. */
    heldMidi?: number | null;
    label?: string;
    compact?: boolean;
    /** How the drill spells a concert note (by its key), so the caption agrees with its chips; the chart's spelling by default. */
    name?: (concert: number) => string;
  }
  let { midi: concert, heldMidi: heldConcert = null, label, compact = false, name }: Props = $props();
  const shift = $derived(writtenOffset("aerophone", settings.value));
  const midi = $derived(concert === null ? null : concert + shift);
  const heldMidi = $derived(heldConcert === null ? null : heldConcert + shift);
  const uid = $props.id();

  type Fingering = { keys: string[]; octave: boolean };
  // The chart's entry: the verified data, then the palm keys beside it.
  const fingeringFor = (m: number | null): Fingering | null => (m === null ? null : (chartEntry(m) ?? null));
  const target = $derived(fingeringFor(midi));
  const held = $derived(fingeringFor(heldMidi));
  const pressed = (id: string, f: Fingering | null) => !!f && (id === "oct+1" ? f.octave : f.keys.includes(id));
  const description = $derived(
    midi === null
      ? "No note"
      : target
        ? `${name && concert !== null ? name(concert) : (chartEntry(midi)?.name ?? noteName(midi))}: ${fingeringWords(midi)}`
        : `${noteName(midi, "flat")}: outside the charted range, Bb3 to F#6`,
  );
</script>

<!-- Compact is the narrowest the key names stay at 13 px or more (15 px labels at 196 / 224 scale). -->
<figure class="flex w-full flex-col items-center gap-2 {compact ? 'max-w-[12.25rem]' : 'max-w-64'}">
  <svg viewBox="0 {VIEW_TOP} 224 {VIEW_H}" class="h-auto w-full {compact ? 'max-h-[26rem]' : 'max-h-[36rem]'}" role="img" aria-label={label ?? `Fingering for ${description}`}>
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
        <text x={k.c[0]} y={k.c[1] + 6} class="num" class:lit={on || wrong}>{k.id.slice(1)}</text>
      {:else if SHORT[k.id]}
        {@const turn = "w" in k && k.w < 17 ? -90 : "rot" in k ? (k.rot ?? 0) : 0}
        <!-- Narrow tall keys (C2, C5) carry their name up the key so it stays inside. -->
        <text x={k.c[0]} y={k.c[1] + 5} class="tag" class:lit={on || wrong} transform={turn ? `rotate(${turn} ${k.c[0]} ${k.c[1]})` : undefined}>{SHORT[k.id]}</text>
      {:else if "crescent" in k}
        <!-- The octave keys are on the back: their step beside the crescent, on the wing. -->
        <text x={k.c[0] + 31} y={k.c[1] + 5} class="tag">{OCT[k.id]}</text>
      {/if}
      {#if wrong}
        <!-- A key down that this fingering does not use: an X as well as red. -->
        <path class="cross" d="M{k.c[0] - 7},{k.c[1] - 7} L{k.c[0] + 7},{k.c[1] + 7} M{k.c[0] + 7},{k.c[1] - 7} L{k.c[0] - 7},{k.c[1] + 7}" />
      {/if}
    {/each}
  </svg>
  <ul class="legend" aria-label="Key colours">
    <li><span style:--c="var(--ae-left)"></span>Left hand</li>
    <li><span style:--c="var(--ae-right)"></span>Right hand</li>
    <li><span style:--c="var(--ae-thumb)"></span>Left thumb, on the back</li>
    {#if KEYS.some((k) => pressed(k.id, held) && !pressed(k.id, target))}
      <li><span class="wrong-swatch"></span>X: pressed, not in this fingering</li>
    {/if}
  </ul>
  <!-- Which finger goes where, as Roland's lessons label the target keys. -->
  <figcaption class="text-center text-ws-stage-soft {compact ? 'text-[13px]' : 'text-sm'}">{description}</figcaption>
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
  /* A key held that the fingering does not use: red, with a dashed edge so colour is not the only cue. */
  .key[data-held] {
    fill: var(--destructive);
    stroke: white;
    stroke-dasharray: 4 3;
  }
  .wrong-swatch {
    background: var(--destructive) !important;
    outline: 1.5px dashed white;
  }
  .num {
    fill: oklch(0.95 0.01 290);
    font-size: 18px;
    font-weight: 700;
    text-anchor: middle;
    pointer-events: none;
  }
  .num.lit,
  .tag.lit {
    fill: oklch(0.2 0.01 290);
  }
  .tag {
    fill: oklch(0.95 0.01 290);
    font-size: 15px;
    font-weight: 700;
    text-anchor: middle;
    pointer-events: none;
  }
  .cross {
    stroke: white;
    stroke-width: 3;
    stroke-linecap: round;
    pointer-events: none;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.25rem 0.75rem;
    font-size: 0.8125rem;
    color: var(--ws-stage-ink);
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

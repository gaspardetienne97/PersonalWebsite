<script lang="ts">
  // The circle of fifths as a wheel: major keys outside (C at the top, a
  // fifth clockwise, a fourth counter-clockwise), relative minors in the
  // middle ring, each key's diminished chord inside. Pick a key and its seven
  // chords light as one wedge, with their numerals; the centre names its
  // signature. Drills can blank keys out and mark answers.
  import { CIRCLE, keyAt, noteAtFifths, wheelIndex } from "@repo/music-core/theory/circle";

  let {
    selected = null,
    onpick,
    numerals = true,
    blank,
    marks = {},
    label = "Circle of fifths",
  }: {
    /** The picked key, by its fifths (-7..7); null for none. */
    selected?: number | null;
    onpick?: (fifths: number) => void;
    /** Numerals (I, ii, V...) on the picked key's chords. */
    numerals?: boolean;
    /** Wheel slots (0 = C, clockwise) whose major key is hidden behind a "?". */
    blank?: (slot: number) => boolean;
    /** Wheel slots marked after an answer. */
    marks?: Record<number, "right" | "wrong" | "lit">;
    label?: string;
  } = $props();

  const S = 360;
  const C = S / 2;
  const R = { outer: 172, major: 122, minor: 82, dim: 50 };
  const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const pt = (r: number, deg: number) => `${(C + r * Math.cos(rad(deg))).toFixed(2)} ${(C + r * Math.sin(rad(deg))).toFixed(2)}`;
  /** A ring segment from r0 to r1 around slot i (30 degrees wide). */
  const wedge = (i: number, r0: number, r1: number) => {
    const a = i * 30 - 15;
    const b = i * 30 + 15;
    return `M ${pt(r1, a)} A ${r1} ${r1} 0 0 1 ${pt(r1, b)} L ${pt(r0, b)} A ${r0} ${r0} 0 0 0 ${pt(r0, a)} Z`;
  };
  const at = (r: number, i: number) => {
    const [x, y] = pt(r, i * 30).split(" ").map(Number);
    return { x, y };
  };

  const sel = $derived(selected === null ? null : wheelIndex(selected));
  // The picked key's chords: outer IV I V, middle ii vi iii, inner vii°.
  const ROLE: Record<string, Record<number, string>> = {
    major: { [-1]: "IV", 0: "I", 1: "V" },
    minor: { [-1]: "ii", 0: "vi", 1: "iii" },
    dim: { 0: "vii°" },
  };
  const roleOf = (ring: "major" | "minor" | "dim", i: number) => {
    if (sel === null) return null;
    const d = ((i - sel + 18) % 12) - 6;
    return ROLE[ring][d] ?? null;
  };
  const picked = $derived(selected === null ? null : keyAt(selected));
  const SLOTS = Array.from({ length: 12 }, (_, i) => i);
</script>

<svg class="wheel" viewBox="0 0 {S} {S}" role="group" aria-label={label}>
  {#each SLOTS as i (i)}
    {@const k = CIRCLE[i]}
    {@const hidden = blank?.(i) ?? false}
    {@const mark = marks[i]}
    {@const p = at((R.major + R.outer) / 2 + 4, i)}
    {@const m = at((R.minor + R.major) / 2, i)}
    {@const d = at((R.dim + R.minor) / 2, i)}
    <!-- Outer ring: the major key. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -- the slot has role button whenever it is focusable (a pickable wheel) -->
    <g
      class="slot"
      class:in={roleOf("major", i) !== null}
      class:tonic={roleOf("major", i) === "I"}
      data-mark={mark}
      role={onpick ? "button" : undefined}
      tabindex={onpick ? 0 : undefined}
      aria-label={hidden ? `Slot ${i + 1}, hidden` : `${k.major} major${k.enharmonic ? ` (${k.enharmonic.major})` : ""}, ${k.fifths === 0 ? "no sharps or flats" : `${Math.abs(k.fifths)} ${k.fifths > 0 ? "sharp" : "flat"}${Math.abs(k.fifths) > 1 ? "s" : ""}`}`}
      aria-pressed={onpick ? sel === i : undefined}
      onclick={() => onpick?.(k.fifths)}
      onkeydown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onpick?.(k.fifths))}
    >
      <path class="ring major" d={wedge(i, R.major, R.outer)} />
      <text x={p.x} y={p.y - (roleOf("major", i) && numerals ? 6 : 0)} class="name">{hidden ? "?" : k.major}</text>
      {#if k.enharmonic && !hidden && !(numerals && roleOf("major", i))}<text x={p.x} y={p.y + 14} class="enh">{k.enharmonic.major}</text>{/if}
      {#if numerals && roleOf("major", i)}<text x={p.x} y={p.y + 12} class="numeral">{roleOf("major", i)}</text>{/if}
    </g>
    <!-- Middle ring: its relative minor. -->
    <path class="ring minor" class:in={roleOf("minor", i) !== null} d={wedge(i, R.minor, R.major)} />
    <text x={m.x} y={m.y - (roleOf("minor", i) && numerals ? 5 : 0)} class="minor-name">{hidden ? "" : `${k.minor}m`}</text>
    {#if numerals && roleOf("minor", i)}<text x={m.x} y={m.y + 10} class="numeral">{roleOf("minor", i)}</text>{/if}
    <!-- Inner ring: the key's diminished chord (its vii°). -->
    <path class="ring dim" class:in={roleOf("dim", i) !== null} d={wedge(i, R.dim, R.minor)} />
    <text x={d.x} y={d.y + 4} class="dim-name">{hidden ? "" : `${noteAtFifths(k.fifths + 5)}°`}</text>
  {/each}
  <circle class="hub" cx={C} cy={C} r={R.dim - 2} />
  {#if picked}
    <text x={C} y={C - 6} class="hub-key">{picked.major}</text>
    <text x={C} y={C + 12} class="hub-sig">{picked.fifths === 0 ? "no ♯ or ♭" : `${Math.abs(picked.fifths)}${picked.fifths > 0 ? "♯" : "♭"}`}</text>
  {:else}
    <text x={C} y={C + 5} class="hub-sig">♯ clockwise</text>
  {/if}
</svg>

<style>
  .wheel {
    display: block;
    width: 100%;
    max-width: 26rem;
    margin-inline: auto;
    user-select: none;
  }
  .ring {
    stroke: var(--ws-bg);
    stroke-width: 1.5;
  }
  .ring.major {
    fill: color-mix(in oklch, var(--ws-ink) 9%, var(--ws-surface));
  }
  .ring.minor {
    fill: color-mix(in oklch, var(--ws-ink) 5%, var(--ws-surface));
  }
  .ring.dim {
    fill: var(--ws-surface);
  }
  .slot[role="button"] {
    cursor: pointer;
  }
  .slot[role="button"]:hover .ring.major,
  .slot:focus-visible .ring.major {
    fill: color-mix(in oklch, var(--instr) 25%, var(--ws-surface));
  }
  .slot:focus-visible {
    outline: none;
  }
  .slot:focus-visible .ring.major {
    stroke: var(--ws-ink);
    stroke-width: 2.5;
  }
  .slot.in .ring.major,
  .ring.minor.in,
  .ring.dim.in {
    fill: color-mix(in oklch, var(--instr) 30%, var(--ws-surface));
  }
  .slot.tonic .ring.major {
    fill: var(--instr);
  }
  .slot[data-mark="right"] .ring.major {
    fill: color-mix(in oklch, var(--success) 45%, var(--ws-surface));
  }
  .slot[data-mark="wrong"] .ring.major {
    fill: color-mix(in oklch, var(--destructive) 40%, var(--ws-surface));
  }
  .slot[data-mark="lit"] .ring.major {
    fill: color-mix(in oklch, var(--instr) 55%, var(--ws-surface));
  }
  text {
    text-anchor: middle;
    dominant-baseline: middle;
    fill: var(--ws-ink);
    pointer-events: none;
  }
  .name {
    font-size: 19px;
    font-weight: 700;
  }
  .slot.tonic .name,
  .slot.tonic .numeral,
  .slot.tonic .enh {
    fill: var(--ws-stage);
  }
  .enh {
    font-size: 10px;
    fill: var(--ws-soft);
  }
  .minor-name {
    font-size: 13px;
    font-weight: 600;
  }
  .dim-name {
    font-size: 9.5px;
    fill: var(--ws-soft);
  }
  .numeral {
    font-size: 10.5px;
    font-weight: 700;
  }
  .hub {
    fill: var(--ws-bg);
  }
  .hub-key {
    font-size: 20px;
    font-weight: 800;
  }
  .hub-sig {
    font-size: 11px;
    fill: var(--ws-soft);
  }
</style>

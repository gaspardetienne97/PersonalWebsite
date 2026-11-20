<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  // The circle of fifths as a wheel: major keys outside (C at the top, a
  // fifth clockwise, a fourth counter-clockwise), relative minors in the
  // middle ring, each key's diminished chord inside (only where chords are asked). Pick a key and its seven
  // chords light as one wedge, with their numerals; the centre names its
  // signature. Drills can blank keys out and mark answers.
  import { CIRCLE, keyAt, noteAtFifths, wheelIndex } from "@repo/music-core/theory/circle";
  import { keyName } from "#lib/music/names.svelte.ts";

  let {
    selected = null,
    onpick,
    numerals = true,
    blank,
    marks = {},
    label = m.music_shell_circle_label(),
    compact = false,
    dim = true,
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
    /** Major keys only, larger: a key picker. */
    compact?: boolean;
    /** The inner ring of diminished chords; without it the minor ring takes the room, its names larger. */
    dim?: boolean;
  } = $props();

  const S = 360;
  const C = S / 2;
  // The outer ring is the deepest: at 375 px wide a key is still a 44 px tap.
  const R = $derived(compact ? { outer: 172, major: 78, minor: 78, dim: 78 } : dim ? { outer: 172, major: 114, minor: 78, dim: 44 } : { outer: 172, major: 114, minor: 54, dim: 54 });
  /** Each position its own hue, round the colour wheel the way keys go round the circle. */
  const hue = (i: number) => (i * 30 + 25) % 360;
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
    // A picker marks only the key itself.
    if (compact) return ring === "major" && d === 0 ? "I" : null;
    return ROLE[ring][d] ?? null;
  };
  const picked = $derived(selected === null ? null : keyAt(selected));
  const SLOTS = Array.from({ length: 12 }, (_, i) => i);
</script>

<svg class="wheel" class:has-pick={sel !== null && !compact} class:compact viewBox="0 0 {S} {S}" role="group" aria-label={label}>
  {#each SLOTS as i (i)}
    {@const k = CIRCLE[i]}
    {@const hidden = blank?.(i) ?? false}
    {@const mark = marks[i]}
    {@const p = at((R.major + R.outer) / 2 + 4, i)}
    {@const mid = at((R.minor + R.major) / 2, i)}
    {@const d = at((R.dim + R.minor) / 2, i)}
    <!-- Outer ring: the major key. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -- the slot has role button whenever it is focusable (a pickable wheel) -->
    <g
      style:--h={hue(i)}
      class="slot"
      class:in={roleOf("major", i) !== null}
      class:tonic={roleOf("major", i) === "I"}
      data-mark={mark}
      role={onpick ? "button" : undefined}
      tabindex={onpick ? 0 : undefined}
      aria-label={hidden
        ? m.music_shell_circle_slot_hidden({ n: i + 1 })
        : m.music_shell_circle_slot({
            name: k.enharmonic ? m.music_shell_circle_major_enh({ key: keyName(k.major), enharmonic: keyName(k.enharmonic.major) }) : m.music_shell_circle_major({ key: keyName(k.major) }),
            signature:
              k.fifths === 0
                ? m.music_shell_circle_no_accidentals()
                : (k.fifths > 0 ? m.music_shell_circle_sharps : m.music_shell_circle_flats)({ count: Math.abs(k.fifths) }),
          })}
      aria-pressed={onpick ? sel === i : undefined}
      onclick={() => onpick?.(k.fifths)}
      onkeydown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onpick?.(k.fifths))}
    >
      <path class="ring major" class:in={roleOf("major", i) !== null} class:tonic={roleOf("major", i) === "I"} d={wedge(i, R.major, R.outer)} />
      <text x={p.x} y={p.y - (roleOf("major", i) && numerals ? 6 : 0)} class="name">{hidden ? "?" : keyName(k.major)}</text>
      {#if k.enharmonic && !hidden && !mark && !(numerals && roleOf("major", i))}<text x={p.x} y={p.y + 15} class="enh">{keyName(k.enharmonic.major)}</text>{/if}
      {#if numerals && roleOf("major", i)}<text x={p.x} y={p.y + 14} class="numeral">{roleOf("major", i)}</text>{/if}
      <!-- A marked answer carries a glyph, not colour alone. -->
      {#if mark === "right" || mark === "wrong"}<text x={p.x} y={p.y + 17} class="glyph" aria-hidden="true">{mark === "right" ? "✓" : "✕"}</text>{/if}
    </g>
    {#if !compact}
      <!-- Middle ring: its relative minor. -->
      <path style:--h={hue(i)} class="ring minor" class:in={roleOf("minor", i) !== null} d={wedge(i, R.minor, R.major)} />
      {@const minorName = hidden ? "" : `${keyName(k.minor)}m`}
      <text x={mid.x} y={mid.y - (roleOf("minor", i) && numerals ? 7 : 0)} class="minor-name" textLength={dim && minorName.length > 3 ? 36 : undefined} lengthAdjust="spacingAndGlyphs">{minorName}</text>
      {#if numerals && roleOf("minor", i)}<text x={mid.x} y={mid.y + 9} class="numeral">{roleOf("minor", i)}</text>{/if}
      {#if dim}
        <!-- Inner ring: the key's diminished chord (its vii°). -->
        <path style:--h={hue(i)} class="ring dim" class:in={roleOf("dim", i) !== null} d={wedge(i, R.dim, R.minor)} />
        {@const dimName = hidden ? "" : `${keyName(noteAtFifths(k.fifths + 5))}°`}
        <!-- A long name (solfège: "Sol#°") is narrowed to its wedge rather than run into the next. -->
        <text x={d.x} y={d.y} class="dim-name" textLength={dimName.length > 3 ? 26 : undefined} lengthAdjust="spacingAndGlyphs">{dimName}</text>
      {/if}
    {/if}
  {/each}
  <circle class="hub" cx={C} cy={C} r={R.dim - 2} />
  {#if picked}
    <text x={C} y={C - 7} class="hub-key">{keyName(picked.major)}</text>
    <text x={C} y={C + 12} class="hub-sig">{picked.fifths === 0 ? m.music_shell_circle_hub_none() : `${Math.abs(picked.fifths)}${picked.fifths > 0 ? "♯" : "♭"}`}</text>
  {:else}
    <text x={C} y={C - 8} class="hub-sig">{m.music_shell_circle_hub_sharps_go()}</text>
    <text x={C} y={C + 10} class="hub-sig">{m.music_shell_circle_hub_clockwise()}</text>
  {/if}
</svg>

<style>
  /* Lightness and chroma per ring, per theme; each slot brings its hue (--h). */
  .wheel {
    --l-major: 0.8;
    --l-minor: 0.87;
    --l-dim: 0.93;
    --c: 0.15;
    --l-in: 0.74;
    --l-tonic: 0.58;
    --l-fade: 0.94;
    --ink: oklch(0.24 0.03 280);
    --ink-soft: oklch(0.42 0.03 280);
    --ink-tonic: oklch(0.99 0 0);
    display: block;
    width: 100%;
    max-width: 26rem;
    margin-inline: auto;
    user-select: none;
  }
  :global(.dark) .wheel {
    --l-major: 0.62;
    --l-minor: 0.5;
    --l-dim: 0.4;
    --l-in: 0.7;
    --l-tonic: 0.84;
    --l-fade: 0.3;
    --ink: oklch(0.98 0.01 280);
    --ink-soft: oklch(0.86 0.02 280);
    --ink-tonic: oklch(0.2 0.03 280);
  }
  .wheel.compact {
    max-width: 17rem;
  }
  .ring {
    stroke: var(--ws-bg);
    stroke-width: 1.5;
    transition: fill 150ms;
  }
  .ring.major {
    fill: oklch(var(--l-major) var(--c) var(--h));
  }
  .ring.minor {
    fill: oklch(var(--l-minor) calc(var(--c) * 0.7) var(--h));
  }
  .ring.dim {
    fill: oklch(var(--l-dim) calc(var(--c) * 0.45) var(--h));
  }
  /* A picked key: its wedge stays vivid, the rest fade back. */
  .has-pick .ring:not(.in) {
    fill: oklch(var(--l-fade) 0.03 var(--h));
  }
  .has-pick .ring.in {
    fill: oklch(var(--l-in) 0.17 var(--h));
  }
  .has-pick .ring.major.tonic {
    fill: oklch(var(--l-tonic) 0.2 var(--h));
  }
  /* In a picker every key stays bright; the current one is bold and ringed. */
  .compact .ring.major.tonic {
    fill: oklch(var(--l-tonic) 0.2 var(--h));
    stroke: var(--ink);
    stroke-width: 3;
  }
  .slot[role="button"] {
    cursor: pointer;
  }
  .slot[role="button"]:hover .ring.major {
    filter: brightness(1.08) saturate(1.2);
  }
  .slot:focus-visible {
    outline: none;
  }
  .slot:focus-visible .ring.major {
    stroke: var(--ink);
    stroke-width: 3;
  }
  .slot[data-mark="right"] .ring.major {
    fill: var(--success);
    transform-box: fill-box;
    transform-origin: center;
    animation: found 500ms ease-out;
  }
  /* The right key swells once when it is shown. */
  @keyframes found {
    40% {
      transform: scale(1.12);
    }
  }
  .slot[data-mark="wrong"] .ring.major {
    fill: var(--destructive);
  }
  .slot[data-mark="lit"] .ring.major {
    fill: oklch(var(--l-in) 0.2 var(--h));
  }
  /* Sizes are in wheel units: a phone draws the wheel at about 0.8 of them, so
     nothing goes under 17 (13 px or more there). */
  text {
    text-anchor: middle;
    dominant-baseline: middle;
    fill: var(--ink);
    pointer-events: none;
  }
  .name {
    font-size: 19px;
    font-weight: 700;
  }
  .compact .name {
    font-size: 24px;
  }
  .slot.tonic .name,
  .slot.tonic .numeral,
  .slot.tonic .enh,
  .slot[data-mark] .name {
    fill: var(--ink-tonic);
  }
  .enh {
    font-size: 16px;
    fill: var(--ink-soft);
  }
  .compact .enh {
    font-size: 17px;
  }
  .minor-name {
    font-size: 17px;
    font-weight: 600;
  }
  .dim-name {
    font-size: 16px;
    font-weight: 600;
    fill: var(--ink-soft);
  }
  .glyph {
    font-size: 17px;
    font-weight: 800;
    fill: var(--ink-tonic);
  }
  .numeral {
    font-size: 16px;
    font-weight: 700;
  }
  .hub {
    fill: var(--ws-bg);
  }
  .hub-key {
    font-size: 20px;
    font-weight: 800;
  }
  .compact .hub-key {
    font-size: 30px;
  }
  .hub-sig {
    font-size: 16px;
    fill: var(--ink-soft);
  }
  .compact .hub-sig {
    font-size: 17px;
  }
  @media (prefers-reduced-motion: reduce) {
    .ring {
      transition: none;
    }
    .slot[data-mark="right"] .ring.major {
      animation: none;
    }
  }
</style>

<script lang="ts">
  // The degrees around the tonic, evenly spaced (twelve sit by semitone), in one neutral ring colour with
  // their labels: green and red mean only right and wrong.
  // Degrees outside the level stay visible (dimmed, "not in this set") but are not
  // answers; in a level with no chromatic degree the chromatic ones are left out. Answered states
  // carry a glyph and words, never colour alone.
  import { SCALE_DEGREES, degreeLabel } from "@repo/music-core/content/ear";
  import { m } from "@repo/i18n/messages.js";
  import { DEGREE_ROLE } from "./degrees";

  interface Props {
    /** Degrees that can be picked (the level). */
    available: readonly string[];
    labels: "degree" | "solfege";
    onpick?: (label: string) => void;
    /** Lit while it sounds (warmup, demo, a revealed answer). */
    lit?: string | null;
    expected?: string | null;
    answered?: string | null;
    disabled?: boolean;
    /** Centre text, e.g. the tonic name. */
    center?: string;
  }
  let { available, labels, onpick, lit = null, expected = null, answered = null, disabled = false, center = "" }: Props = $props();

  const R = 42; // % of the box, to button centres
  const chromatic = (l: string) => /^[b#]/.test(l);
  const shown = $derived(available.some(chromatic) ? SCALE_DEGREES : SCALE_DEGREES.filter((d) => !chromatic(d.label) || available.includes(d.label)));
  /** Evenly round the wheel by order, so no two buttons crowd (3 and 4, 7 and 1 are a half step apart). */
  /** The button's name: the degree, its role, whether it is in the set, and its answered state. */
  const degreeAria = (label: string, open: boolean, state: string | null) => {
    const base = (open ? m.music_drills_ear_wheel_degree : m.music_drills_ear_wheel_degree_off)({ degree: degreeLabel(label, "degree"), role: DEGREE_ROLE[label] });
    return state === "expected" ? m.music_drills_ear_wheel_the_answer({ label: base }) : state === "answered" ? m.music_drills_ear_wheel_your_answer({ label: base }) : base;
  };
  const pos = (i: number) => {
    const a = (i / shown.length) * 2 * Math.PI - Math.PI / 2;
    return { left: 50 + R * Math.cos(a), top: 50 + R * Math.sin(a) };
  };
</script>

<div class="wheel" role="group" aria-label={m.music_drills_ear_wheel_label()}>
  <div class="hub" aria-hidden="true">
    <span class="font-display text-lg font-semibold">{center}</span>
    <span class="text-sm text-ws-stage-soft">{m.music_drills_ear_wheel_tonic()}</span>
  </div>
  {#each shown as d, i (d.label)}
    {@const p = pos(i)}
    {@const open = available.includes(d.label)}
    {@const state = expected === d.label ? "expected" : answered === d.label ? "answered" : null}
    <button
      type="button"
      class="deg"
      class:off={!open}
      class:lit={lit === d.label}
      data-degree={d.label}
      data-state={state}
      style:left="{p.left}%"
      style:top="{p.top}%"
      disabled={disabled || !open || !onpick}
      aria-label={degreeAria(d.label, open, state)}
      onclick={() => onpick?.(d.label)}
    >
      <span class="text-base font-semibold leading-none">{labels === "solfege" ? d.solfege : d.label}</span>
      {#if labels === "degree"}<span class="text-sm leading-none">{d.solfege}</span>{/if}
      {#if state}<span class="glyph" aria-hidden="true">{state === "expected" ? "✓" : "✕"}</span>{/if}
    </button>
  {/each}
</div>

<style>
  .wheel {
    position: relative;
    /* Short phones keep the whole wheel in view under the question. */
    width: min(100%, 20rem, 34dvh);
    min-width: 15rem;
    aspect-ratio: 1;
    margin-inline: auto;
    border-radius: 999px;
    background: radial-gradient(circle, var(--ws-stage-2) 0 30%, transparent 31%),
      conic-gradient(from -15deg, color-mix(in oklch, var(--instr) 10%, transparent), transparent 40%, color-mix(in oklch, var(--instr) 10%, transparent));
  }
  .hub {
    position: absolute;
    inset: 36%;
    display: grid;
    place-content: center;
    text-align: center;
    border-radius: 999px;
  }
  .deg {
    position: absolute;
    translate: -50% -50%;
    display: grid;
    place-items: center;
    gap: 2px;
    width: 3.4rem;
    height: 3.4rem;
    border-radius: 999px;
    /* Neutral chips with one neutral rim: green and red mean only right and wrong. */
    background: color-mix(in oklch, var(--ws-stage-ink) 12%, var(--ws-stage));
    color: var(--ws-stage-ink);
    border: 3px solid color-mix(in oklch, var(--ws-stage-ink) 45%, var(--ws-stage));
    transition: transform 120ms ease-out, box-shadow 120ms ease-out;
  }
  .deg:not(:disabled):hover {
    transform: scale(1.06);
  }
  .deg:focus-visible {
    outline: 3px solid var(--ws-stage-ink);
    outline-offset: 2px;
  }
  .deg.off {
    background: transparent;
    border: 2px dashed color-mix(in oklch, var(--ws-stage-ink) 45%, transparent);
    color: var(--ws-stage-soft);
  }
  .deg.lit {
    box-shadow: 0 0 0 4px color-mix(in oklch, var(--instr) 45%, transparent), 0 0 24px var(--instr);
    transform: scale(1.1);
  }
  .deg.lit:not([data-state]) {
    border-color: var(--instr);
    background: color-mix(in oklch, var(--instr) 30%, var(--ws-stage));
  }
  .deg[data-state="expected"] {
    border-color: var(--success);
    background: var(--success);
    color: var(--success-foreground);
  }
  .deg[data-state="answered"] {
    border-color: var(--destructive);
    background: var(--destructive);
    color: var(--on-destructive);
  }
  .glyph {
    position: absolute;
    right: -4px;
    top: -4px;
    display: grid;
    place-items: center;
    width: 1.3rem;
    height: 1.3rem;
    border-radius: 999px;
    background: var(--ws-stage-ink);
    color: var(--ws-stage);
    font-size: 0.8125rem;
    font-weight: 700;
  }
</style>

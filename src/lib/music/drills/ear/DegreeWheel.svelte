<script lang="ts">
  // The twelve degrees around the tonic, each in its fixed colour with its label.
  // Degrees outside the level stay visible but are not answers. Answered states
  // carry a glyph and words, never colour alone.
  import { SCALE_DEGREES, degreeLabel } from "@repo/music-core/content/ear";
  import { DEGREE_ROLE, degreeColor } from "./degrees";

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
  const pos = (s: number) => {
    const a = (s / 12) * 2 * Math.PI - Math.PI / 2;
    return { left: 50 + R * Math.cos(a), top: 50 + R * Math.sin(a) };
  };
</script>

<div class="wheel" role="group" aria-label="Scale degrees">
  <div class="hub" aria-hidden="true">
    <span class="font-display text-lg font-semibold">{center}</span>
    <span class="text-xs text-ws-stage-soft">tonic</span>
  </div>
  {#each SCALE_DEGREES as d (d.label)}
    {@const p = pos(d.semitones)}
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
      style:--deg={degreeColor(d.label)}
      disabled={disabled || !open || !onpick}
      aria-label="{degreeLabel(d.label, 'degree')}, {DEGREE_ROLE[d.label]}{state === 'expected' ? ', the answer' : state === 'answered' ? ', your answer' : ''}"
      onclick={() => onpick?.(d.label)}
    >
      <span class="text-base font-semibold leading-none">{labels === "solfege" ? d.solfege : d.label}</span>
      {#if labels === "degree"}<span class="text-[0.7rem] leading-none opacity-80">{d.solfege}</span>{/if}
      {#if state}<span class="glyph" aria-hidden="true">{state === "expected" ? "✓" : "✕"}</span>{/if}
    </button>
  {/each}
</div>

<style>
  .wheel {
    position: relative;
    width: min(100%, 20rem);
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
    background: var(--deg);
    color: oklch(0.2 0.04 287);
    border: 2px solid transparent;
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
    background: color-mix(in oklch, var(--deg) 22%, var(--ws-stage-2));
    color: var(--ws-stage-soft);
  }
  .deg.lit {
    box-shadow: 0 0 0 4px color-mix(in oklch, var(--deg) 45%, transparent), 0 0 24px var(--deg);
    transform: scale(1.1);
  }
  .deg[data-state="expected"] {
    border-color: var(--ws-stage-ink);
    box-shadow: 0 0 0 3px var(--success);
  }
  .deg[data-state="answered"] {
    border-style: dashed;
    border-color: var(--ws-stage-ink);
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
    font-size: 0.75rem;
    font-weight: 700;
  }
</style>

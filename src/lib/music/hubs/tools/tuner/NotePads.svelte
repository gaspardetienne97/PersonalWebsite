<script lang="ts">
  // The row of twelve notes every Tuner tab shares. With a `tonic`, each pad is
  // coloured by its degree above it (the drone); without one, only the chosen
  // note lights (a tuning target). Colour is paired with the degree label.
  import { noteName } from "@repo/music-core";
  import { DEGREES, degreeRole, pretty } from "./tuner";

  interface Props {
    label: string;
    selected: number | null;
    onselect: (pc: number | null) => void;
    /** Colour pads by degree above this pitch class. */
    tonic?: number;
    /** Offer a first pad that clears the choice, e.g. "Any note". */
    noneLabel?: string;
  }
  let { label, selected, onselect, tonic, noneLabel }: Props = $props();

  const ROLE_WORD = { tonic: "tonic", fifth: "fifth", scale: "in the major scale", other: "outside the major scale" };
</script>

<div class="pads grid gap-2" class:with-none={!!noneLabel} role="group" aria-label={label}>
  {#if noneLabel}
    <button type="button" class="pad" aria-pressed={selected === null} data-on={selected === null || undefined} onclick={() => onselect(null)}>
      <span class="font-display text-base font-semibold">{noneLabel}</span>
    </button>
  {/if}
  {#each Array.from({ length: 12 }, (_, i) => i) as p (p)}
    {@const semis = tonic === undefined ? null : (p - tonic + 12) % 12}
    {@const role = semis === null ? undefined : degreeRole(semis)}
    <button
      type="button"
      class="pad"
      data-role={role}
      data-on={p === selected || undefined}
      aria-pressed={p === selected}
      aria-label="{noteName(p, 'flat', false)}{role ? `, ${ROLE_WORD[role]}` : ''}"
      onclick={() => onselect(p)}
    >
      <span class="font-display text-xl font-semibold">{pretty(noteName(p, "flat", false))}</span>
      {#if semis !== null}<span class="tnum text-xs">{DEGREES[semis]}</span>{:else if noteName(p, "flat", false) !== noteName(p, "sharp", false)}<span class="text-xs">{pretty(noteName(p, "sharp", false))}</span>{/if}
    </button>
  {/each}
</div>

<style>
  .pads {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  @media (min-width: 640px) {
    .pads {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }
  }
  @media (min-width: 1024px) {
    .pads {
      grid-template-columns: repeat(12, minmax(0, 1fr));
    }
    .pads.with-none {
      grid-template-columns: repeat(13, minmax(0, 1fr));
    }
  }
  .pad {
    display: flex;
    min-height: 3.5rem;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.1rem;
    border-radius: 0.8rem;
    border: 2px solid transparent;
    background: color-mix(in oklch, var(--ws-stage-ink) 6%, transparent);
    color: var(--ws-stage-soft);
  }
  .pad:hover {
    background: color-mix(in oklch, var(--ws-stage-ink) 12%, transparent);
  }
  .pad[data-role="scale"] {
    background: color-mix(in oklch, var(--instr) 18%, transparent);
    color: var(--ws-stage-ink);
  }
  .pad[data-role="fifth"] {
    background: color-mix(in oklch, var(--instr) 40%, transparent);
    color: var(--ws-stage-ink);
  }
  .pad[data-role="tonic"],
  .pad[data-on]:not([data-role]) {
    background: var(--instr);
    color: var(--ws-stage);
    border-color: var(--ws-stage-ink);
  }
</style>

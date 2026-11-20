<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
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

  // Spelled for the key: sharps over a sharp-key tonic (G, D, A, E, B), so A major reads C♯, F♯, G♯, not D♭, G♭, A♭.
  const SHARP_TONICS = new Set([7, 2, 9, 4, 11]);
  const spelling = $derived(tonic !== undefined && SHARP_TONICS.has(tonic) ? "sharp" : "flat");
  const ROLE_WORD = {
    tonic: m.music_hubs_tuner_role_tonic(),
    fifth: m.music_hubs_tuner_role_fifth(),
    scale: m.music_hubs_tuner_role_scale(),
    other: m.music_hubs_tuner_role_other(),
  };
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
      aria-label="{noteName(p, spelling, false)}{role ? `, ${ROLE_WORD[role]}` : ''}"
      onclick={() => onselect(p)}
    >
      <span class="font-display text-xl font-semibold">{pretty(noteName(p, spelling, false))}</span>
      <!-- In the key: a dot as well as the tint, so colour is never the only cue. -->
      {#if role && role !== "other"}<span class="in-key" aria-hidden="true"></span>{/if}
      {#if semis !== null}<span class="tnum text-[13px] font-medium">{DEGREES[semis]}</span>{:else if noteName(p, "flat", false) !== noteName(p, "sharp", false)}<span class="text-[13px]">{pretty(noteName(p, "sharp", false))}</span>{/if}
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
    position: relative;
    display: flex;
    min-height: 3.5rem;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.1rem;
    border-radius: 0.8rem;
    border: 2px solid transparent;
    background: color-mix(in oklch, var(--ws-stage-ink) 6%, transparent);
    /* Full ink: the degree labels must read at 4.5:1 on every pad; the key is shown by tint and outline. */
    color: var(--ws-stage-ink);
  }
  .pad:hover {
    background: color-mix(in oklch, var(--ws-stage-ink) 12%, transparent);
  }
  .pad[data-role="scale"] {
    background: color-mix(in oklch, var(--instr) 26%, transparent);
    border-color: var(--instr);
  }
  .pad[data-role="fifth"] {
    background: color-mix(in oklch, var(--instr) 40%, transparent);
    border-color: var(--instr);
  }
  .in-key {
    position: absolute;
    top: 0.35rem;
    right: 0.4rem;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 999px;
    background: currentColor;
  }
  .pad[data-role="tonic"],
  .pad[data-on]:not([data-role]) {
    background: var(--instr);
    color: var(--ws-stage);
    border-color: var(--ws-stage-ink);
  }
</style>

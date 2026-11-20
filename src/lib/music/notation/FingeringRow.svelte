<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  import { noteName, type Score } from "@repo/music-core";
  import { note } from "#lib/music/names.svelte.ts";
  import { AEROPHONE_FINGERINGS } from "@repo/music-core/data/index";
  import { transposeFifths, writtenOffset } from "@repo/music-core/theory/transposition";
  import { settings } from "#lib/music/runtime/index.ts";
  import { scoreGroups, type BeatRange } from "./groups";
  import type { GroupState } from "./NotationFrame.svelte";

  let {
    score,
    voiceIds,
    range,
    groupStates = {},
  }: {
    score: Score;
    voiceIds?: string[] | null;
    range?: BeatRange | null;
    groupStates?: Record<number, GroupState>;
  } = $props();

  const LH = ["k1", "k2", "k3"];
  const RH = ["k4", "k5", "k6"];
  const labelOf = Object.fromEntries(AEROPHONE_FINGERINGS.keys.map((k) => [k.id, k.label]));

  // The monophonic top line: the highest note of every onset, fingered and
  // named at the Aerophone's written pitch (the score is concert).
  const shift = $derived(writtenOffset("aerophone", settings.value));
  const flats = $derived(transposeFifths(score.keyFifths ?? 0, shift) < 0);
  const cells = $derived(
    scoreGroups(score, voiceIds, range).map((g) => {
      const midi = g.notes[g.notes.length - 1].midi + shift;
      const f = AEROPHONE_FINGERINGS.fingeringsByMidi[String(midi)];
      const name = note(noteName(midi, flats ? "flat" : "sharp"));
      const extras = f ? f.keys.filter((k) => !LH.includes(k) && !RH.includes(k)) : [];
      const spoken = f
        ? [...f.keys.map((k) => labelOf[k] ?? k), ...(f.octave ? [m.music_shell_nt_octave_key()] : [])].join(", ") ||
          m.music_shell_nt_all_open()
        : "";
      return { index: g.index, name, f, extras, spoken };
    }),
  );
</script>

<ol class="row" aria-label={m.music_shell_nt_aero_fingerings()}>
  {#each cells as c (c.index)}
    <li class:active={groupStates[c.index] === "active"} data-state={groupStates[c.index]}>
      <span class="name">{c.name}</span>
      {#if c.f}
        <svg viewBox="0 0 40 96" role="img" aria-label={m.music_shell_nt_fingering_label({ name: c.name, spoken: c.spoken })}>
          <rect
            x="10"
            y="3"
            width="20"
            height="8"
            rx="4"
            class:on={c.f.octave}
          />
          {#each [...LH, ...RH] as k, i (k)}
            <circle cx="20" cy={22 + i * 12 + (i > 2 ? 6 : 0)} r="5" class:on={c.f.keys.includes(k)} />
          {/each}
          <line x1="8" x2="32" y1="55" y2="55" />
        </svg>
        {#if c.extras.length}
          <span class="extra">{c.extras.map((k) => labelOf[k] ?? k).join(", ")}</span>
        {/if}
      {:else}
        <span class="none">{m.music_shell_nt_no_fingering()}</span>
      {/if}
    </li>
  {/each}
</ol>

<style>
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
    min-width: 0;
    color: var(--ws-ink, currentColor);
  }
  li {
    flex: 0 1 4rem;
    min-width: 3.25rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.375rem 0.25rem;
    border: 2px solid transparent;
    border-radius: 0.5rem;
    text-align: center;
  }
  li.active {
    border-color: var(--instr, currentColor);
  }
  li[data-state="correct"] {
    color: var(--success);
  }
  li[data-state="wrong"] {
    color: var(--destructive);
  }
  li[data-state="missed"] {
    color: var(--ws-soft);
  }
  .name {
    font-weight: 600;
    font-size: 0.875rem;
  }
  svg {
    display: block;
    width: 100%;
    max-width: 2.75rem;
    height: auto;
  }
  rect,
  circle {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
  }
  .on {
    fill: currentColor;
  }
  line {
    stroke: var(--ws-line, currentColor);
    stroke-width: 1;
  }
  .extra,
  .none {
    font-size: 0.8125rem;
    line-height: 1.2;
    color: var(--ws-soft, inherit);
  }
</style>

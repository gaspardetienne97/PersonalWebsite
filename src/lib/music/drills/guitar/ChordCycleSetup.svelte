<script lang="ts">
  // The setup for a cycle of chords: a card per chord (its diagram), tap one to
  // change its root, quality and position up the neck, add or remove chords.
  import type { ChordPosition, Tuning } from "@repo/music-core/data/index";
  import ChordDiagram from "#lib/music/components/ChordDiagram.svelte";
  import ChordPicker from "./ChordPicker.svelte";
  import PositionPicker from "./PositionPicker.svelte";
  import { chordId, chordLabel, chordRef, MAX_CYCLE, nextChordId, positionsOn, shortPosition, type ChordRef } from "./chords";
  import type { Fretted } from "./fretted";

  interface Props {
    instrument: Fretted;
    tuning: Tuning;
    refs: ChordRef[];
    /** Each chord as it will be played (its chosen or default position). */
    shapes: ChordPosition[];
    /** The chosen positions; null leaves the drill's default. */
    positions: (number | null)[];
    onchange: (refs: ChordRef[], positions: (number | null)[]) => void;
    setupKey?: string;
  }
  let { instrument, tuning, refs, shapes, positions, onchange, setupKey }: Props = $props();

  let editing = $state(0);
  const n = $derived(refs.length);
  const edit = $derived(Math.min(editing, n - 1));
  const names = $derived(refs.map(chordLabel));
  const ids = $derived(refs.map((r) => chordId(instrument, r)));
  const choices = $derived(positionsOn(ids[edit], tuning));
  /** The position on show for the chord being edited (the drill's default when none was chosen). */
  const shownAt = $derived(positions[edit] ?? Math.max(0, choices.findIndex((p) => p.id === shapes[edit]?.id)));

  function setChord(id: string) {
    const r = chordRef(id);
    if (r) onchange(refs.map((x, j) => (j === edit ? r : x)), positions.map((p, j) => (j === edit ? null : p)));
  }
  function add() {
    const r = chordRef(nextChordId(instrument, ids.at(-1)!, ids) ?? "");
    if (!r || n >= MAX_CYCLE) return;
    onchange([...refs, r], [...positions, null]);
    editing = n;
  }
  function remove(i: number) {
    if (n <= 2) return;
    onchange(refs.filter((_, j) => j !== i), positions.filter((_, j) => j !== i));
    editing = Math.max(0, Math.min(edit, n - 2));
  }
</script>

<div class="flex min-w-0 flex-col gap-2 sm:col-span-2 lg:col-span-3" data-setup={setupKey}>
  <span class="text-sm font-medium" id="cycle-label">Chords, in order</span>
  <div class="flex flex-wrap items-stretch gap-2" role="group" aria-labelledby="cycle-label">
    {#each shapes as sh, i (i)}
      <div class="relative">
        <button
          type="button"
          class="flex w-20 flex-col items-center gap-0.5 rounded-xl border bg-ws-surface p-1.5 {edit === i ? 'border-instr ring-2 ring-instr' : 'border-ws-line hover:bg-ws-raised'}"
          aria-pressed={edit === i}
          aria-label="Chord {i + 1}: {names[i]}, {sh.positionLabel}. Change it"
          onclick={() => (editing = i)}
        >
          <ChordDiagram frets={sh.frets} fingers={sh.fingers} barre={sh.barre} label="" />
          <span class="text-sm font-semibold">{names[i]}</span>
          <span class="text-[10px] leading-tight text-ws-soft">{shortPosition(sh.positionLabel)}</span>
        </button>
        {#if n > 2}
          <button type="button" class="absolute -top-2 -right-2 grid size-7 place-items-center rounded-full border border-ws-line bg-ws-surface text-xs" aria-label="Remove {names[i]}" onclick={() => remove(i)}>✕</button>
        {/if}
      </div>
    {/each}
    {#if n < MAX_CYCLE}
      <button type="button" class="grid min-h-24 w-20 place-items-center rounded-xl border border-dashed border-ws-line text-sm font-medium hover:bg-ws-raised" onclick={add}>Add chord</button>
    {/if}
  </div>
  <p class="text-xs text-ws-soft">Tap a chord to change it. The run goes round them in order and back to the first.</p>
</div>
<ChordPicker label="Chord {edit + 1}" {instrument} value={ids[edit]} onchange={setChord} />
<div class="flex min-w-0 flex-col gap-1 sm:col-span-2 lg:col-span-3">
  <span class="text-sm font-medium">Shape and fret for {names[edit]}</span>
  {#if choices.length > 1}
    <PositionPicker positions={choices} index={shownAt} symbol={names[edit]} onchange={(p) => onchange(refs, positions.map((x, j) => (j === edit ? p : x)))} />
  {:else}
    <p class="text-sm text-ws-soft">One shape for this chord on this tuning.</p>
  {/if}
</div>

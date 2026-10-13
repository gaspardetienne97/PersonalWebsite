<script lang="ts" module>
  import type { Instrument as Inst } from "@repo/music-core";
  import { AEROPHONE_RANGE as AE } from "@repo/music-core/content/winds-pads";
  import { tunings as T } from "$lib/music/drills/guitar/instrument.svelte";
  import { settings as S } from "$lib/music/runtime";

  /** Octaves up a line must move so `inst` can reach its lowest note (0 when it fits, or on piano). */
  export function fitShift(line: readonly number[], inst: Inst): number {
    if (!line.length) return 0;
    const lowest = inst === "aerophone" ? AE.lowestMidi : inst === "ukulele" ? Math.min(...T.pick(S.value.ukuleleTuningId, "ukulele").openStrings) : inst === "guitar" ? Math.min(...T.pick(S.value.guitarTuningId, "guitar").openStrings) : -Infinity;
    return Math.max(0, Math.ceil((lowest - Math.min(...line)) / 12)) * 12;
  }
</script>

<script lang="ts">
  // The instrument the practice strip has picked, drawn from one set of
  // keyboard-style marks: a keyboard, a fretboard window around the line, or the
  // Aerophone's fingering for the note now. Drills written for the keyboard use
  // it so guitar, ukulele and Aerophone players see their own instrument.
  import type { Instrument } from "@repo/music-core";
  import { noteName } from "@repo/music-core";
  import { AEROPHONE_RANGE, fingeringFor } from "@repo/music-core/content/winds-pads";
  import { assignTab } from "$lib/music/notation/groups";
  import { tunings } from "$lib/music/drills/guitar/instrument.svelte";
  import { input, settings } from "$lib/music/runtime";
  import Piano from "./Piano.svelte";
  import Fretboard, { type FretMark } from "./Fretboard.svelte";
  import AerophoneKeys from "./AerophoneKeys.svelte";
  import type { CellMarks, Flashes } from "./feedback.svelte";

  interface Props {
    /** Every pitch the exercise uses: sets the keyboard span and the fret window. */
    line: readonly number[];
    marks?: Record<number, CellMarks>;
    flashes?: Flashes;
    /** The Aerophone's note to finger; the first target mark otherwise. */
    current?: number | null;
    names?: "none" | "c" | "all";
    interactive?: boolean;
    low?: number;
    high?: number;
    /** Defaults to the practice strip's instrument. */
    instrument?: Instrument;
    /** Draw the line up an octave when the instrument can't reach it (drills graded by pitch class). */
    fit?: boolean;
  }
  let { line: given, marks: givenMarks = {}, flashes, current = null, names = "c", interactive = true, low, high, instrument, fit = false }: Props = $props();

  const inst = $derived(instrument ?? settings.value.activeInstrument);
  const shift = $derived(fit ? fitShift(given, inst) : 0);
  const line = $derived(shift ? given.map((m) => m + shift) : given);
  const marks = $derived(shift ? Object.fromEntries(Object.entries(givenMarks).map(([m, mk]) => [Number(m) + shift, mk])) : givenMarks);
  const span = $derived(line.length ? { lo: Math.min(...line), hi: Math.max(...line) } : { lo: 60, hi: 72 });
  const pianoLow = $derived(low ?? Math.floor((span.lo - 2) / 12) * 12);
  const pianoHigh = $derived(high ?? Math.max(pianoLow + 24, Math.ceil((span.hi + 2) / 12) * 12));

  const tuning = $derived(inst === "guitar" ? tunings.pick(settings.value.guitarTuningId, "guitar") : inst === "ukulele" ? tunings.pick(settings.value.ukuleleTuningId, "ukulele") : null);
  // One place per pitch: the line laid out low on the neck, the way the tab draws it.
  const placed = $derived.by(() => {
    if (!tuning) return new Map<number, { string: number; fret: number }>();
    const pitches = [...new Set([...line, ...Object.keys(marks).map(Number)])];
    const at = assignTab(pitches.map((midi, i) => ({ midi, startBeat: i })), tuning, 12);
    return new Map(pitches.flatMap((m, i) => (at[i] ? [[m, at[i]!] as const] : [])));
  });
  const unplayable = $derived(tuning ? line.filter((m) => !placed.has(m)) : inst === "aerophone" ? line.filter((m) => m < AEROPHONE_RANGE.lowestMidi || m > AEROPHONE_RANGE.highestMidi) : []);
  const frets = $derived.by(() => {
    const fs = line.flatMap((m) => (placed.has(m) ? [placed.get(m)!.fret] : []));
    const from = fs.length ? Math.max(0, Math.min(...fs) - 1) : 0;
    return { from, to: Math.max(from + 4, (fs.length ? Math.max(...fs) : 0) + 1) };
  });
  const fretMarks = $derived(
    Object.entries(marks).flatMap(([m, mk]): FretMark[] => {
      const p = placed.get(Number(m));
      return p ? [{ ...p, label: mk.label, demo: mk.demo, role: mk.role === "left" || mk.role === "right" ? undefined : mk.role }] : [];
    }),
  );
  const fingerNote = $derived(current !== null ? current + shift : Number(Object.entries(marks).find(([, mk]) => mk.target || mk.demo)?.[0] ?? NaN));
  // A scale on show (chord scales): the Aerophone lists its notes by role, as the keys would colour them.
  const roleNotes = $derived(
    Object.entries(marks)
      .map(([m, mk]) => [Number(m), mk] as const)
      .filter(([, mk]) => mk.role === "chord" || mk.role === "scale")
      .sort((a, b) => a[0] - b[0]),
  );
  const fingerFor = (m: number) => fingeringFor(m)?.name ?? noteName(m);
  const held = $derived(input.held.size ? Math.max(...input.held) : null);
</script>

{#if tuning}
  <Fretboard openStrings={tuning.openStrings} from={frets.from} to={frets.to} marks={fretMarks} {flashes} flashByPitch {interactive} label="{inst} fretboard, frets {frets.from} to {frets.to}" />
{:else if inst === "aerophone"}
  <div class="flex flex-col items-center gap-1" data-testid="aerophone-fingering">
    <AerophoneKeys midi={Number.isFinite(fingerNote) ? fingerNote : null} heldMidi={held} compact />
    {#if Number.isFinite(fingerNote)}<p class="font-display text-2xl font-semibold">{fingerFor(fingerNote)}</p>{/if}
    {#if roleNotes.length}
      <ul class="mt-1 flex flex-wrap justify-center gap-1" aria-label="The notes that fit">
        {#each roleNotes as [m, mk] (m)}<li class="role-chip rounded-md px-2 py-1 text-sm font-semibold" data-role={mk.role}>{fingerFor(m)}{#if mk.label}<span class="ml-1 text-xs opacity-70">{mk.label}</span>{/if}</li>{/each}
      </ul>
    {/if}
  </div>
{:else}
  <Piano low={pianoLow} high={pianoHigh} {marks} {flashes} {names} {interactive} label="Piano keyboard, {noteName(pianoLow)} to {noteName(pianoHigh)}" />
{/if}
{#if unplayable.length}
  <p class="mt-1 text-xs text-ws-stage-soft">{[...new Set(unplayable)].map((m) => noteName(m)).join(", ")} {unplayable.length > 1 ? "are" : "is"} out of the {inst}'s range here.</p>
{/if}

<style>
  .role-chip {
    background: color-mix(in oklch, var(--ws-stage-ink) 10%, transparent);
  }
  .role-chip[data-role="chord"] {
    background: var(--instr);
    color: var(--ws-stage);
  }
</style>

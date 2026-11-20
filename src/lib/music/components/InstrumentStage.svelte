<script lang="ts" module>
  import type { Instrument as Inst } from "@repo/music-core";
  import { AEROPHONE_RANGE as AE } from "@repo/music-core/content/winds-pads";
  import { tunings as T } from "#lib/music/drills/guitar/instrument.svelte.ts";
  import { settings as S } from "#lib/music/runtime/index.ts";
  import { positionLine } from "@repo/music-core/theory/fretboard";
  import { octaveFit, writtenOffset } from "@repo/music-core/theory/transposition";

  /** The strip's tuning when it has picked a fretted instrument (tab and the fretboard), else null. */
  export const fretTuning = (inst: Inst) =>
    inst === "guitar" ? T.pick(S.value.guitarTuningId, "guitar") : inst === "ukulele" ? T.pick(S.value.ukuleleTuningId, "ukulele") : null;

  /** Semitones from concert to written pitch on the strip's setup for `inst` (guitar's octave, the Aerophone's reading key). */
  export const writtenShift = (inst: Inst) => writtenOffset(inst, S.value, fretTuning(inst));

  /** Where each pitch of a line sits in one hand position on the strip's fretted instrument (empty off it). */
  export function linePositions(inst: Inst, midis: readonly number[]): Map<number, { string: number; fret: number }> {
    const tuning = fretTuning(inst);
    if (!tuning) return new Map();
    const pitches = [...new Set(midis)];
    const at = positionLine(tuning, pitches);
    return new Map(pitches.flatMap((m, i) => (at[i] ? [[m, at[i]!] as const] : [])));
  }

  /** Octaves a line must move so `inst` can reach it (0 when it fits, or on piano); the Aerophone's range is its written one. */
  export function fitShift(line: readonly number[], inst: Inst): number {
    if (!line.length) return 0;
    const [lo, hi] = [Math.min(...line), Math.max(...line)];
    if (inst === "aerophone") {
      const off = writtenShift("aerophone");
      return octaveFit(lo + off, hi + off, AE.lowestMidi, AE.highestMidi);
    }
    const tuning = fretTuning(inst);
    return tuning ? octaveFit(lo, hi, Math.min(...tuning.openStrings)) : 0;
  }
</script>

<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  // The instrument the practice strip has picked, drawn from one set of
  // keyboard-style marks: a keyboard, a fretboard window around the line, or the
  // Aerophone's fingering for the note now. Drills written for the keyboard use
  // it so guitar, ukulele and Aerophone players see their own instrument.
  import type { Instrument } from "@repo/music-core";
  import { noteName } from "@repo/music-core";
  import { note } from "#lib/music/names.svelte.ts";
  import { AEROPHONE_RANGE, fingeringFor } from "@repo/music-core/content/winds-pads";
  import { input, settings } from "#lib/music/runtime/index.ts";
  import Piano from "./Piano.svelte";
  import Fretboard, { type FretMark } from "./Fretboard.svelte";
  import AerophoneKeys from "./AerophoneKeys.svelte";
  import type { CellMarks, Flashes, FlashKind } from "./feedback.svelte";
  import { INSTRUMENT_LABEL } from "../bench.svelte";

  interface Props {
    /** Every pitch the exercise uses: sets the keyboard span and the fret window. */
    line: readonly number[];
    marks?: Record<number, CellMarks>;
    flashes?: Flashes<FlashKind | "order">;
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
    /** Authored strings and frets per pitch (a written phrase), instead of the hand-position fit. */
    positions?: Map<number, { string: number; fret: number }>;
    /** A live run: the keys grow taller with the screen (Piano `fill`). */
    fill?: boolean;
    /** How the keys name an accidental (the exercise's key), so a key label and the verdict agree. */
    spelling?: "flat" | "sharp";
  }
  let { line: given, marks: givenMarks = {}, flashes, current = null, names = "c", interactive = true, low, high, instrument, fit = false, positions, fill = false, spelling = "flat" }: Props = $props();

  const inst = $derived(instrument ?? settings.value.activeInstrument);
  const shift = $derived(fit ? fitShift(given, inst) : 0);
  const line = $derived(shift ? given.map((m) => m + shift) : given);
  const marks = $derived(shift ? Object.fromEntries(Object.entries(givenMarks).map(([m, mk]) => [Number(m) + shift, mk])) : givenMarks);
  // The span holds the line and every marked key, so a mark is never left off the keyboard (a call that runs past the line).
  const spanNotes = $derived([...line, ...Object.keys(marks).map(Number)]);
  const span = $derived(spanNotes.length ? { lo: Math.min(...spanNotes), hi: Math.max(...spanNotes) } : { lo: 60, hi: 72 });
  const pianoLow = $derived(low ?? Math.floor((span.lo - 2) / 12) * 12);
  const pianoHigh = $derived(high ?? Math.max(pianoLow + 24, Math.ceil((span.hi + 2) / 12) * 12));
  // Every key the run marks must be on screen: the keys shrink to the stage before any is cut off (a phone).
  const pianoFit = $derived.by(() => {
    const all = [...line, ...Object.keys(marks).map(Number)].filter((m) => m >= pianoLow && m <= pianoHigh);
    return all.length ? { low: Math.min(...all), high: Math.max(...all) } : { low: pianoLow, high: pianoHigh };
  });

  const tuning = $derived(fretTuning(inst));
  // The Aerophone is fingered and named by its written note; everything here is concert.
  const aeroShift = $derived(writtenOffset("aerophone", settings.value));
  // One place per pitch: the line in one hand position, as the tab above it writes it.
  const placed = $derived(positions ?? linePositions(inst, [...line, ...Object.keys(marks).map(Number)]));
  const unplayable = $derived(tuning ? line.filter((m) => !placed.has(m)) : inst === "aerophone" ? line.filter((m) => m + aeroShift < AEROPHONE_RANGE.lowestMidi || m + aeroShift > AEROPHONE_RANGE.highestMidi) : []);
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
  const fingerFor = (m: number) => note(fingeringFor(m + aeroShift)?.name ?? noteName(m + aeroShift));
  const held = $derived(input.held.size ? Math.max(...input.held) : null);
</script>

{#if tuning}
  <Fretboard openStrings={tuning.openStrings} from={frets.from} to={frets.to} marks={fretMarks} flashes={flashes as Flashes | undefined} flashByPitch {interactive} label={m.music_shell_stage_fretboard({ instrument: INSTRUMENT_LABEL[inst].toLowerCase(), from: frets.from, to: frets.to })} />
{:else if inst === "aerophone"}
  <div class="flex flex-col items-center gap-1" data-testid="aerophone-fingering">
    <AerophoneKeys midi={Number.isFinite(fingerNote) ? fingerNote : null} heldMidi={held} compact />
    {#if Number.isFinite(fingerNote)}<p class="font-display text-2xl font-semibold">{fingerFor(fingerNote)}</p>{/if}
    {#if roleNotes.length}
      <ul class="mt-1 flex flex-wrap justify-center gap-1" aria-label={m.music_shell_stage_fit_notes()}>
        {#each roleNotes as [m, mk] (m)}<li class="role-chip rounded-md px-2 py-1 text-sm font-semibold" data-role={mk.role}>{fingerFor(m)}{#if mk.label}<span class="ml-1 text-[0.8125rem]">{mk.label}</span>{/if}</li>{/each}
      </ul>
    {/if}
  </div>
{:else}
  <Piano low={pianoLow} high={pianoHigh} fit={pianoFit} {marks} {flashes} {names} {interactive} {fill} {spelling} label={m.music_shell_stage_piano({ low: note(noteName(pianoLow)), high: note(noteName(pianoHigh)) })} />
{/if}
{#if unplayable.length}
  <p class="mt-1 text-sm text-ws-stage-soft">{m.music_shell_stage_out_of_range({
      count: unplayable.length,
      notes: [...new Set(unplayable)].map((n) => (inst === "aerophone" ? fingerFor(n) : note(noteName(n)))).join(", "),
      instrument: INSTRUMENT_LABEL[inst].toLowerCase(),
    })}</p>
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

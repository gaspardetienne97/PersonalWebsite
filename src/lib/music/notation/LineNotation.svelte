<script lang="ts">
  // A drill's line written out above its instrument, with a cursor that runs
  // with the click or the demo so the next notes can be read ahead: tab on a
  // fretted instrument (each note at its string and fret), a staff otherwise
  // (both hands on a grand staff when the notes carry hands). A short line
  // engraves small, so it is zoomed to fill the stage (as sight-reading does).
  // The notes are concert; a staff shows them at the instrument's written pitch.
  import type { Instrument, Score, ScoreVoice } from "@repo/music-core";
  import { transposeScore } from "@repo/music-core/theory/transposition";
  import { settings } from "$lib/music/runtime";
  import { writtenShift } from "$lib/music/components/InstrumentStage.svelte";
  import Tab from "./Tab.svelte";
  import Staff from "./Staff.svelte";
  import type { GroupState } from "./NotationFrame.svelte";
  import type { BeatRange } from "./groups";

  interface Props {
    notes: { midi: number; startBeat: number; durationBeats: number; string?: number; fret?: number; hand?: "left" | "right"; finger?: number }[];
    /** Tab for this tuning; a staff without one. */
    tuning?: { openStrings: number[]; fretCount: number; name?: string } | null;
    title: string;
    cursorBeat?: number | null;
    /** By group index (each attack is a group). */
    groupStates?: Record<number, GroupState>;
    beatsPerBar?: number;
    /** The staff's key signature, in fifths (flats negative). */
    keyFifths?: number;
    /** The written time signature when it isn't beatsPerBar/4 (6/8, 3/8). */
    meter?: [number, number];
    /** Whose written pitch the staff shows; defaults to the practice strip's instrument. */
    instrument?: Instrument;
    /** Engrave on one row that scrolls with the cursor however few notes (a grand staff over many bars). */
    oneRow?: boolean;
    /** Chord symbols drawn above the staff at their beats (a lead sheet). */
    chords?: Score["chords"];
    /** Tap two notes to mark a range: the range shown tinted, and what the taps chose. */
    selection?: BeatRange | null;
    onselect?: (sel: BeatRange) => void;
    /** The tempo the selection's length is read at. */
    bpm?: number;
    /** The most a short line is zoomed up (tab defaults lower: its numbers read well small, and the neck needs the room below). */
    maxZoom?: number;
    /** The least a one-row single line is drawn at (it scrolls with the cursor instead of shrinking): a phone reads it larger. */
    minZoom?: number;
  }
  let { notes, tuning = null, title, cursorBeat = null, groupStates = {}, beatsPerBar = 4, keyFifths = 0, meter, instrument, oneRow = false, chords, selection = null, onselect, bpm, maxZoom, minZoom = 1 }: Props = $props();
  const barBeats = $derived(meter ? (meter[0] * 4) / meter[1] : beatsPerBar);

  const end = $derived(notes.reduce((m, n) => Math.max(m, n.startBeat + n.durationBeats), 0));
  const voices = $derived.by((): ScoreVoice[] => {
    const strip = ({ hand: _h, ...n }: Props["notes"][number]) => n;
    if (tuning || !notes.some((n) => n.hand)) return [{ id: "line", name: "Line", notes: notes.map(strip) }];
    return (["right", "left"] as const).flatMap((hand) => {
      const own = notes.filter((n) => (n.hand ?? "right") === hand).map(strip);
      return own.length ? [{ id: hand === "right" ? "rh" : "lh", name: hand === "right" ? "Right hand" : "Left hand", hand, notes: own }] : [];
    });
  });
  const concert = $derived<Score>({
    id: `line-${title}-${notes.map((n) => `${n.midi}.${n.string}.${n.fret}@${n.startBeat}`).join(",")}-${chords?.map((c) => c.symbol).join(",") ?? ""}`,
    title,
    bpm: 90,
    meter: meter ? { beats: meter[0], beatUnit: meter[1] } : { beats: beatsPerBar, beatUnit: 4 },
    keyFifths,
    voices,
    lengthBeats: Math.max(barBeats, Math.ceil(end / barBeats - 1e-9) * barBeats),
    ...(chords?.length && !tuning ? { chords } : {}),
    source: { kind: "generated" },
  });
  const score = $derived(tuning ? concert : transposeScore(concert, writtenShift(instrument ?? settings.value.activeInstrument)));
  let width = $state(0);
  // Measured: a line engraves at about 90 px plus 25 a note (Spider's 16 notes 521 px,
  // Fingerpicking's 32 notes 896 px). A short line is zoomed up to fill the stage (down
  // to 0.7 on a phone). A line longer than 32 notes keeps a 32-note line's size and is
  // engraved on one row that scrolls sideways with the cursor.
  const LONG = 32;
  const natural = (k: number) => 90 + 25 * k;
  const attacks = $derived(new Set(notes.map((n) => n.startBeat)).size);
  const zoomCap = $derived(maxZoom ?? (tuning ? 1.15 : 1.6));
  // A single line on one row never shrinks below full size: it scrolls with the cursor instead (a phone).
  const zoom = $derived(width ? Math.min(zoomCap, Math.max(Math.min(oneRow && voices.length === 1 && !chords?.length ? Math.max(1, minZoom) : 0.7, zoomCap), width / natural(Math.min(attacks, LONG)))) : 1);
  // One row whatever the content: wide enough for a busy grand-staff bar (chords, rests, eighths in both hands);
  // a single line needs only its notes' width, so a short one still fits the stage without scrolling.
  const busy = $derived(voices.length > 1 || !!chords?.length);
  const minWidth = $derived(oneRow && busy ? Math.max(natural(attacks), 360 * Math.ceil(end / barBeats - 1e-9)) : attacks > LONG ? natural(attacks) : 0);
  // The visible height is capped (a grand staff at 20rem at up to 1.1 zoom); taller scrolls.
  // Fingering adds a row of numbers above or below each staff.
  const fingered = $derived(notes.some((n) => n.finger !== undefined) || !!chords?.length);
  // A staff zoomed up past 1.1 gets the room its zoom asks for (two systems at 1.6 are not cut to one and a half).
  const maxHeight = $derived(`${((((voices.length > 1 ? 20 : 16) + (fingered ? 5 : 0)) * Math.max(1, zoom / 1.1)) / zoom).toFixed(2)}rem`);
</script>

<div class="line-notation" data-testid={tuning ? "line-tab" : "line-staff"} bind:clientWidth={width}>
  <div style:zoom={zoom} style:--nt-zoom={zoom}>
    {#if tuning}
      <Tab {score} {tuning} {cursorBeat} {groupStates} fill {maxHeight} {minWidth} {selection} {onselect} {bpm} snap="group" />
    {:else}
      <Staff {score} {cursorBeat} {groupStates} fill {maxHeight} {minWidth} {selection} {onselect} {bpm} snap="group" oneRow={oneRow && !busy} />
    {/if}
  </div>
</div>

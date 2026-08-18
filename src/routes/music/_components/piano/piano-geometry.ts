import { midiToNote, noteToMidi } from "@repo/music-core/engines/theory";

/**
 * One white-key-unit geometry model for the shared piano surface. Every visible
 * key, finger marker, and waterfall lane is positioned in the same units, so a
 * lane can never drift from the key it falls onto: a lane *is* its key's rect.
 *
 * Units: one white key = 1. `left`/`width` are unitless offsets from the range
 * start; the component converts them to percentages of the rendered keyboard.
 */

/** A0 - C8, the physical 88-key piano. */
export const PIANO_MIN_MIDI = 21;
export const PIANO_MAX_MIDI = 108;

/** Touch floor for interactive white keys. Wider ranges scroll, never shrink. */
export const MIN_WHITE_KEY_PX = 36;

const BLACK_KEY_UNITS = 0.62;
const WHITE_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);
const DEFAULT_LOW_MIDI = 48;
const DEFAULT_HIGH_MIDI = 72;
const MIN_SPAN_SEMITONES = 12;
const MAX_AUTO_SPAN_SEMITONES = 48;

export type PianoKeyKind = "white" | "black";

export interface PianoKey {
  midiNote: number;
  /** "C4", "C#4" - also the visible/screen-reader key label. */
  name: string;
  kind: PianoKeyKind;
  /** Left edge in white-key units from the range start. */
  left: number;
  /** Width in white-key units. */
  width: number;
}

export interface PianoRange {
  lowMidi: number;
  highMidi: number;
}

export interface PianoGeometry extends PianoRange {
  /** Number of white keys, i.e. the total width in white-key units. */
  whiteCount: number;
  keys: PianoKey[];
  whiteKeys: PianoKey[];
  blackKeys: PianoKey[];
}

export interface PianoRangeInput {
  /** Explicit range ends; either one skips auto padding/clamping rules. */
  lowMidi?: number;
  highMidi?: number;
  /** Note material the view must enclose, as MIDI numbers or note names. */
  notes?: readonly (number | string)[];
}

export function isWhiteKey(midiNote: number): boolean {
  return WHITE_PITCH_CLASSES.has(((midiNote % 12) + 12) % 12);
}

export function toMidiNote(note: number | string): number {
  return typeof note === "number" ? note : noteToMidi(note);
}

/**
 * Auto range encloses the material with one key of padding, clamps to the 88
 * keys, shows at least an octave, and caps the automatic view at four octaves.
 * An explicit end is only clamped/snapped - callers who name a range mean it.
 */
export function pianoRange(input: PianoRangeInput = {}): PianoRange {
  const material = (input.notes ?? [])
    .map(toMidiNote)
    .filter((midiNote) => Number.isFinite(midiNote));

  if (input.lowMidi !== undefined || input.highMidi !== undefined) {
    const low = clamp(input.lowMidi ?? min(material) ?? DEFAULT_LOW_MIDI);
    const high = clamp(input.highMidi ?? max(material) ?? DEFAULT_HIGH_MIDI);
    return {
      lowMidi: snapDownToWhite(Math.min(low, high)),
      highMidi: snapUpToWhite(Math.max(low, high)),
    };
  }

  const lowest = min(material);
  const highest = max(material);
  if (lowest === undefined || highest === undefined) {
    return { lowMidi: DEFAULT_LOW_MIDI, highMidi: DEFAULT_HIGH_MIDI };
  }

  let lowMidi = snapDownToWhite(clamp(lowest - 1));
  let highMidi = snapUpToWhite(clamp(highest + 1));

  while (highMidi - lowMidi < MIN_SPAN_SEMITONES) {
    if (highMidi < PIANO_MAX_MIDI) highMidi = snapUpToWhite(highMidi + 1);
    else if (lowMidi > PIANO_MIN_MIDI) lowMidi = snapDownToWhite(lowMidi - 1);
    else break;
  }

  if (highMidi - lowMidi > MAX_AUTO_SPAN_SEMITONES) {
    highMidi = snapDownToWhite(lowMidi + MAX_AUTO_SPAN_SEMITONES);
  }

  return { lowMidi, highMidi };
}

export function pianoGeometry(input: PianoRangeInput = {}): PianoGeometry {
  const { lowMidi, highMidi } = pianoRange(input);
  const keys: PianoKey[] = [];
  let whiteCount = 0;

  for (let midiNote = lowMidi; midiNote <= highMidi; midiNote += 1) {
    const name = midiToNote(midiNote);
    if (isWhiteKey(midiNote)) {
      keys.push({ midiNote, name, kind: "white", left: whiteCount, width: 1 });
      whiteCount += 1;
      continue;
    }
    // Every black key follows a white key, so the running white count is the
    // boundary the black key straddles. ponytail: centred on the boundary
    // rather than the real (slightly offset) piano layout - one number, and
    // lanes stay aligned with what the eye reads as the key's middle.
    keys.push({
      midiNote,
      name,
      kind: "black",
      left: whiteCount - BLACK_KEY_UNITS / 2,
      width: BLACK_KEY_UNITS,
    });
  }

  return {
    lowMidi,
    highMidi,
    whiteCount,
    keys,
    whiteKeys: keys.filter((key) => key.kind === "white"),
    blackKeys: keys.filter((key) => key.kind === "black"),
  };
}

/** Percent-of-keyboard box for a key, for CSS positioning. */
export function keyPercent(
  geometry: PianoGeometry,
  key: Pick<PianoKey, "left" | "width">,
): { left: number; width: number } {
  const unit = geometry.whiteCount > 0 ? 100 / geometry.whiteCount : 0;
  return { left: key.left * unit, width: key.width * unit };
}

/**
 * Horizontal waterfall lane for a note, in white-key units. A lane is the key's
 * own box, so a falling note always lands on the key it names.
 */
export function noteLane(
  geometry: PianoGeometry,
  midiNote: number,
): { left: number; width: number } | undefined {
  const key = geometry.keys.find((candidate) => candidate.midiNote === midiNote);
  return key ? { left: key.left, width: key.width } : undefined;
}

/** Minimum rendered keyboard width that keeps white keys at the touch floor. */
export function minKeyboardWidthPx(geometry: PianoGeometry): number {
  return geometry.whiteCount * MIN_WHITE_KEY_PX;
}

function clamp(midiNote: number): number {
  return Math.min(PIANO_MAX_MIDI, Math.max(PIANO_MIN_MIDI, Math.round(midiNote)));
}

function snapDownToWhite(midiNote: number): number {
  let candidate = midiNote;
  while (candidate > PIANO_MIN_MIDI && !isWhiteKey(candidate)) candidate -= 1;
  return candidate;
}

function snapUpToWhite(midiNote: number): number {
  let candidate = midiNote;
  while (candidate < PIANO_MAX_MIDI && !isWhiteKey(candidate)) candidate += 1;
  return candidate;
}

function min(values: number[]): number | undefined {
  return values.length > 0 ? Math.min(...values) : undefined;
}

function max(values: number[]): number | undefined {
  return values.length > 0 ? Math.max(...values) : undefined;
}

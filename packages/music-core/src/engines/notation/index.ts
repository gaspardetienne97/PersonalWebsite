import { Key, Note } from "tonal";

import type {
  Score,
  TieMark,
  TupletMark,
  WrittenPitch,
  WrittenStep,
} from "@repo/music-core/domain";

export type Clef = "treble" | "bass";
export type NotationDuration = "w" | "h" | "q" | "8" | "16";

export interface NotationEvent {
  id: string;
  kind: "note" | "rest";
  voiceId: string;
  staff: Clef;
  startBeat: number;
  durationBeats: number;
  duration: NotationDuration;
  dots: number;
  pitches: WrittenPitch[];
  tie?: TieMark;
  tuplet?: TupletMark;
}

export interface NotationMeasure {
  index: number;
  startBeat: number;
  durationBeats: number;
  events: NotationEvent[];
  ties: TieMark[];
  tuplets: TupletMark[];
}

export interface NotationView {
  keySignature: string;
  timeSignature: { numerator: number; denominator: number };
  measures: NotationMeasure[];
  staves: { id: string; clef: Clef; voiceIds: string[] }[];
}

export function spellMidiForKey(midi: number, keySignature: string): WrittenPitch {
  const scale = scalePitchClasses(keySignature);
  const chroma = normalizeChroma(midi);
  const scalePitch = scale.find((pitchClass) => Note.chroma(pitchClass) === chroma);
  const pitchClass = scalePitch ?? chromaticPitchClass(midi, prefersFlats(scale));
  const octave = octaveForWrittenPitch(pitchClass, midi);
  const note = Note.get(`${pitchClass}${octave}`);

  if (note.empty || note.letter === "" || note.oct === undefined) {
    throw new Error(`Cannot spell MIDI note ${midi} in ${keySignature}`);
  }

  return {
    step: note.letter as WrittenStep,
    ...(note.acc === "" ? {} : { accidental: note.acc as WrittenPitch["accidental"] }),
    octave: note.oct,
  };
}

export function writtenPitchName(pitch: WrittenPitch, includeOctave = false): string {
  const accidental = pitch.accidental === "natural" ? "" : (pitch.accidental ?? "");
  return `${pitch.step}${accidental}${includeOctave ? pitch.octave : ""}`;
}

export function enharmonicEqual(left: string, right: string): boolean {
  const leftChroma = Note.chroma(left);
  const rightChroma = Note.chroma(right);
  return leftChroma !== null && rightChroma !== null && leftChroma === rightChroma;
}

export function notationView(score: Score): NotationView {
  const timeSignature = score.timeSignatures.find(({ atBeat }) => atBeat === 0);
  if (!timeSignature) throw new Error("Score needs a time signature at beat 0");
  if (score.timeSignatures.some(({ atBeat }) => atBeat !== 0)) {
    throw new Error("Mid-score time-signature changes are not supported yet");
  }

  const measureDuration = timeSignature.numerator * (4 / timeSignature.denominator);
  const voiceClefs = new Map(
    score.voices.map((voice) => [voice.id, voice.role === "bass" ? "bass" : "treble"] as const),
  );
  const events = [
    ...groupNoteEvents(score, voiceClefs),
    ...(score.rests ?? []).map((rest) =>
      createEvent({
        id: `rest:${rest.voiceId}:${rest.startBeat}:${rest.durationBeats}`,
        kind: "rest",
        voiceId: rest.voiceId,
        staff: clefFor(rest.voiceId, voiceClefs),
        startBeat: rest.startBeat,
        durationBeats: rest.durationBeats,
        pitches: [],
        ...(rest.tuplet === undefined ? {} : { tuplet: rest.tuplet }),
      }),
    ),
  ].sort(
    (left, right) =>
      left.startBeat - right.startBeat ||
      left.staff.localeCompare(right.staff) ||
      left.voiceId.localeCompare(right.voiceId),
  );
  const endBeat = Math.max(
    measureDuration,
    ...events.map((event) => event.startBeat + event.durationBeats),
  );
  const measureCount = Math.ceil(endBeat / measureDuration);
  const measures = Array.from({ length: measureCount }, (_, index) => {
    const measureEvents = events.filter(
      ({ startBeat }) =>
        startBeat >= index * measureDuration && startBeat < (index + 1) * measureDuration,
    );
    return {
      index,
      startBeat: index * measureDuration,
      durationBeats: measureDuration,
      events: measureEvents,
      ties: uniqueMarks(measureEvents.flatMap(({ tie }) => (tie === undefined ? [] : [tie]))),
      tuplets: uniqueMarks(
        measureEvents.flatMap(({ tuplet }) => (tuplet === undefined ? [] : [tuplet])),
      ),
    };
  });

  return {
    keySignature: score.keySignature ?? "C major",
    timeSignature: {
      numerator: timeSignature.numerator,
      denominator: timeSignature.denominator,
    },
    measures,
    staves: (["treble", "bass"] as const)
      .map((clef) => ({
        id: clef,
        clef,
        voiceIds: score.voices
          .filter((voice) => clefFor(voice.id, voiceClefs) === clef)
          .map(({ id }) => id),
      }))
      .filter(({ voiceIds }) => voiceIds.length > 0),
  };
}

function groupNoteEvents(score: Score, voiceClefs: ReadonlyMap<string, Clef>): NotationEvent[] {
  const grouped = new Map<string, typeof score.notes>();

  for (const note of score.notes) {
    const key = [
      note.voiceId,
      note.startBeat,
      note.durationBeats,
      note.tie?.id ?? "",
      note.tuplet?.id ?? "",
    ].join(":");
    const group = grouped.get(key) ?? [];
    group.push(note);
    grouped.set(key, group);
  }

  return [...grouped.values()].map((notes) => {
    const first = notes[0]!;
    return createEvent({
      id: `note:${first.voiceId}:${first.startBeat}:${first.durationBeats}`,
      kind: "note",
      voiceId: first.voiceId,
      staff: clefFor(first.voiceId, voiceClefs),
      startBeat: first.startBeat,
      durationBeats: first.durationBeats,
      pitches: notes.map(
        (note) =>
          note.writtenPitch ?? spellMidiForKey(note.midiNote, score.keySignature ?? "C major"),
      ),
      ...(first.tie === undefined ? {} : { tie: first.tie }),
      ...(first.tuplet === undefined ? {} : { tuplet: first.tuplet }),
    });
  });
}

function createEvent(event: Omit<NotationEvent, "duration" | "dots">): NotationEvent {
  const { duration, dots } = notationDuration(event.durationBeats, event.tuplet);
  return { ...event, duration, dots };
}

function notationDuration(
  durationBeats: number,
  tuplet?: TupletMark,
): { duration: NotationDuration; dots: number } {
  const normalized = tuplet ? durationBeats * (tuplet.actual / tuplet.normal) : durationBeats;
  const candidates: [number, NotationDuration, number][] = [
    [4, "w", 0],
    [3, "h", 1],
    [2, "h", 0],
    [1.5, "q", 1],
    [1, "q", 0],
    [0.75, "8", 1],
    [0.5, "8", 0],
    [0.375, "16", 1],
    [0.25, "16", 0],
  ];
  const match = candidates.find(([beats]) => Math.abs(beats - normalized) < 0.000_001);
  if (!match) throw new Error(`Unsupported notation duration: ${durationBeats} beats`);
  return { duration: match[1], dots: match[2] };
}

function clefFor(voiceId: string, voiceClefs: ReadonlyMap<string, Clef>): Clef {
  return voiceClefs.get(voiceId) ?? "treble";
}

function scalePitchClasses(keySignature: string): readonly string[] {
  const match = /^(.+)\s+(major|minor)$/i.exec(keySignature.trim());
  if (!match) throw new Error(`Unsupported key signature: ${keySignature}`);
  const [, tonic, mode] = match;
  const scale =
    mode?.toLowerCase() === "minor"
      ? Key.minorKey(tonic!).natural.scale
      : Key.majorKey(tonic!).scale;
  if (scale.length === 0) throw new Error(`Unsupported key signature: ${keySignature}`);
  return scale;
}

function prefersFlats(scale: readonly string[]): boolean {
  const flatCount = scale.join("").match(/b/g)?.length ?? 0;
  const sharpCount = scale.join("").match(/#/g)?.length ?? 0;
  return flatCount > sharpCount;
}

function chromaticPitchClass(midi: number, preferFlats: boolean): string {
  const note = preferFlats ? Note.fromMidi(midi) : Note.fromMidiSharps(midi);
  return Note.pitchClass(note);
}

function octaveForWrittenPitch(pitchClass: string, midi: number): number {
  const approximate = Math.floor(midi / 12) - 1;
  for (let octave = approximate - 1; octave <= approximate + 1; octave += 1) {
    if (Note.midi(`${pitchClass}${octave}`) === midi) return octave;
  }
  throw new Error(`Cannot place ${pitchClass} at MIDI note ${midi}`);
}

function normalizeChroma(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12;
}

function uniqueMarks<T extends { id: string }>(marks: T[]): T[] {
  return [...new Map(marks.map((mark) => [mark.id, mark])).values()];
}

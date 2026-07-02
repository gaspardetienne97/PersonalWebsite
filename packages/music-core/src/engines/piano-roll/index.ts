/**
 * Piano-roll editing — pure, immutable edits on a canonical {@link Score}. The
 * route renders a pitch×time grid over a Score's notes (one colour per voice =
 * multitrack-lite) and calls these helpers to add/remove notes; playback and
 * export reuse the existing `scoreToPattern` / `scoreToMidiBlob` /
 * `renderEventsToWav` engines, so the roll has no playback code of its own.
 */

import type { Score, ScoreNote, ScoreSection } from "@repo/music-core/domain";

import { takeToScore, type Take } from "../recording";

export const PIANO_ROLL_VELOCITY = 0.85;

export interface PianoRollCell {
  voiceId: string;
  midiNote: number;
  startBeat: number;
  durationBeats: number;
  velocity?: number;
}

export interface PianoRollResize {
  voiceId: string;
  midiNote: number;
  beat: number;
  endBeat: number;
  minDurationBeats?: number;
}

export interface PianoRollGridStep {
  step: number;
  beat: number;
  bar: number;
  stepInBar: number;
  isBarStart: boolean;
}

export interface PianoRollGrid {
  barCount: number;
  beatCount: number;
  stepCount: number;
  steps: PianoRollGridStep[];
}

export interface PianoRollGridOptions {
  beatsPerBar?: number;
  stepBeats?: number;
  minBars?: number;
}

export interface PianoRollSectionEdit {
  name: string;
  startBeat: number;
  endBeat: number;
}

/** A blank 3-track score (Lead/Keys/Bass) for a fresh piano-roll session. */
export function createPianoRollScore(bpm = 100): Score {
  return {
    id: "piano-roll",
    title: "Piano Roll",
    origin: "generated",
    tempoMap: [{ atBeat: 0, bpm }],
    timeSignatures: [{ atBeat: 0, numerator: 4, denominator: 4 }],
    voices: [
      { id: "lead", name: "Lead", role: "melody" },
      { id: "keys", name: "Keys", role: "harmony" },
      { id: "bass", name: "Bass", role: "bass" },
    ],
    notes: [],
    chords: [],
    sections: [],
    markers: [],
  };
}

export function createPianoRollScoreFromTake(take: Take, bpm = 100): Score {
  const score = takeToScore(take, bpm);
  const voiceName = take.name.trim() || "Imported take";
  return {
    ...score,
    voices: [{ id: "lead", name: voiceName, role: "melody" }],
    notes: score.notes.map((note) => ({ ...note, voiceId: "lead" })),
  };
}

export function mergeTakeIntoPianoRollScore(score: Score, take: Take, bpm = 100): Score {
  const imported = createPianoRollScoreFromTake(take, bpm);
  const withVoice = addVoice(score, imported.voices[0]?.name ?? "Imported take");
  const voiceId = withVoice.voices.at(-1)?.id ?? "lead";
  return {
    ...withVoice,
    notes: [...withVoice.notes, ...imported.notes.map((note) => ({ ...note, voiceId }))],
  };
}

export function addPianoRollSection(score: Score, section: PianoRollSectionEdit): Score {
  const nextSection: ScoreSection = {
    id: uniqueSectionId(score.sections, section.name),
    name: section.name.trim() || "Section",
    startBeat: section.startBeat,
    endBeat: section.endBeat,
  };
  assertSectionRange(nextSection);
  assertNoSectionOverlap(score.sections, nextSection);
  return {
    ...score,
    sections: [...score.sections, nextSection].sort(
      (left, right) => left.startBeat - right.startBeat || left.endBeat - right.endBeat,
    ),
  };
}

export function renamePianoRollSection(score: Score, sectionId: string, name: string): Score {
  const nextName = name.trim();
  if (!nextName) return score;
  return {
    ...score,
    sections: score.sections.map((section) =>
      section.id === sectionId ? { ...section, name: nextName } : section,
    ),
  };
}

export function resizePianoRollSection(
  score: Score,
  sectionId: string,
  range: Pick<PianoRollSectionEdit, "startBeat" | "endBeat">,
): Score {
  const section = score.sections.find((candidate) => candidate.id === sectionId);
  if (!section) return score;
  const resized: ScoreSection = {
    ...section,
    startBeat: range.startBeat,
    endBeat: range.endBeat,
  };
  assertSectionRange(resized);
  assertNoSectionOverlap(
    score.sections.filter((candidate) => candidate.id !== sectionId),
    resized,
  );
  return {
    ...score,
    sections: score.sections
      .map((candidate) => (candidate.id === sectionId ? resized : candidate))
      .sort((left, right) => left.startBeat - right.startBeat || left.endBeat - right.endBeat),
  };
}

export function removePianoRollSection(score: Score, sectionId: string): Score {
  return { ...score, sections: score.sections.filter((section) => section.id !== sectionId) };
}

/** The note in `voiceId` at `midiNote` whose span covers `beat`, if any. */
export function noteAt(
  score: Score,
  voiceId: string,
  midiNote: number,
  beat: number,
): ScoreNote | undefined {
  return score.notes.find(
    (note) =>
      note.voiceId === voiceId &&
      note.midiNote === midiNote &&
      beat >= note.startBeat &&
      beat < note.startBeat + note.durationBeats,
  );
}

/**
 * Add a note at the cell, or remove the note already covering it (so clicking a
 * placed note deletes it). Returns a new Score; the input is never mutated.
 *
 * ponytail: overlapping notes in the same voice/pitch are allowed — no
 * auto-trim. Add trimming if it becomes a problem in practice.
 */
export function toggleNoteAt(score: Score, cell: PianoRollCell): Score {
  const existing = noteAt(score, cell.voiceId, cell.midiNote, cell.startBeat);
  if (existing) {
    return { ...score, notes: score.notes.filter((note) => note !== existing) };
  }
  const note: ScoreNote = {
    midiNote: cell.midiNote,
    startBeat: cell.startBeat,
    durationBeats: cell.durationBeats,
    velocity: cell.velocity ?? PIANO_ROLL_VELOCITY,
    voiceId: cell.voiceId,
  };
  return { ...score, notes: [...score.notes, note] };
}

/** Set every note in a voice to one velocity. */
export function setVoiceVelocity(score: Score, voiceId: string, velocity: number): Score {
  const nextVelocity = Math.max(0, Math.min(1, velocity));
  return {
    ...score,
    notes: score.notes.map((note) =>
      note.voiceId === voiceId ? { ...note, velocity: nextVelocity } : note,
    ),
  };
}

/** Resize the note covering `beat` by moving its end. */
export function resizeNoteAt(score: Score, edit: PianoRollResize): Score {
  const existing = noteAt(score, edit.voiceId, edit.midiNote, edit.beat);
  if (!existing) return score;
  const minDuration = edit.minDurationBeats ?? 0.25;
  const durationBeats = Math.max(minDuration, edit.endBeat - existing.startBeat);
  return {
    ...score,
    notes: score.notes.map((note) => (note === existing ? { ...note, durationBeats } : note)),
  };
}

/** Add a voice with a stable unique id derived from its name. */
export function addVoice(score: Score, name = "Track"): Score {
  const baseName = name.trim() || "Track";
  const existingIds = new Set(score.voices.map((voice) => voice.id));
  const existingNames = new Set(score.voices.map((voice) => voice.name));
  let index = 1;
  let voiceName = baseName;
  while (existingNames.has(voiceName)) {
    index += 1;
    voiceName = `${baseName} ${index}`;
  }
  const baseId = slugify(voiceName);
  let id = baseId;
  let suffix = 2;
  while (existingIds.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }
  return {
    ...score,
    voices: [...score.voices, { id, name: voiceName, role: "melody" }],
  };
}

/** Remove a voice and its notes. */
export function removeVoice(score: Score, voiceId: string): Score {
  return {
    ...score,
    voices: score.voices.filter((voice) => voice.id !== voiceId),
    notes: score.notes.filter((note) => note.voiceId !== voiceId),
  };
}

/** Drop every note belonging to a voice (the per-track "clear"). */
export function clearVoice(score: Score, voiceId: string): Score {
  return { ...score, notes: score.notes.filter((note) => note.voiceId !== voiceId) };
}

/** Drop the notes of muted voices — used to build the playable/export score. */
export function withoutVoices(score: Score, mutedVoiceIds: Iterable<string>): Score {
  const muted = new Set(mutedVoiceIds);
  if (muted.size === 0) return score;
  return { ...score, notes: score.notes.filter((note) => !muted.has(note.voiceId)) };
}

/** Loop length in beats: the last note end rounded up to a whole bar (min 1). */
export function scoreLoopBeats(score: Score, beatsPerBar = 4, minBars = 1): number {
  const end = score.notes.reduce(
    (latest, note) => Math.max(latest, note.startBeat + note.durationBeats),
    0,
  );
  const bars = Math.max(minBars, Math.ceil(end / beatsPerBar));
  return bars * beatsPerBar;
}

/** Build the time axis used by the piano-roll route. */
export function buildPianoRollGrid(
  score: Score,
  { beatsPerBar = 4, stepBeats = 0.25, minBars = 2 }: PianoRollGridOptions = {},
): PianoRollGrid {
  const beatCount = scoreLoopBeats(score, beatsPerBar, minBars);
  const barCount = beatCount / beatsPerBar;
  const stepsPerBar = Math.round(beatsPerBar / stepBeats);
  const stepCount = Math.round(beatCount / stepBeats);
  const steps = Array.from({ length: stepCount }, (_, step) => {
    const beat = step * stepBeats;
    const stepInBar = step % stepsPerBar;
    return {
      step,
      beat,
      bar: Math.floor(step / stepsPerBar) + 1,
      stepInBar,
      isBarStart: stepInBar === 0,
    };
  });
  return { barCount, beatCount, stepCount, steps };
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "track"
  );
}

function uniqueSectionId(sections: ScoreSection[], name: string): string {
  const existingIds = new Set(sections.map((section) => section.id));
  const base = slugify(name || "Section");
  let id = base;
  let suffix = 2;
  while (existingIds.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  return id;
}

function assertSectionRange(section: ScoreSection): void {
  if (section.endBeat <= section.startBeat) {
    throw new Error("Piano-roll sections must end after they start");
  }
}

function assertNoSectionOverlap(sections: ScoreSection[], nextSection: ScoreSection): void {
  const overlaps = sections.some(
    (section) => nextSection.startBeat < section.endBeat && nextSection.endBeat > section.startBeat,
  );
  if (overlaps) {
    throw new Error("Piano-roll sections must not overlap");
  }
}

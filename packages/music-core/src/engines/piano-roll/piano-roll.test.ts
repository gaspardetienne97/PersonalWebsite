import { describe, expect, test } from "vitest";

import {
  addVoice,
  clearVoice,
  createPianoRollScore,
  noteAt,
  PIANO_ROLL_VELOCITY,
  removeVoice,
  resizeNoteAt,
  scoreLoopBeats,
  setVoiceVelocity,
  toggleNoteAt,
  withoutVoices,
} from "./index";

const cell = (over: Partial<Parameters<typeof toggleNoteAt>[1]> = {}) => ({
  voiceId: "lead",
  midiNote: 60,
  startBeat: 0,
  durationBeats: 1,
  ...over,
});

describe("toggleNoteAt", () => {
  test("adds a note on an empty cell with the default velocity", () => {
    const next = toggleNoteAt(createPianoRollScore(), cell());
    expect(next.notes).toEqual([
      expect.objectContaining({
        voiceId: "lead",
        midiNote: 60,
        startBeat: 0,
        durationBeats: 1,
        velocity: PIANO_ROLL_VELOCITY,
      }),
    ]);
  });

  test("removes the covering note when the cell already has one", () => {
    const withNote = toggleNoteAt(createPianoRollScore(), cell({ durationBeats: 2 }));
    // Click a cell inside the placed note (beat 1 of a 2-beat note) → removes it.
    const cleared = toggleNoteAt(withNote, cell({ startBeat: 1 }));
    expect(cleared.notes).toHaveLength(0);
  });

  test("does not mutate the input score", () => {
    const score = createPianoRollScore();
    toggleNoteAt(score, cell());
    expect(score.notes).toHaveLength(0);
  });

  test("keeps notes in other voices/pitches independent", () => {
    let score = toggleNoteAt(createPianoRollScore(), cell());
    score = toggleNoteAt(score, cell({ voiceId: "bass", midiNote: 36 }));
    expect(score.notes).toHaveLength(2);
    expect(noteAt(score, "bass", 36, 0)).toBeDefined();
    expect(noteAt(score, "lead", 36, 0)).toBeUndefined();
  });
});

test("clearVoice drops only that voice's notes", () => {
  let score = toggleNoteAt(createPianoRollScore(), cell());
  score = toggleNoteAt(score, cell({ voiceId: "bass", midiNote: 36 }));
  const cleared = clearVoice(score, "lead");
  expect(cleared.notes).toHaveLength(1);
  expect(cleared.notes[0]?.voiceId).toBe("bass");
});

test("setVoiceVelocity updates one voice and clamps the value", () => {
  let score = toggleNoteAt(createPianoRollScore(), cell({ velocity: 0.4 }));
  score = toggleNoteAt(score, cell({ voiceId: "bass", midiNote: 36, velocity: 0.6 }));

  const next = setVoiceVelocity(score, "lead", 2);
  expect(next.notes.find((note) => note.voiceId === "lead")?.velocity).toBe(1);
  expect(next.notes.find((note) => note.voiceId === "bass")?.velocity).toBe(0.6);
});

describe("resizeNoteAt", () => {
  test("resizes only the note covering the beat", () => {
    let score = toggleNoteAt(createPianoRollScore(), cell({ durationBeats: 1 }));
    score = toggleNoteAt(score, cell({ voiceId: "bass", midiNote: 36, durationBeats: 1 }));

    const next = resizeNoteAt(score, {
      voiceId: "lead",
      midiNote: 60,
      beat: 0,
      endBeat: 2,
      minDurationBeats: 0.25,
    });

    expect(noteAt(next, "lead", 60, 0)?.durationBeats).toBe(2);
    expect(noteAt(next, "bass", 36, 0)?.durationBeats).toBe(1);
  });

  test("clamps resize to the minimum duration", () => {
    const score = toggleNoteAt(createPianoRollScore(), cell({ startBeat: 1, durationBeats: 1 }));

    const next = resizeNoteAt(score, {
      voiceId: "lead",
      midiNote: 60,
      beat: 1,
      endBeat: 0.5,
      minDurationBeats: 0.25,
    });

    expect(noteAt(next, "lead", 60, 1)?.durationBeats).toBe(0.25);
  });
});

describe("voice editing", () => {
  test("adds a uniquely named voice", () => {
    const score = addVoice(createPianoRollScore(), "Lead");
    expect(score.voices.at(-1)).toMatchObject({ id: "lead-2", name: "Lead 2" });
  });

  test("removes a voice and its notes", () => {
    let score = toggleNoteAt(createPianoRollScore(), cell());
    score = toggleNoteAt(score, cell({ voiceId: "bass", midiNote: 36 }));

    const next = removeVoice(score, "lead");
    expect(next.voices.map((voice) => voice.id)).not.toContain("lead");
    expect(next.notes.map((note) => note.voiceId)).toEqual(["bass"]);
  });
});

test("withoutVoices removes muted voices' notes", () => {
  let score = toggleNoteAt(createPianoRollScore(), cell());
  score = toggleNoteAt(score, cell({ voiceId: "bass", midiNote: 36 }));
  expect(withoutVoices(score, ["bass"]).notes).toHaveLength(1);
  expect(withoutVoices(score, []).notes).toHaveLength(2);
});

describe("scoreLoopBeats", () => {
  test("rounds the last note end up to a whole bar", () => {
    const empty = createPianoRollScore();
    expect(scoreLoopBeats(empty)).toBe(4); // min one bar

    const score = toggleNoteAt(empty, cell({ startBeat: 4, durationBeats: 1 }));
    expect(scoreLoopBeats(score)).toBe(8); // note ends at beat 5 → 2 bars
  });
});

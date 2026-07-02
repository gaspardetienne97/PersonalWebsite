import { describe, expect, test } from "vitest";

import {
  addVoice,
  clearVoice,
  createPianoRollScoreFromTake,
  createPianoRollScore,
  buildPianoRollGrid,
  addPianoRollSection,
  mergeTakeIntoPianoRollScore,
  noteAt,
  PIANO_ROLL_VELOCITY,
  removeVoice,
  removePianoRollSection,
  renamePianoRollSection,
  resizePianoRollSection,
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

describe("buildPianoRollGrid", () => {
  test("renders enough steps for notes beyond the initial two bars", () => {
    let score = createPianoRollScore();
    score = toggleNoteAt(score, cell({ startBeat: 9, durationBeats: 1 }));

    const grid = buildPianoRollGrid(score, { beatsPerBar: 4, stepBeats: 0.25, minBars: 2 });

    expect(grid.barCount).toBe(3);
    expect(grid.stepCount).toBe(48);
    expect(grid.steps[32]).toMatchObject({ step: 32, beat: 8, bar: 3, stepInBar: 0 });
    expect(grid.steps.at(-1)).toMatchObject({ step: 47, beat: 11.75, bar: 3 });
  });
});

describe("createPianoRollScoreFromTake", () => {
  test("maps a recorded take into an editable lead track", () => {
    const score = createPianoRollScoreFromTake(
      {
        id: "take-1",
        name: "Morning idea",
        source: "midi",
        durationMs: 1_000,
        notes: [
          { midi: 60, atMs: 0, velocity: 0.8 },
          { midi: 64, atMs: 500, velocity: 0.7 },
        ],
      },
      120,
    );

    expect(score).toMatchObject({
      id: "take-1",
      title: "Morning idea",
      origin: "midi",
      voices: [{ id: "lead", name: "Morning idea", role: "melody" }],
    });
    expect(score.notes).toEqual([
      expect.objectContaining({ voiceId: "lead", midiNote: 60, startBeat: 0 }),
      expect.objectContaining({ voiceId: "lead", midiNote: 64, startBeat: 1 }),
    ]);
    expect(score.tempoMap[0]?.bpm).toBe(120);
  });
});

describe("mergeTakeIntoPianoRollScore", () => {
  test("adds a recorded take as a uniquely named track without replacing existing notes", () => {
    let score = toggleNoteAt(createPianoRollScore(100), cell({ midiNote: 67, startBeat: 0 }));
    score = addVoice(score, "Morning idea");

    const merged = mergeTakeIntoPianoRollScore(
      score,
      {
        id: "take-1",
        name: "Morning idea",
        source: "midi",
        durationMs: 1_000,
        notes: [
          { midi: 60, atMs: 0, velocity: 0.8 },
          { midi: 64, atMs: 500, velocity: 0.7 },
        ],
      },
      120,
    );

    expect(merged.voices.map((voice) => voice.name)).toEqual([
      "Lead",
      "Keys",
      "Bass",
      "Morning idea",
      "Morning idea 2",
    ]);
    expect(merged.notes).toEqual([
      expect.objectContaining({ voiceId: "lead", midiNote: 67 }),
      expect.objectContaining({ voiceId: "morning-idea-2", midiNote: 60, startBeat: 0 }),
      expect.objectContaining({ voiceId: "morning-idea-2", midiNote: 64, startBeat: 1 }),
    ]);
    expect(score.notes).toHaveLength(1);
  });
});

describe("piano-roll arrangement sections", () => {
  test("adds, renames, and removes non-overlapping score sections immutably", () => {
    const score = createPianoRollScore();

    const withIntro = addPianoRollSection(score, {
      name: "Intro",
      startBeat: 0,
      endBeat: 4,
    });
    const withVerse = addPianoRollSection(withIntro, {
      name: "Verse",
      startBeat: 4,
      endBeat: 8,
    });
    const renamed = renamePianoRollSection(withVerse, "intro", "Head");
    const removed = removePianoRollSection(renamed, "verse");

    expect(withVerse.sections).toEqual([
      { id: "intro", name: "Intro", startBeat: 0, endBeat: 4 },
      { id: "verse", name: "Verse", startBeat: 4, endBeat: 8 },
    ]);
    expect(renamed.sections[0]).toMatchObject({ id: "intro", name: "Head" });
    expect(removed.sections).toEqual([{ id: "intro", name: "Head", startBeat: 0, endBeat: 4 }]);
    expect(score.sections).toHaveLength(0);
  });

  test("rejects overlapping arrangement sections", () => {
    const score = addPianoRollSection(createPianoRollScore(), {
      name: "Intro",
      startBeat: 0,
      endBeat: 4,
    });

    expect(() =>
      addPianoRollSection(score, {
        name: "Verse",
        startBeat: 3,
        endBeat: 8,
      }),
    ).toThrow("Piano-roll sections must not overlap");
  });

  test("resizes arrangement sections while preserving overlap validation", () => {
    const score = addPianoRollSection(
      addPianoRollSection(createPianoRollScore(), {
        name: "Intro",
        startBeat: 0,
        endBeat: 4,
      }),
      {
        name: "Verse",
        startBeat: 4,
        endBeat: 8,
      },
    );

    const resized = resizePianoRollSection(score, "intro", { startBeat: 0, endBeat: 2 });

    expect(resized.sections).toEqual([
      { id: "intro", name: "Intro", startBeat: 0, endBeat: 2 },
      { id: "verse", name: "Verse", startBeat: 4, endBeat: 8 },
    ]);
    expect(score.sections[0]).toMatchObject({ startBeat: 0, endBeat: 4 });
    expect(() => resizePianoRollSection(score, "intro", { startBeat: 0, endBeat: 5 })).toThrow(
      "Piano-roll sections must not overlap",
    );
  });
});

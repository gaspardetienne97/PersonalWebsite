import { describe, expect, test } from "vitest";

import { curatedTunings } from "@repo/music-core/engines/tunings";

import {
  filterScoreVoices,
  fretWindowAround,
  projectFretboard,
  projectPiano,
  projectPlayableGroup,
  projectScoreToAerophone,
  projectScoreToFretboard,
  projectScoreToPiano,
} from "./index";

function tabScore(notes: { midiNote: number; startBeat: number }[]) {
  return {
    id: "tab",
    origin: "midi" as const,
    tempoMap: [{ atBeat: 0, bpm: 120 }],
    timeSignatures: [{ atBeat: 0, numerator: 4, denominator: 4 }],
    voices: [{ id: "v1", name: "Melody", role: "melody" as const }],
    notes: notes.map(({ midiNote, startBeat }) => ({
      midiNote,
      startBeat,
      durationBeats: 1,
      velocity: 0.8,
      voiceId: "v1",
    })),
    chords: [],
    sections: [],
    markers: [],
  };
}

const guitarStandard = curatedTunings("guitar")[0]!;
const ukuleleHighG = curatedTunings("ukulele")[0]!;

describe("music-core/projection", () => {
  test("filters a score to selected voices without mutating global score lanes", () => {
    const score = {
      id: "parts",
      origin: "musicxml" as const,
      tempoMap: [{ atBeat: 0, bpm: 120 }],
      timeSignatures: [{ atBeat: 0, numerator: 4, denominator: 4 }],
      voices: [
        { id: "P1:voice:1", name: "Piano · Voice 1", role: "other" as const },
        { id: "P2:voice:1", name: "Bass · Voice 1", role: "bass" as const },
      ],
      notes: [
        {
          midiNote: 60,
          startBeat: 0,
          durationBeats: 1,
          velocity: 0.8,
          voiceId: "P1:voice:1",
        },
        {
          midiNote: 40,
          startBeat: 0,
          durationBeats: 4,
          velocity: 0.8,
          voiceId: "P2:voice:1",
        },
      ],
      rests: [
        { startBeat: 1, durationBeats: 1, voiceId: "P1:voice:1" },
        { startBeat: 4, durationBeats: 4, voiceId: "P2:voice:1" },
      ],
      chords: [{ symbol: "C", startBeat: 0 }],
      sections: [{ id: "full", name: "Full", startBeat: 0, endBeat: 8 }],
      markers: [{ id: "a", beat: 2, label: "A", kind: "annotation" as const }],
      lyrics: [{ text: "La", startBeat: 0 }],
    };

    const filtered = filterScoreVoices(score, ["P2:voice:1"]);

    expect(filtered.voices.map(({ id }) => id)).toEqual(["P2:voice:1"]);
    expect(filtered.notes.map(({ midiNote }) => midiNote)).toEqual([40]);
    expect(filtered.rests).toEqual([{ startBeat: 4, durationBeats: 4, voiceId: "P2:voice:1" }]);
    expect(filtered.chords).toEqual(score.chords);
    expect(filtered.sections).toEqual(score.sections);
    expect(filtered.markers).toEqual(score.markers);
    expect(filtered.lyrics).toEqual(score.lyrics);
    expect(score.notes).toHaveLength(2);
  });

  test("projects exact piano keys with a stable hand split", () => {
    expect(projectPiano([48, 60, 72])).toEqual([
      { midiNote: 48, hand: "left" },
      { midiNote: 60, hand: "right" },
      { midiNote: 72, hand: "right" },
    ]);
  });

  test("projects score notes to piano hands from semantic voice roles", () => {
    const score = {
      ...tabScore([]),
      id: "piano-hands",
      voices: [
        { id: "right", name: "Right Hand", role: "melody" as const },
        { id: "left", name: "Left Hand", role: "bass" as const },
      ],
      notes: [
        {
          midiNote: 55,
          startBeat: 0,
          durationBeats: 1,
          velocity: 0.8,
          voiceId: "right",
        },
        {
          midiNote: 67,
          startBeat: 0,
          durationBeats: 1,
          velocity: 0.8,
          voiceId: "left",
        },
      ],
    };

    expect(projectScoreToPiano(score).notes).toEqual([
      {
        sourceIndex: 0,
        midiNote: 55,
        startBeat: 0,
        durationBeats: 1,
        hand: "right",
      },
      {
        sourceIndex: 1,
        midiNote: 67,
        startBeat: 0,
        durationBeats: 1,
        hand: "left",
      },
    ]);
  });

  test("uses the requested register split when a score voice has no hand role", () => {
    const score = {
      ...tabScore([
        { midiNote: 59, startBeat: 0 },
        { midiNote: 60, startBeat: 1 },
      ]),
      voices: [{ id: "v1", name: "Piano", role: "other" as const }],
    };

    expect(projectScoreToPiano(score, { splitMidi: 60 }).notes.map(({ hand }) => hand)).toEqual([
      "left",
      "right",
    ]);
  });

  test("projects every valid fretboard location in conventional string order", () => {
    expect(projectFretboard([64], guitarStandard)).toEqual(
      expect.arrayContaining([
        { midiNote: 64, string: 1, fret: 0 },
        { midiNote: 64, string: 2, fret: 5 },
      ]),
    );
    expect(projectFretboard([67], ukuleleHighG)).toEqual(
      expect.arrayContaining([{ midiNote: 67, string: 4, fret: 0 }]),
    );
  });

  test("finds a compact grouped-note solution using distinct strings", () => {
    const group = projectPlayableGroup([60, 64, 67], guitarStandard);

    expect(group?.positions).toHaveLength(3);
    expect(new Set(group?.positions.map(({ string }) => string)).size).toBe(3);
    expect(group?.span).toBeLessThanOrEqual(5);
  });

  test("respects the requested fret-span limit", () => {
    expect(projectPlayableGroup([60, 64, 67], guitarStandard, 1)).toBeUndefined();
  });

  test("rejects groups outside the selected instrument range", () => {
    expect(projectPlayableGroup([40, 41, 42], ukuleleHighG)).toBeUndefined();
  });

  test("projects a score to tab, one note per onset, lowest playable position", () => {
    const projection = projectScoreToFretboard(
      tabScore([
        { midiNote: 40, startBeat: 0 }, // low E -> open string 6
        { midiNote: 64, startBeat: 1 }, // high E -> open string 1
      ]),
      guitarStandard,
    );

    expect(projection.options).toMatchObject({
      instrument: "guitar",
      profileId: "guitar.standard",
    });
    expect(projection.notes).toEqual([
      {
        sourceIndex: 0,
        midiNote: 40,
        startBeat: 0,
        durationBeats: 1,
        frets: [{ string: 6, fret: 0 }],
      },
      {
        sourceIndex: 1,
        midiNote: 64,
        startBeat: 1,
        durationBeats: 1,
        frets: [{ string: 1, fret: 0 }],
      },
    ]);
  });

  test("places notes sharing an onset on distinct strings as one shape", () => {
    const projection = projectScoreToFretboard(
      tabScore([
        { midiNote: 60, startBeat: 0 },
        { midiNote: 64, startBeat: 0 },
        { midiNote: 67, startBeat: 0 },
      ]),
      guitarStandard,
    );

    const strings = projection.notes.map((note) => note.frets?.[0]?.string);
    expect(new Set(strings).size).toBe(3);
    expect(projection.notes).toHaveLength(3);
  });

  test("drops notes that fall off the fretboard", () => {
    const projection = projectScoreToFretboard(
      tabScore([{ midiNote: 20, startBeat: 0 }]), // below the lowest open string
      guitarStandard,
    );

    expect(projection.notes).toEqual([
      { sourceIndex: 0, midiNote: 20, startBeat: 0, durationBeats: 1 },
    ]);
  });

  test("reduces a score to a monophonic top-line for the Aerophone", () => {
    const projection = projectScoreToAerophone(
      tabScore([
        { midiNote: 60, startBeat: 0 }, // chord onset: keep the top note (67)
        { midiNote: 64, startBeat: 0 },
        { midiNote: 67, startBeat: 0 },
        { midiNote: 62, startBeat: 1 },
      ]),
    );

    expect(projection.options).toMatchObject({ instrument: "aerophone" });
    expect(projection.notes.map((note) => note.midiNote)).toEqual([67, 62]);
    expect(projection.notes.map((note) => note.startBeat)).toEqual([0, 1]);
  });
});

describe("fretWindowAround", () => {
  test("adds one fret of context on each side and keeps a minimum width", () => {
    expect(fretWindowAround([5, 6, 7, 8], 22)).toEqual({ start: 4, end: 9 });
    expect(fretWindowAround([0, 1, 2, 3], 22)).toEqual({ start: 0, end: 4 });
    expect(fretWindowAround([12], 15)).toEqual({ start: 11, end: 15 });
    expect(fretWindowAround([3, 5], 22)).toEqual({ start: 2, end: 6 });
  });

  test("falls back to the nut when nothing is played and clamps to the instrument", () => {
    expect(fretWindowAround([], 22)).toEqual({ start: 0, end: 4 });
    expect(fretWindowAround([21, 22], 22)).toEqual({ start: 18, end: 22 });
    expect(fretWindowAround([2], 3, { minWidth: 8 })).toEqual({ start: 0, end: 3 });
  });
});

import { describe, expect, test } from "vitest";

import {
  extractedNotesToDraft,
  parseManualTranscription,
  transcriptionDraftToScore,
} from "./index";

describe("parseManualTranscription", () => {
  test("parses note start/duration rows into draft notes", () => {
    const draft = parseManualTranscription("C4 0 1\nE4 1 0.5\nG4 1.5 0.5", {
      id: "draft-1",
      title: "Voice memo",
      bpm: 90,
    });

    expect(draft.notes).toEqual([
      { midiNote: 60, startBeat: 0, durationBeats: 1, confidence: 1 },
      { midiNote: 64, startBeat: 1, durationBeats: 0.5, confidence: 1 },
      { midiNote: 67, startBeat: 1.5, durationBeats: 0.5, confidence: 1 },
    ]);
  });

  test("rejects malformed manual rows with a stable line number", () => {
    expect(() =>
      parseManualTranscription("C4 0 1\nbad row", {
        id: "draft-1",
        title: "Voice memo",
        bpm: 90,
      }),
    ).toThrow("Line 2");
  });
});

test("transcriptionDraftToScore creates a canonical audio-transcription score", () => {
  const draft = parseManualTranscription("C4 0 1\nE4 1 1", {
    id: "draft-1",
    title: "Voice memo",
    bpm: 90,
    source: {
      kind: "audio-file",
      name: "memo.wav",
      mimeType: "audio/wav",
      durationSec: 8,
    },
  });

  const score = transcriptionDraftToScore(draft);

  expect(score).toMatchObject({
    id: "draft-1-score",
    title: "Voice memo",
    origin: "audio-transcription",
    tempoMap: [{ atBeat: 0, bpm: 90 }],
    voices: [{ id: "transcribed-melody", name: "Transcribed melody", role: "melody" }],
    sections: [
      {
        id: "full-transcription",
        name: "Full transcription",
        startBeat: 0,
        endBeat: 2,
      },
    ],
  });
  expect(score.notes.map((note) => note.midiNote)).toEqual([60, 64]);
});

test("extractedNotesToDraft maps second-based extractor output to beat-based draft notes", () => {
  const draft = extractedNotesToDraft(
    [
      { midiNote: 60, startSec: 0, durationSec: 0.5, confidence: 0.8 },
      { midiNote: 64, startSec: 0.5, durationSec: 0.25, confidence: 0.7 },
    ],
    { id: "extract-1", title: "Memo", bpm: 120 },
  );

  expect(draft.notes).toEqual([
    { midiNote: 60, startBeat: 0, durationBeats: 1, confidence: 0.8 },
    { midiNote: 64, startBeat: 1, durationBeats: 0.5, confidence: 0.7 },
  ]);
});

import { describe, expect, test, vi } from "vitest";

import {
  Capability,
  monotonicMs,
  unixMs,
  type NoteEvent,
  type ScoringEvent,
} from "@repo/music-core/domain";
import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
import type { PipelineServices } from "@repo/music-core/engines/exercise";
import { InputRouter } from "@repo/music-core/engines/input-router";
import { writtenPitchName } from "@repo/music-core/engines/notation";
import { ProgressEngine } from "@repo/music-core/engines/progress";
import { beatToMs, type ScoreFollowerLiveState } from "@repo/music-core/engines/score-follower";
import { SkillGraphStore, seedCoreSkills } from "@repo/music-core/engines/skills";
import type { NoteReadingOptions } from "@repo/music-core/exercises/note-reading";
import type {
  SightReadingOptions,
  SightReadingPrompt,
} from "@repo/music-core/exercises/sight-reading";
import type { NoteReadingPrompt } from "@repo/music-core/exercises/note-reading";

import { normalizeReadingDrillConfig, ReadingSession } from "./index";

describe("ReadingSession", () => {
  test("preserves the configured range when normalizing settled setup", () => {
    const config = normalizeReadingDrillConfig(new URLSearchParams("low=60&high=60"));
    expect(normalizeReadingDrillConfig(config)).toEqual(config);
  });
  test("normalizes shareable reading drill config values", () => {
    const params = new URLSearchParams(
      "activity=sight-reading&instrument=guitar&tuning=guitar-drop-d&clefs=treble,bass&key=G%20major&low=55&high=79&level=level-3&difficulty=0.7&transpose=2&prompt=chord&answer=play&mode=performance&bpm=128&strict=strict&meter=compound&measures=4",
    );

    expect(normalizeReadingDrillConfig(params)).toEqual({
      activity: "sight-reading",
      instrument: "guitar",
      tuningId: "guitar-drop-d",
      clefs: ["treble", "bass"],
      keySignature: "G major",
      range: { lowestMidi: 55, highestMidi: 79 },
      readingLevel: "level-3",
      difficulty: 0.7,
      transposeSemitones: 2,
      promptKind: "chord",
      answerMode: "play",
      mode: "performance",
      bpm: 128,
      strictness: "strict",
      meter: "compound",
      measures: 4,
    });

    expect(
      normalizeReadingDrillConfig({
        activity: "speed-run",
        instrument: "mandolin",
        clef: "alto",
        key: "H major",
        low: "120",
        high: "12",
        difficulty: "2",
        level: "impossible",
        transpose: "99",
        prompt: "cluster",
        answer: "sing",
        mode: "listen",
        bpm: "500",
        strict: "exact",
        meter: "odd",
        measures: "20",
      }),
    ).toEqual({
      activity: "flashcards",
      instrument: "piano",
      clefs: ["treble"],
      keySignature: "C major",
      range: { lowestMidi: 48, highestMidi: 84 },
      readingLevel: "level-1",
      difficulty: 1,
      transposeSemitones: 0,
      promptKind: "single-note",
      answerMode: "choice",
      mode: "wait",
      bpm: 200,
      strictness: "normal",
      meter: "simple",
      measures: 8,
    });
  });

  test("starts and advances a ten-prompt choice flashcard session through the pipeline", async () => {
    const dependencies = await setup();
    const session = new ReadingSession(dependencies);
    const skillsIngest = vi.spyOn(dependencies.services.skills, "ingest");
    const analyticsIngest = vi.spyOn(dependencies.services.analytics, "ingest");
    const progressIngest = vi.spyOn(dependencies.services.progress, "ingest");

    await session.startFlashcards({ ...pianoOptions(), answerMode: "choice", length: 10 });
    const prompt = session.state.currentPrompt as NoteReadingPrompt;
    const answer = writtenPitchName(prompt.writtenPitches[0]!);
    await session.answerChoice(answer);

    expect(session.state).toMatchObject({
      status: "flashcard",
      currentIndex: 1,
      total: 10,
    });
    expect(session.state.results).toHaveLength(1);
    expect(skillsIngest).toHaveBeenCalledOnce();
    expect(analyticsIngest).toHaveBeenCalledOnce();
    expect(progressIngest).toHaveBeenCalledOnce();
    session.dispose();
  });

  test("holds an incorrect practice answer until continue and retries only missed prompts", async () => {
    const dependencies = await setup();
    const session = new ReadingSession(dependencies);

    await session.startFlashcards({
      ...pianoOptions(),
      answerMode: "choice",
      feedbackMode: "immediate",
      length: 2,
    });
    const firstPrompt = session.state.currentPrompt as NoteReadingPrompt;
    const expected = writtenPitchName(firstPrompt.writtenPitches[0]!);
    const wrong = firstPrompt.choices.find((choice) => choice !== expected)!;

    await session.answerChoice(wrong);

    expect(session.state).toMatchObject({
      status: "flashcard",
      currentIndex: 0,
      awaitingContinue: true,
      feedback: { prompt: firstPrompt, result: { answer: wrong, correct: false } },
    });
    await expect(session.answerChoice(wrong)).rejects.toThrow("Continue to the next flashcard");

    session.continueFlashcard();
    expect(session.state).toMatchObject({ status: "flashcard", currentIndex: 1 });
    const secondPrompt = session.state.currentPrompt as NoteReadingPrompt;
    await session.answerChoice(writtenPitchName(secondPrompt.writtenPitches[0]!));
    expect(session.state.awaitingContinue).toBeUndefined();
    expect(session.state.status).toBe("summary");

    const firstRunId = session.state.results[0]?.event.runId;
    expect(session.prepareMissedFlashcards()).toBe(true);
    expect(session.state).toMatchObject({
      status: "flashcard",
      currentIndex: 0,
      total: 1,
      currentPrompt: firstPrompt,
    });
    await session.answerChoice(expected);
    expect(session.state.summary?.results[0]?.event.runId).not.toBe(firstRunId);
    session.dispose();
  });

  test("records a revealed hint on only the current flashcard", async () => {
    const dependencies = await setup();
    const session = new ReadingSession(dependencies);
    await session.startFlashcards({ ...pianoOptions(), answerMode: "play", length: 2 });
    session.revealFlashcardHint();
    expect(session.state.hintUsed).toBe(true);
    let prompt = session.state.currentPrompt as NoteReadingPrompt;
    dependencies.router.noteOn(prompt.midiNotes[0]!);
    await vi.waitFor(() => expect(session.state.results).toHaveLength(1));
    expect(session.state.results[0]?.event).toMatchObject({
      assistance: "hinted",
      instrument: "piano",
      source: "onscreen",
    });
    expect(session.state.hintUsed).toBe(false);
    prompt = session.state.currentPrompt as NoteReadingPrompt;
    dependencies.router.noteOn(prompt.midiNotes[0]!);
    await vi.waitFor(() => expect(session.state.status).toBe("summary"));
    expect(session.state.summary?.results[1]?.event.assistance).toBe("independent");
    session.dispose();
  });

  test("advances a choice flashcard from routed MIDI input", async () => {
    const dependencies = await setup();
    const session = new ReadingSession(dependencies);

    await session.startFlashcards({ ...pianoOptions(), answerMode: "choice", length: 1 });
    const prompt = session.state.currentPrompt as NoteReadingPrompt;
    dependencies.router.push(noteOn(prompt.midiNotes[0]!, 1_000));

    await vi.waitFor(() => expect(session.state.status).toBe("summary"));
    expect(session.state.results[0]?.result).toMatchObject({ correct: true, score: 1 });
    session.dispose();
  });

  test("uses the scheduler to prioritize a weak reading skill", async () => {
    const dependencies = await setup();
    for (let index = 0; index < 4; index += 1) {
      await dependencies.services.analytics.ingest(
        readingEvent(`weak-${index}`, "reading.treble.stepwise", 0),
      );
    }
    const session = new ReadingSession(dependencies);

    await session.startFlashcards({ ...pianoOptions(), answerMode: "choice", length: 2 });

    expect(session.queue[0]?.targetSkillId).toBe("reading.treble.stepwise");
    session.dispose();
  });

  test("finishes a complete played chord from routed on-screen input", async () => {
    const dependencies = await setup();
    const session = new ReadingSession(dependencies);
    await session.startFlashcards({
      ...pianoOptions(),
      promptKind: "chord",
      answerMode: "play",
      length: 1,
    });

    for (const midiNote of (session.state.currentPrompt as NoteReadingPrompt).midiNotes) {
      dependencies.router.noteOn(midiNote, "onscreen", "piano");
    }

    await vi.waitFor(() => expect(session.state.status).toBe("summary"));
    expect(session.state.results[0]?.result).toMatchObject({ correct: true, score: 1 });
    session.dispose();
  });

  test("preserves a completed prompt and scoring id for persistence retry", async () => {
    const dependencies = await setup();
    vi.spyOn(dependencies.services.analytics, "ingest").mockRejectedValueOnce(
      new Error("Persistence unavailable"),
    );
    const session = new ReadingSession(dependencies);
    await session.startFlashcards({ ...pianoOptions(), answerMode: "choice", length: 1 });
    const prompt = session.state.currentPrompt as NoteReadingPrompt;
    const answer = writtenPitchName(prompt.writtenPitches[0]!);

    await expect(session.answerChoice(answer)).rejects.toThrow("Persistence unavailable");
    expect(session.state).toMatchObject({
      status: "flashcard",
      currentIndex: 0,
      currentPrompt: prompt,
      error: "Persistence unavailable",
    });
    expect(dependencies.makeId).toHaveBeenCalledOnce();

    await session.retrySave();
    expect(session.state.status).toBe("summary");
    expect(session.state.results[0]?.event.id).toBe("reading-event-1");
    expect(dependencies.makeId).toHaveBeenCalledOnce();
    session.dispose();
  });

  test("coordinates a perfect sight-reading run through the pipeline", async () => {
    const dependencies = await setup();
    const session = new ReadingSession(dependencies);
    const analyticsIngest = vi.spyOn(dependencies.services.analytics, "ingest");

    await session.prepareSightReading(sightReadingOptions());
    expect(session.state.status).toBe("sight-reading");
    expect(session.state.countIn).toBe("ready");

    const prompt = session.state.currentPrompt as SightReadingPrompt;
    const startTimestampMs = monotonicMs(1_000);
    await session.startSightReading(startTimestampMs);
    expect(session.state.countIn).toBe("playing");
    expect((session.state.live as ScoreFollowerLiveState | undefined)?.expectedMidiNotes).toEqual(
      expect.any(Array),
    );

    for (const group of prompt.groups) {
      for (const midiNote of group.midiNotes) {
        dependencies.router.push(
          noteOn(midiNote, startTimestampMs + beatToMs(group.startBeat, sightReadingOptions().bpm)),
        );
      }
    }

    await session.finishSightReading();
    expect(session.state.status).toBe("summary");
    expect(session.state.results[0]?.result).toMatchObject({ correct: true, score: 1 });
    expect(session.state.results[0]?.event).toMatchObject({
      exerciseId: "reading.sight-reading.generated",
      assistance: "guided",
    });
    expect(analyticsIngest).toHaveBeenCalledOnce();
    session.dispose();
  });

  test("prepares sight-reading prompts with level metadata and transposition", async () => {
    const dependencies = await setup();
    const session = new ReadingSession(dependencies);

    await session.prepareSightReading({
      ...sightReadingOptions(),
      readingLevel: "level-2",
      transposeSemitones: -2,
    });

    const prompt = session.state.currentPrompt as SightReadingPrompt;
    expect(prompt.readingLevel).toMatchObject({ id: "level-2", label: "Level 2" });
    expect(prompt.transposeSemitones).toBe(-2);
    expect(prompt.options.transposeSemitones).toBe(-2);
    expect(prompt.score.markers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "transpose", label: "Transpose -2 st", kind: "practice" }),
      ]),
    );
    session.dispose();
  });

  test("retimes a prepared sight-reading prompt without replacing its notation content", async () => {
    const dependencies = await setup();
    const session = new ReadingSession(dependencies);

    await session.prepareSightReading(sightReadingOptions());
    const prepared = session.state.currentPrompt as SightReadingPrompt;
    const notes = structuredClone(prepared.score.notes);

    session.retimePreparedSightReading({
      bpm: 70,
      timeSignature: { numerator: 6, denominator: 8 },
    });

    const retimed = session.state.currentPrompt as SightReadingPrompt;
    expect(retimed.score.notes).toEqual(notes);
    expect(retimed.options).toMatchObject({
      bpm: 70,
      timeSignature: { numerator: 6, denominator: 8 },
    });
    expect(retimed.score.tempoMap).toEqual([{ atBeat: 0, bpm: 70 }]);
    expect(retimed.score.timeSignatures).toEqual([{ atBeat: 0, numerator: 6, denominator: 8 }]);

    await session.startSightReading(monotonicMs(1_000));
    for (const group of retimed.groups) {
      for (const midiNote of group.midiNotes) {
        dependencies.router.push(noteOn(midiNote, 1_000 + beatToMs(group.startBeat, 70)));
      }
    }
    await session.finishSightReading();
    expect(session.state.results[0]?.result).toMatchObject({ correct: true, score: 1 });
    session.dispose();
  });

  test("preserves a completed sight-reading result for persistence retry", async () => {
    const dependencies = await setup();
    vi.spyOn(dependencies.services.analytics, "ingest").mockRejectedValueOnce(
      new Error("Persistence unavailable"),
    );
    const session = new ReadingSession(dependencies);

    await session.prepareSightReading(sightReadingOptions());
    const prompt = session.state.currentPrompt as SightReadingPrompt;
    await session.startSightReading(monotonicMs(1_000));
    for (const group of prompt.groups) {
      for (const midiNote of group.midiNotes) {
        dependencies.router.push(
          noteOn(midiNote, 1_000 + beatToMs(group.startBeat, sightReadingOptions().bpm)),
        );
      }
    }

    await expect(session.finishSightReading()).rejects.toThrow("Persistence unavailable");
    expect(session.state).toMatchObject({
      status: "sight-reading",
      currentPrompt: prompt,
      error: "Persistence unavailable",
    });
    expect(dependencies.makeId).toHaveBeenCalledOnce();

    await session.retrySave();
    expect(session.state.status).toBe("summary");
    expect(session.state.results[0]?.event.id).toBe("reading-event-1");
    expect(dependencies.makeId).toHaveBeenCalledOnce();
    session.dispose();
  });

  test("prepares a compact sight-reading retry from missed groups", async () => {
    const dependencies = await setup();
    const session = new ReadingSession(dependencies);

    await session.prepareSightReading(sightReadingOptions());
    const prompt = session.state.currentPrompt as SightReadingPrompt;
    await session.startSightReading(monotonicMs(1_000));
    for (const midiNote of prompt.groups[0]!.midiNotes) {
      dependencies.router.push(noteOn(midiNote, 1_000));
    }
    await session.finishSightReading();

    expect(session.state.summary?.results[0]?.result.answer).toMatchObject({
      missedGroups: prompt.groups.slice(1),
    });

    const prepared = session.prepareMissedSightReading();

    expect(prepared).toBe(true);
    expect(session.state.status).toBe("sight-reading");
    expect(session.state.countIn).toBe("ready");
    const retryPrompt = session.state.currentPrompt as SightReadingPrompt;
    expect(retryPrompt.groups).toHaveLength(prompt.groups.length - 1);
    expect(retryPrompt.groups[0]).toMatchObject({
      startBeat: 0,
      midiNotes: prompt.groups[1]!.midiNotes,
    });
    expect(prompt.groups[1]!.startBeat).toBeGreaterThan(0);
    expect(retryPrompt.score.notes[0]?.startBeat).toBe(0);
    session.dispose();
  });
});

async function setup() {
  const router = new InputRouter({ now: () => 0 });
  const skills = new SkillGraphStore();
  await skills.seed(seedCoreSkills());
  const services: PipelineServices = {
    skills,
    analytics: new AnalyticsEngine(),
    progress: new ProgressEngine(),
  };
  let id = 0;
  return {
    router,
    services,
    random: () => 0,
    now: () => 1_700_000_000_000,
    makeId: vi.fn(() => `reading-event-${++id}`),
  };
}

function pianoOptions(): NoteReadingOptions {
  return {
    instrument: "piano",
    clefs: ["treble"],
    keys: ["C major"],
    range: { lowestMidi: 60, highestMidi: 72 },
    promptKind: "single-note",
  };
}

function sightReadingOptions(): SightReadingOptions {
  return {
    instrument: "piano",
    keySignature: "C major",
    clefs: ["treble"],
    measures: 1,
    bpm: 60,
    timeSignature: { numerator: 4, denominator: 4 },
    mode: "performance",
    strictness: "normal",
    difficulty: 0.3,
    readingLevel: "level-1",
    transposeSemitones: 0,
  };
}

function noteOn(midiNote: number, timestamp: number): NoteEvent {
  return {
    type: "noteOn",
    midiNote,
    velocity: 1,
    source: "midi",
    timestamp: monotonicMs(timestamp),
    clock: "performance",
  };
}

function readingEvent(id: string, skillId: string, score: number): ScoringEvent {
  return {
    id,
    sessionId: "history",
    exerciseId: "reading.flashcard.note-id",
    skillIds: [skillId],
    capabilities: [Capability.Reading],
    at: unixMs(1_699_000_000_000),
    correct: score === 1,
    partialCredit: score,
    difficulty: 0.4,
    metrics: [],
  };
}

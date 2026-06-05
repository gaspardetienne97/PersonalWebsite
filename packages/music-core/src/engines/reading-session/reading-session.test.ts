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

import { ReadingSession } from "./index";

describe("ReadingSession", () => {
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
    expect(session.state.results[0]?.event.exerciseId).toBe("reading.sight-reading.generated");
    expect(analyticsIngest).toHaveBeenCalledOnce();
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

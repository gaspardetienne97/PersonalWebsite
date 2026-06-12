import { describe, expect, test, vi } from "vitest";

import { monotonicMs, type ControlChangeEvent, type NoteOnEvent } from "@repo/music-core/domain";
import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
import type { PipelineServices } from "@repo/music-core/engines/exercise";
import { InputRouter } from "@repo/music-core/engines/input-router";
import { ProgressEngine } from "@repo/music-core/engines/progress";
import { SkillGraphStore, seedCoreSkills } from "@repo/music-core/engines/skills";

import { TechniqueSession, type TechniqueSessionState } from "./index";

describe("TechniqueSession", () => {
  test("completes an Aerophone long tone through the shared pipeline", async () => {
    const dependencies = await setup();
    const session = new TechniqueSession(dependencies);

    await session.startLongTone({ targetMidi: 67, holdMs: 3_000 });
    dependencies.router.push(aerophoneNote(67, 0));
    dependencies.router.push(breath(0.7, 0));
    dependencies.router.push(breath(0.72, 1_000));
    dependencies.router.push(breath(0.69, 2_000));
    dependencies.router.push(breath(0.71, 3_000));

    await vi.waitFor(() => expect(session.state.status).toBe("summary"));
    expect(session.state.summary).toMatchObject({
      total: 1,
      correct: 1,
      breathSteadiness: expect.any(Number),
    });
    expect(session.state.summary?.breathSteadiness).toBeGreaterThan(0.9);
    expect(session.state.results[0]?.event.skillIds).toContain(
      "technique.aerophone.breath-steadiness",
    );
    expect(dependencies.services.progress.state.xp).toBeGreaterThan(0);
    session.dispose();
  });

  test("abandons an Aerophone long tone and allows a clean restart", async () => {
    const dependencies = await setup();
    const session = new TechniqueSession(dependencies);

    await session.startLongTone({ targetMidi: 67, holdMs: 3_000 });
    session.abandon();

    expect(session.state.status).toBe("abandoned");
    await expect(session.startLongTone({ targetMidi: 69, holdMs: 5_000 })).resolves.toMatchObject({
      targetMidi: 69,
      holdMs: 5_000,
    });
    expect(session.state.status).toBe("active");
    session.dispose();
  });

  test("completes an Aerophone dynamic swell through the shared pipeline", async () => {
    const dependencies = await setup();
    const session = new TechniqueSession(dependencies);

    await session.startSwell({ targetMidi: 67, durationMs: 4_000 });
    dependencies.router.push(aerophoneNote(67, 0));
    dependencies.router.push(breath(0.2, 0));
    dependencies.router.push(breath(0.55, 1_000));
    dependencies.router.push(breath(0.9, 2_000));
    dependencies.router.push(breath(0.55, 3_000));
    dependencies.router.push(breath(0.2, 4_000));

    await vi.waitFor(() => expect(session.state.status).toBe("summary"));
    expect(session.state.summary).toMatchObject({
      total: 1,
      correct: 1,
      noteAccuracy: 1,
    });
    expect(session.state.results[0]?.result.score).toBeGreaterThan(0.9);
    expect(session.state.results[0]?.event.skillIds).toContain(
      "technique.aerophone.dynamic-control",
    );
    session.dispose();
  });

  test("completes a clean C major scale and unlocks the next tempo", async () => {
    const dependencies = await setup();
    const session = new TechniqueSession(dependencies);
    let latest: TechniqueSessionState = session.state;
    const unsubscribe = session.subscribe((state) => {
      latest = state;
    });

    await session.startScale({ tonic: "C4", scale: "major", bpm: 100 });
    [60, 62, 64, 65, 67, 69, 71, 72].forEach((midiNote, index) => {
      dependencies.router.push(note(midiNote, index * 600));
    });

    await vi.waitFor(() => expect(latest.status).toBe("summary"));
    expect(latest.summary).toMatchObject({
      total: 1,
      correct: 1,
      noteAccuracy: 1,
      highestUnlockedBpm: 110,
      nextTargetBpm: 110,
    });
    expect(latest.summary?.meanEvennessErrorMs).toBe(0);
    expect(latest.results[0]?.event.skillIds).toContain("technique.scale.major");
    expect(dependencies.services.progress.state.xp).toBeGreaterThan(0);

    unsubscribe();
    session.dispose();
  });

  test("keeps the current tempo locked after an inaccurate scale", async () => {
    const dependencies = await setup();
    const session = new TechniqueSession(dependencies);

    await session.startScale({ tonic: "C4", scale: "major", bpm: 100 });
    [60, 62, 64, 66, 67, 69, 71, 72].forEach((midiNote, index) => {
      dependencies.router.push(note(midiNote, index * 600));
    });

    await vi.waitFor(() => expect(session.state.status).toBe("summary"));
    expect(session.state.summary).toMatchObject({
      correct: 0,
      highestUnlockedBpm: 100,
      nextTargetBpm: 100,
    });
    expect(session.state.results[0]?.result.feedback[0]?.message).toContain("notes 7/8");
    session.dispose();
  });

  test("keeps the active run available when persistence fails", async () => {
    const dependencies = await setup();
    vi.spyOn(dependencies.services.analytics, "ingest").mockRejectedValueOnce(
      new Error("Persistence unavailable"),
    );
    const session = new TechniqueSession(dependencies);

    await session.startScale({ tonic: "C4", scale: "major", bpm: 100 });
    [60, 62, 64, 65, 67, 69, 71, 72].forEach((midiNote, index) => {
      dependencies.router.push(note(midiNote, index * 600));
    });

    await vi.waitFor(() => expect(session.state.error).toBe("Persistence unavailable"));
    expect(session.state.status).toBe("active");
    expect(session.state.currentPrompt?.label).toBe("C major");

    await session.retrySave();
    expect(session.state.status).toBe("summary");
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
    now: () => 1_700_000_000_000,
    makeId: () => `technique-event-${++id}`,
  };
}

function note(midiNote: number, atMs: number): NoteOnEvent {
  return {
    type: "noteOn",
    midiNote,
    velocity: 1,
    source: "midi",
    timestamp: monotonicMs(atMs),
    clock: "midi",
  };
}

function aerophoneNote(midiNote: number, atMs: number): NoteOnEvent {
  return {
    ...note(midiNote, atMs),
    instrument: "aerophone",
    channel: 1,
  };
}

function breath(value: number, atMs: number): ControlChangeEvent {
  return {
    type: "cc",
    controller: 2,
    value,
    instrument: "aerophone",
    channel: 1,
    source: "midi",
    timestamp: monotonicMs(atMs),
    clock: "midi",
  };
}

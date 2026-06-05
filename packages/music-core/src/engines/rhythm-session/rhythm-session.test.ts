import { describe, expect, test, vi } from "vitest";

import { monotonicMs, type NoteEvent } from "@repo/music-core/domain";
import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
import type { PipelineServices } from "@repo/music-core/engines/exercise";
import { InputRouter } from "@repo/music-core/engines/input-router";
import { ProgressEngine } from "@repo/music-core/engines/progress";
import { SkillGraphStore, seedCoreSkills } from "@repo/music-core/engines/skills";

import { RhythmSession, type RhythmSessionState } from "./index";

describe("RhythmSession", () => {
  test("completes and persists an in-time quarter-note pulse", async () => {
    const dependencies = await setup();
    const session = new RhythmSession(dependencies);
    let latest: RhythmSessionState = session.state;
    const unsubscribe = session.subscribe((state) => {
      latest = state;
    });

    await session.start({ bpm: 120, beats: 4, startTimestampMs: 1_000 });
    [1_000, 1_500, 2_000, 2_500].forEach((atMs) => dependencies.router.push(tap(atMs)));

    await vi.waitFor(() => expect(latest.status).toBe("summary"));
    expect(latest.summary).toMatchObject({ total: 1, correct: 1 });
    expect(latest.results[0]?.result.score).toBeGreaterThan(0.9);
    expect(latest.results[0]?.event.skillIds).toContain("rhythm.quarter-pulse");
    expect(dependencies.services.progress.state.xp).toBeGreaterThan(0);

    unsubscribe();
    session.dispose();
  });

  test("reports consistent rushing in the completed result", async () => {
    const dependencies = await setup();
    const session = new RhythmSession(dependencies);

    await session.start({ bpm: 120, beats: 4, startTimestampMs: 1_000 });
    [930, 1_430, 1_930, 2_430].forEach((atMs) => dependencies.router.push(tap(atMs)));

    await vi.waitFor(() => expect(session.state.status).toBe("summary"));
    expect(session.state.summary).toMatchObject({ total: 1, correct: 0 });
    expect(session.state.results[0]?.result.feedback[0]?.message).toContain("ahead");
    expect(
      session.state.results[0]?.event.metrics.filter((metric) => metric.kind === "timing"),
    ).toHaveLength(4);
    session.dispose();
  });

  test("keeps the active run available when persistence fails", async () => {
    const dependencies = await setup();
    vi.spyOn(dependencies.services.analytics, "ingest").mockRejectedValueOnce(
      new Error("Persistence unavailable"),
    );
    const session = new RhythmSession(dependencies);

    await session.start({ bpm: 120, beats: 1, startTimestampMs: 1_000 });
    dependencies.router.push(tap(1_000));

    await vi.waitFor(() => expect(session.state.error).toBe("Persistence unavailable"));
    expect(session.state.status).toBe("active");
    expect(session.state.currentPrompt?.expectedMs).toEqual([1_000]);

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
    makeId: () => `rhythm-event-${++id}`,
  };
}

function tap(atMs: number): NoteEvent {
  return {
    type: "noteOn",
    midiNote: 60,
    velocity: 1,
    source: "midi",
    timestamp: monotonicMs(atMs),
    clock: "midi",
  };
}

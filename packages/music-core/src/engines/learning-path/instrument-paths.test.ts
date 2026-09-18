import { describe, expect, it } from "vitest";
import { unixMs, type ScoringEvent } from "@repo/music-core/domain";
import { seedCoreSkills } from "@repo/music-core/engines/skills";

import {
  INSTRUMENT_PATHS,
  INSTRUMENT_PATH_IDS,
  buildInstrumentPath,
  type InstrumentPathId,
} from "./instrument-paths";

const ROW_COUNTS: Record<InstrumentPathId, number> = { guitar: 9, piano: 9, mpc: 8 };

const event = (overrides: Partial<ScoringEvent> = {}): ScoringEvent => ({
  id: "e1",
  sessionId: "s1",
  exerciseId: "technique.scale.c-major-one-octave-up",
  skillIds: ["technique.scale.major"],
  capabilities: [],
  at: unixMs(1),
  correct: true,
  partialCredit: 1,
  difficulty: 0.5,
  metrics: [],
  modality: "played",
  assistance: "independent",
  instrument: "piano",
  ...overrides,
});

describe("buildInstrumentPath", () => {
  it("gates the piano path on its prerequisite chain", () => {
    const empty = buildInstrumentPath("piano");
    expect(empty.steps[0]?.id).toBe("P-B1");
    expect(empty.steps[0]?.status).toBe("next");
    expect(empty.steps[1]?.id).toBe("P-B2");
    expect(empty.steps[1]?.status).toBe("locked");

    const passed = buildInstrumentPath("piano", { instrument: "piano", events: [event()] });
    expect(passed.steps[0]?.status).toBe("done");
    expect(passed.steps[1]?.status).toBe("next");
    expect(passed.next?.id).toBe("P-B2");
  });

  it("does not unlock on hinted evidence", () => {
    const hinted = buildInstrumentPath("piano", {
      instrument: "piano",
      events: [event({ assistance: "hinted" })],
    });
    expect(hinted.steps[0]?.status).toBe("next");
    expect(hinted.steps[1]?.status).toBe("locked");
  });

  it("authors every curriculum row with resolvable prerequisites", () => {
    for (const id of INSTRUMENT_PATH_IDS) {
      const definition = INSTRUMENT_PATHS[id];
      const ids = definition.steps.map((step) => step.id);
      expect(ids).toHaveLength(ROW_COUNTS[id]);
      expect(new Set(ids).size).toBe(ids.length);
      for (const step of definition.steps) {
        for (const required of step.requires ?? []) {
          expect(ids).toContain(required);
        }
        expect(step.order).toBeGreaterThan(0);
        expect(step.href).toBeTruthy();
        expect(step.detail).toBeTruthy();
      }
      // Only the first row of each path is reachable from the start.
      expect(definition.steps.filter((step) => !step.requires?.length)).toHaveLength(1);
    }
  });

  it("accepts a guided run on the steps whose drill has no check mode", () => {
    // M-B1 opens the MPC rudiment drill, which records every run as guided.
    const guided = buildInstrumentPath("mpc", {
      instrument: "mpc",
      events: [
        event({
          exerciseId: "technique.mpc.single-strokes",
          skillIds: ["technique.mpc.single-strokes"],
          instrument: "mpc",
          assistance: "guided",
        }),
      ],
    });
    expect(guided.steps[0]?.status).toBe("done");
    expect(guided.steps[1]?.status).toBe("next");

    const hinted = buildInstrumentPath("mpc", {
      instrument: "mpc",
      events: [
        event({
          exerciseId: "technique.mpc.single-strokes",
          skillIds: ["technique.mpc.single-strokes"],
          instrument: "mpc",
          assistance: "hinted",
        }),
      ],
    });
    expect(hinted.steps[0]?.status).toBe("next");
    expect(hinted.steps[1]?.status).toBe("locked");
  });

  it("never opens a step that sits behind a locked one", () => {
    // A normal chord-change practice week: two independent runs in two
    // sessions completes G-B3's own rule, but G-B2 is still unfinished.
    const chordChange = (id: string, sessionId: string): ScoringEvent =>
      event({
        id,
        sessionId,
        exerciseId: "technique.guitar.chord-changes",
        skillIds: ["technique.guitar.chord-changes"],
        instrument: "guitar",
      });
    const path = buildInstrumentPath("guitar", {
      instrument: "guitar",
      events: [chordChange("c1", "s1"), chordChange("c2", "s2")],
    });
    expect(path.steps.map((step) => step.status)).toEqual([
      "next",
      "locked",
      "locked",
      "locked",
      "locked",
      "locked",
      "locked",
      "locked",
      "locked",
    ]);
    expect(path.next?.id).toBe("G-B1");
  });

  it("names only seeded Skill Graph nodes", () => {
    const seeded = new Set(seedCoreSkills().skills.map((skill) => skill.id));
    for (const id of INSTRUMENT_PATH_IDS) {
      for (const step of INSTRUMENT_PATHS[id].steps) {
        for (const skillId of step.skillIds ?? []) expect(seeded).toContain(skillId);
      }
    }
  });

  it("keeps the guitar and MPC paths on their own first step", () => {
    expect(buildInstrumentPath("guitar").next?.id).toBe("G-B1");
    const mpc = buildInstrumentPath("mpc");
    expect(mpc.steps[0]?.status).toBe("next");
    expect(mpc.steps.map((step) => step.id)).toContain("M-A2");
    expect(mpc.steps.every((step, index) => index === 0 || step.status === "locked")).toBe(true);
  });
});

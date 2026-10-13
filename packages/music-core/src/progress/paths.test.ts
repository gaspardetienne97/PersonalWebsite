import { describe, expect, it } from "vitest";
import type { ScoringEvent } from "../types";
import { ev } from "./fixtures";
import { LEARNING_PATHS, NEW_ROUTES, pathProgress, rewriteHref } from "./paths";

let n = 0;
const reps = (count: number, over: Partial<ScoringEvent>) =>
  Array.from({ length: count }, () => ev({ id: `p${n++}`, ...over }));

const statuses = (id: keyof typeof LEARNING_PATHS, events: ScoringEvent[]) =>
  Object.fromEntries(
    pathProgress(LEARNING_PATHS[id], events).steps.map((s) => [s.step.id, s.status]),
  );

describe("path content", () => {
  it("normalises seven paths", () => {
    expect(Object.keys(LEARNING_PATHS)).toEqual([
      "ear",
      "jazz",
      "guitar",
      "piano",
      "mpc",
      "theory",
      "studio",
    ]);
    expect(LEARNING_PATHS.theory.steps).toHaveLength(8);
    expect(LEARNING_PATHS.jazz.steps).toHaveLength(10);
    // The tables' steps plus the ear steps the research adds to each instrument path.
    expect(LEARNING_PATHS.guitar.steps).toHaveLength(10);
    expect(LEARNING_PATHS.piano.steps).toHaveLength(10);
    expect(LEARNING_PATHS.mpc.steps).toHaveLength(19);
    expect(LEARNING_PATHS.studio.steps).toHaveLength(7);
    expect(LEARNING_PATHS.mpc.steps.map((s) => s.id)).toEqual([
      "M-B1",
      "M-E1",
      "M-T1",
      "M-B2",
      "M-E2",
      "M-T2",
      "M-B3",
      "M-I1",
      "M-E3",
      "M-I2",
      "M-T3",
      "M-I3",
      "M-T4",
      "M-A1",
      "M-T5",
      "M-A2",
      "M-T6",
      "M-T7",
      "M-S1",
    ]);
    // The table's six plus the eleven the app adds, numbered in order.
    expect(LEARNING_PATHS.ear.steps).toHaveLength(17);
    expect(LEARNING_PATHS.ear.steps.find((s) => s.id === "interval-names")).toMatchObject({
      order: 10,
      href: "/music/ear/intervals?answer=choice&intervals=M3%2CP5%2CP8&direction=ascending",
      skillIds: ["pitch.interval.M3", "pitch.interval.P5", "pitch.interval.P8"],
    });
    for (const p of Object.values(LEARNING_PATHS))
      expect(p.steps.map((s) => s.order)).toEqual(p.steps.map((_, i) => i + 1));
  });

  it("rewrites every href onto a new route", () => {
    const hrefs = Object.values(LEARNING_PATHS).flatMap((p) =>
      p.steps.flatMap((s) => [s.href, ...s.links.map((l) => l.href)]),
    );
    for (const href of hrefs) {
      expect(
        NEW_ROUTES.some((r) => href.startsWith(r)),
        href,
      ).toBe(true);
      expect(href).not.toMatch(/\/music\/(learn|play)\//);
    }
  });

  it("keeps the setup query and maps the old paths", () => {
    expect(rewriteHref("/music/play/spider?mode=positions&rootFret=5")).toBe(
      "/music/fretboard?mode=positions&rootFret=5",
    );
    expect(rewriteHref("/music/learn/ear/intervals")).toBe("/music/ear/intervals");
    expect(rewriteHref("/music/learn/jazz")).toBe("/music/library?tab=reference");
    expect(rewriteHref("/music/play/mpc?mode=groove")).toBe("/music/pads?mode=groove");
    expect(() => rewriteHref("/music/nowhere")).toThrow();
    const pi4 = LEARNING_PATHS.piano.steps.find((s) => s.id === "P-I4")!;
    expect(pi4.href).toBe("/music/comping?pattern=blue-third-c7&instrument=piano&bpm=90");
    expect(pi4.kind).toBe("drill");
  });
});

describe("pathProgress", () => {
  const chordPerfect = {
    skillIds: ["technique.guitar.chord-perfect"],
    exerciseId: "technique.guitar.chord-perfect",
    modality: "played" as const,
  };

  it("moves a step from next to done on independent evidence only", () => {
    expect(statuses("guitar", [])).toMatchObject({
      "G-B1": "next",
      "G-B2": "locked",
      "G-A2": "locked",
    });
    // guided-accepted is gone and hinted never counts
    const assisted = [
      ...reps(3, { ...chordPerfect, assistance: "guided" }),
      ...reps(3, { ...chordPerfect, assistance: "hinted" }),
    ];
    expect(pathProgress(LEARNING_PATHS.guitar, assisted).steps[0].evidence[0].attempts).toBe(0);
    // two of three attempts, then a mean below 0.66, then one at 0.70
    const two = reps(2, { ...chordPerfect, partialCredit: 0.8 });
    expect(pathProgress(LEARNING_PATHS.guitar, two).steps[0].evidence[0]).toMatchObject({
      attempts: 2,
      done: false,
    });
    expect(
      statuses("guitar", [...two, ...reps(1, { ...chordPerfect, partialCredit: 0.3 })])["G-B1"],
    ).toBe("next"); // mean 0.63
    const done = statuses("guitar", [...two, ...reps(1, { ...chordPerfect, partialCredit: 0.5 })]);
    expect(done).toMatchObject({ "G-B1": "done", "G-B2": "next", "G-B3": "locked" });
  });

  it("ignores evidence from another instrument on a pinned step", () => {
    expect(statuses("guitar", reps(3, { ...chordPerfect, instrument: "ukulele" }))["G-B1"]).toBe(
      "next",
    );
    expect(statuses("guitar", reps(3, { ...chordPerfect, instrument: "guitar" }))["G-B1"]).toBe(
      "done",
    );
  });

  it("requires distinct sessions where the step asks for them", () => {
    const changes = {
      skillIds: ["technique.guitar.chord-changes"],
      exerciseId: "technique.guitar.chord-changes",
    };
    const one = pathProgress(LEARNING_PATHS.guitar, reps(4, { ...changes, sessionId: "a" }));
    expect(one.steps.find((s) => s.step.id === "G-A1")!.evidence[0]).toMatchObject({
      sessions: 1,
      done: false,
    });
    const both = pathProgress(LEARNING_PATHS.guitar, [
      ...reps(2, { ...changes, sessionId: "a" }),
      ...reps(2, { ...changes, sessionId: "b" }),
    ]);
    expect(both.steps.find((s) => s.step.id === "G-A1")!.evidence[0].done).toBe(true);
  });

  it("never blocks Continue on reference steps without skills, and counts umbrella children", () => {
    const events = [
      ...reps(1, { skillIds: ["pitch.interval.m3"] }),
      ...reps(1, {
        skillIds: ["harmony.ii-v-i.chord-scales.major"],
        modality: "played",
        partialCredit: 0.9,
      }),
    ];
    const p = pathProgress(LEARNING_PATHS.jazz, events);
    expect(Object.fromEntries(p.steps.map((s) => [s.step.id, s.status]))).toEqual({
      intervals: "done",
      "chord-symbols": "todo",
      extensions: "todo",
      "chord-scales": "next",
      "shell-voicings": "todo",
      "rootless-voicings": "not-assessed",
      "altered-voicings": "not-assessed",
      licks: "not-assessed",
      improv: "todo",
      repertoire: "todo",
    });
    expect(p.continueHref).toBe("/music/chord-scales?changes=major");
    expect(p).toMatchObject({ done: 1, total: 5 });
  });

  it("marks an open step in progress when it is not the next one", () => {
    const s = statuses(
      "jazz",
      reps(1, { skillIds: ["harmony.ii-v-i.voicings.altered"], modality: "played" }),
    );
    expect(s).toMatchObject({ intervals: "next", "altered-voicings": "in-progress" });
  });
});

describe("app-added steps", () => {
  const ev = (over: Partial<ScoringEvent>): ScoringEvent => ({
    id: Math.random().toString(36),
    sessionId: "s1",
    exerciseId: "studio.peak",
    promptId: "p",
    at: 0,
    skillIds: ["studio.ears", "studio.eq-peak"],
    capabilities: ["ear"],
    correct: true,
    partialCredit: 1,
    difficulty: 0.2,
    modality: "heard",
    source: "click",
    assistance: "independent",
    metrics: [],
    ...over,
  });

  it("asks for a harder setup and its own threshold", () => {
    // Ten right on 3 bands: the first step is done, the 5-band step has no evidence yet.
    const easy = Array.from({ length: 10 }, () => ev({}));
    expect(statuses("studio", easy)["S-1"]).toBe("done");
    expect(statuses("studio", easy)["S-2"]).toBe("next");
    // Twenty on 5 bands at 75%: under S-2's 80%.
    const five = Array.from({ length: 20 }, (_, i) =>
      ev({ difficulty: 0.4, partialCredit: i % 4 ? 1 : 0 }),
    );
    expect(statuses("studio", [...easy, ...five])["S-2"]).toBe("in-progress");
  });

  it("links ear drills beside the instrument steps they support", () => {
    const link = (path: keyof typeof LEARNING_PATHS, id: string) =>
      LEARNING_PATHS[path].steps.find((s) => s.id === id)!.links.map((l) => l.href);
    expect(link("piano", "P-I1")).toContain(
      "/music/ear/inversions?answer=choice&inversions=root%2Cfirst%2Csecond",
    );
    expect(link("jazz", "chord-scales").at(-1)).toMatch(/^\/music\/ear\/scales\?/);
    expect(link("guitar", "G-B1")).toContain(
      "/music/ear/chord-qualities?answer=choice&qualities=major%2Cminor",
    );
  });
});

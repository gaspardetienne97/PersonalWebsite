import { describe, expect, it } from "vitest";
import { CATALOG } from "@repo/music-core/content/catalog";
import { DRILL_GROUPS, lastRun, rowMastery, withInstrument } from "./drills-layout";

describe("drills layout", () => {
  const rows = DRILL_GROUPS.flatMap((g) => g.rows);
  it("places every drill, and every Pads and Aerophone mode exactly once", () => {
    expect(CATALOG.filter((e) => !rows.some((r) => r.entry.id === e.id)).map((e) => e.id)).toEqual(
      [],
    );
    for (const id of ["pads", "aerophone"]) {
      // A one-mode row shows no chips; its link opens that mode.
      const shown = rows
        .filter((r) => r.entry.id === id)
        .flatMap((r) =>
          r.modes.length
            ? r.modes.map((m) => m.id)
            : [new URL(r.href, "http://x").searchParams.get("mode")!],
        );
      expect([...shown].sort(), id).toEqual(
        CATALOG.find((e) => e.id === id)!
          .modes.map((m) => m.id)
          .sort(),
      );
    }
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });

  it("gives the ear drills and Scales chips that open each mode", () => {
    const intervals = rows.find((r) => r.key === "ear-intervals")!;
    expect(intervals.modes.find((m) => m.id === "voice")).toEqual({
      id: "voice",
      label: "Sing it",
      href: "/music/ear/intervals?answer=voice",
    });
    // One answer style: no chips, the row opens it.
    expect(rows.find((r) => r.key === "ear-fine-pitch")!.modes).toEqual([]);
    const scales = rows.find((r) => r.key === "scales")!;
    expect(scales.modes.map((m) => m.label)).toContain("Arpeggio");
    expect(scales.modes.find((m) => m.id === "arpeggio")!.href).toBe(
      "/music/scales?pattern=arpeggio",
    );
  });

  it("carries the filter's instrument on a row link, after any mode query", () => {
    expect(withInstrument("/music/scales", "ukulele")).toBe("/music/scales?instrument=ukulele");
    expect(withInstrument("/music/pads?mode=rudiments", "mpc")).toBe(
      "/music/pads?mode=rudiments&instrument=mpc",
    );
    expect(withInstrument("/music/scales")).toBe("/music/scales");
  });

  it("gives a split row only its modes' skills", () => {
    expect(rows.filter((r) => r.key.includes(":") && !r.skillIds.length)).toEqual([]);
    const grooves = rows.find((r) => r.key === "pads:grooves")!;
    const pads = CATALOG.find((e) => e.id === "pads")!;
    expect(grooves.skillIds.length).toBeLessThan(pads.skillIds.length);
  });

  it("shows no mastery number until the coach's bar of checked attempts", () => {
    const now = Date.now();
    const m = (skillId: string, mastery: number, observations: number) => ({
      skillId,
      mastery,
      confidence: 0.5,
      decayRate: 0,
      lastPracticed: now,
      observations,
    });
    const r = { skillIds: ["a", "b"] };
    expect(rowMastery(r, {}, now)).toEqual({ checked: 0 });
    expect(rowMastery(r, { a: m("a", 0.9, 4) }, now)).toEqual({ checked: 4 });
    // Untouched skills count as zero, so half the drill at 0.8 reads 0.4.
    expect(rowMastery(r, { a: m("a", 0.8, 5) }, now).value).toBeCloseTo(0.4);
  });

  it("finds a row's latest scored run, and a split row only its own modes'", () => {
    const scales = rows.find((r) => r.key === "scales")!;
    const run = (exerciseId: string, endedAt: number, score?: number) => ({
      exerciseId,
      endedAt,
      score,
    });
    const runs = [
      run(scales.entry.exerciseId, 1, 0.5),
      run(scales.entry.exerciseId, 3, 0.8),
      run(scales.entry.exerciseId, 4),
    ];
    expect(lastRun(scales, runs)?.score).toBe(0.8);
    const grooves = rows.find((r) => r.key === "pads:grooves")!;
    const beats = rows.find((r) => r.key === "pads:beats")!;
    const grooveId = grooves.entry.modes.find((m) => m.id === "groove")!.exerciseId;
    expect(lastRun(grooves, [run(grooveId, 2, 0.9)])?.score).toBe(0.9);
    expect(lastRun(beats, [run(grooveId, 2, 0.9)])).toBeUndefined();
  });
});

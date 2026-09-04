import { describe, expect, test } from "vitest";

import {
  evaluateGateAcceptance,
  gateAcceptanceAdvertises,
  gateMaterialFor,
  GATE_ACCEPTANCE_MANIFEST_VERSION,
  GATE_DYNAMICS,
  GATE_MATERIAL_STRATA,
  GATE_REGISTER_STRATA,
  type GateAcceptanceInput,
  type GateMaterialId,
  type GatePhysicalAttempt,
  type GateRegisterId,
  type GateTrial,
} from "./gate-acceptance";

type Stratum = { register: GateRegisterId; material: GateMaterialId };

const STRATA: Stratum[] = GATE_REGISTER_STRATA.flatMap(({ id }) =>
  GATE_MATERIAL_STRATA.map((material) => ({ register: id, material })),
);

function passingCorpus(stratum: Stratum, latencyMs = 200): GateTrial[] {
  return [
    ...Array.from({ length: 10 }, () => ({
      ...stratum,
      kind: "correct" as const,
      advanced: true,
      latencyMs,
    })),
    ...Array.from({ length: 20 }, () => ({
      ...stratum,
      kind: "negative" as const,
      advanced: false,
    })),
  ];
}

function passingPhysical(stratum: Stratum, latencyMs = 200): GatePhysicalAttempt[] {
  return GATE_DYNAMICS.flatMap((dynamic) => [
    ...Array.from({ length: 5 }, () => ({
      ...stratum,
      dynamic,
      kind: "correct" as const,
      advanced: true,
      latencyMs,
    })),
    ...Array.from({ length: 5 }, () => ({
      ...stratum,
      dynamic,
      kind: "negative" as const,
      advanced: false,
    })),
  ]);
}

function allPassing(): GateAcceptanceInput {
  return {
    manifestVersion: GATE_ACCEPTANCE_MANIFEST_VERSION,
    device: "synthetic",
    environment: "vitest",
    corpus: STRATA.flatMap((stratum) => passingCorpus(stratum)),
    physical: STRATA.flatMap((stratum) => passingPhysical(stratum)),
  };
}

function isLowSingle(trial: GateTrial): boolean {
  return trial.register === "low" && trial.material === "single";
}

describe("evaluateGateAcceptance", () => {
  test("advertises every stratum when the whole candidate matrix passes", () => {
    const report = evaluateGateAcceptance(allPassing());
    expect(report.hardGateEnabled).toBe(true);
    expect(report.strata).toHaveLength(12);
    expect(report.strata.every(({ advertised }) => advertised)).toBe(true);
    expect(report.advertised).toEqual({
      registers: ["low", "mid", "high"],
      materials: [...GATE_MATERIAL_STRATA],
      lowMidi: 40,
      highMidi: 88,
    });
    expect(report.aggregate.corpus.correct).toMatchObject({
      total: 120,
      withinLimit: 120,
      p95Ms: 200,
    });
    expect(report.aggregate.corpus.negative).toMatchObject({ total: 240, advanced: 0 });
    expect(report.aggregate.physical.correct).toMatchObject({ total: 180, withinLimit: 180 });
    expect(report.failures).toEqual([]);
  });

  test("Finding 2: a fully failing stratum degrades only itself and leaves the aggregate clean", () => {
    const input = allPassing();
    // low/single is a disaster: every negative advances and no correct one does.
    const corpus = input.corpus.map((trial) =>
      isLowSingle(trial) ? { ...trial, advanced: trial.kind === "negative" } : trial,
    );
    const physical = input.physical.map((trial) =>
      isLowSingle(trial) ? { ...trial, advanced: trial.kind === "negative" } : trial,
    );
    const report = evaluateGateAcceptance({ ...input, corpus, physical });

    const failing = report.strata.find((s) => s.register === "low" && s.material === "single")!;
    expect(failing.advertised).toBe(false);
    expect(failing.corpus.passed).toBe(false);
    expect(failing.physical.passed).toBe(false);
    expect(failing.corpus.negative).toMatchObject({ total: 20, advanced: 20 });
    expect(failing.physical.cells.every(({ failures }) => failures.length > 0)).toBe(true);

    // The other eleven strata still pass and are advertised.
    expect(report.strata.filter(({ advertised }) => advertised)).toHaveLength(11);
    expect(report.advertised.registers).toEqual(["low", "mid", "high"]);
    expect(report.advertised.materials).toEqual([...GATE_MATERIAL_STRATA]);

    // Aggregates are denominated over the advertised strata only, so the
    // failing stratum's 20 false advances never veto them.
    expect(report.aggregate.corpus.correct.total).toBe(110);
    expect(report.aggregate.corpus.negative).toMatchObject({ total: 220, advanced: 0 });
    expect(report.aggregate.physical.negative).toMatchObject({ total: 165, advanced: 0 });
    expect(report.aggregate.passed).toBe(true);
    expect(report.hardGateEnabled).toBe(true);

    // The full matrix is still listed with its numerators and denominators.
    expect(report.strata).toHaveLength(12);
  });

  test("a single false advance in the corpus fails that stratum", () => {
    const input = allPassing();
    const corpus = [...input.corpus];
    const index = corpus.findIndex(
      (t) => t.register === "mid" && t.material === "triad" && t.kind === "negative",
    );
    corpus[index] = { ...corpus[index]!, advanced: true, latencyMs: 100 };
    const report = evaluateGateAcceptance({ ...input, corpus });
    const stratum = report.strata.find((s) => s.register === "mid" && s.material === "triad")!;
    expect(stratum.advertised).toBe(false);
    expect(stratum.corpus.failures).toEqual(["mid/triad: 1 false corpus advances."]);
    expect(report.advertised.materials).toContain("triad");
  });

  test("physical cells need exactly five correct and five negative attempts", () => {
    const input = allPassing();
    const physical = [...input.physical];
    physical.splice(
      physical.findIndex(
        (t) =>
          t.register === "high" &&
          t.material === "single" &&
          t.dynamic === "soft" &&
          t.kind === "correct",
      ),
      1,
    );
    const report = evaluateGateAcceptance({ ...input, physical });
    const stratum = report.strata.find((s) => s.register === "high" && s.material === "single")!;
    expect(stratum.physical.cells[0]!.failures[0]).toMatch(/needs exactly 5/);
    expect(stratum.advertised).toBe(false);
  });

  test("one slow cell fails its stratum through the 4/5 cell floor and the 14/15 rule", () => {
    const input = allPassing();
    let dropped = 0;
    const physical = input.physical.map((t) => {
      if (
        t.register === "mid" &&
        t.material === "single" &&
        t.dynamic === "loud" &&
        t.kind === "correct" &&
        dropped < 2
      ) {
        dropped += 1;
        return { ...t, latencyMs: 900 };
      }
      return t;
    });
    const report = evaluateGateAcceptance({ ...input, physical });
    const stratum = report.strata.find((s) => s.register === "mid" && s.material === "single")!;
    expect(stratum.physical.correct).toMatchObject({ total: 15, advanced: 15, withinLimit: 13 });
    expect(stratum.physical.failures.join("\n")).toMatch(/loud: 3\/5 advances/);
    expect(stratum.physical.failures.join("\n")).toMatch(/13\/15 physical advances/);
    expect(stratum.advertised).toBe(false);
  });

  test("accepted-trial p95 above 350 ms fails the stratum even when every trial advances in time", () => {
    const input = allPassing();
    const physical = input.physical.map((t) =>
      t.register === "high" && t.material === "triad" && t.kind === "correct"
        ? { ...t, latencyMs: 400 }
        : t,
    );
    const report = evaluateGateAcceptance({ ...input, physical });
    const stratum = report.strata.find((s) => s.register === "high" && s.material === "triad")!;
    expect(stratum.physical.correct.p95Ms).toBe(400);
    expect(stratum.physical.failures).toContain("high/triad: accepted p95 400 ms exceeds 350 ms.");
  });

  test("nothing advertised means the hard gate stays off", () => {
    const report = evaluateGateAcceptance({
      manifestVersion: GATE_ACCEPTANCE_MANIFEST_VERSION,
      device: "none",
      environment: "none",
      corpus: [],
      physical: [],
    });
    expect(report.hardGateEnabled).toBe(false);
    expect(report.strata.every(({ advertised }) => !advertised)).toBe(true);
    expect(report.advertised).toEqual({ registers: [], materials: [] });
    expect(report.aggregate.failures[0]).toMatch(/No candidate stratum passed/);
  });

  test("a stale manifest version disables the hard gate regardless of results", () => {
    const report = evaluateGateAcceptance({
      ...allPassing(),
      manifestVersion: "piano-gate-acceptance-0",
    });
    expect(report.aggregate.passed).toBe(true);
    expect(report.hardGateEnabled).toBe(false);
    expect(report.failures[0]).toMatch(/Manifest version/);
  });
});

describe("gateAcceptanceAdvertises", () => {
  test("no report is hint-only", () => {
    expect(gateAcceptanceAdvertises(undefined, [60])).toBe(false);
  });

  test("only targets whose exact register/material stratum is advertised are hard-gated", () => {
    const input = allPassing();
    const corpus = input.corpus.map((t) => (isLowSingle(t) ? { ...t, advanced: false } : t));
    const report = evaluateGateAcceptance({ ...input, corpus });

    expect(gateAcceptanceAdvertises(report, [48])).toBe(false); // low/single failed
    expect(gateAcceptanceAdvertises(report, [48, 52, 55])).toBe(true); // low/triad passed
    expect(gateAcceptanceAdvertises(report, [60])).toBe(true);
    expect(gateAcceptanceAdvertises(report, [60, 64, 67, 71])).toBe(true);
    expect(gateAcceptanceAdvertises(report, [39])).toBe(false);
    expect(gateAcceptanceAdvertises(report, [89])).toBe(false);
    expect(gateAcceptanceAdvertises(report, [])).toBe(false);
    expect(gateAcceptanceAdvertises(report, [60, 64, 67], "two-hand")).toBe(true);
  });

  test("material is derived from note count", () => {
    expect(gateMaterialFor([60])).toBe("single");
    expect(gateMaterialFor([60, 64, 67])).toBe("triad");
    expect(gateMaterialFor([60, 64, 67, 70])).toBe("seventh-doubled");
  });
});

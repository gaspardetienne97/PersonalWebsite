/**
 * Acceptance harness for the microphone wait gate.
 *
 * Hard gating is a claim about measured behaviour, so it is earned per stratum,
 * never assumed. The manifest declares candidate register × material strata up
 * front; a stratum is *advertised* only when it independently passes both the
 * held-out corpus rules and the physical soft/normal/loud matrix. Aggregate
 * conditions are then denominated over the advertised strata (the union of
 * per-stratum passers), so one fully failing candidate stratum degrades itself
 * to hint-only without vetoing the strata that passed.
 *
 * The report always lists the full candidate matrix with every numerator and
 * denominator, per-stratum and aggregate p50/p95, and the environment it was
 * measured in. Every non-advance is a failure; nothing is dropped.
 */

export const GATE_ACCEPTANCE_MANIFEST_VERSION = "piano-gate-acceptance-1";

export const GATE_ADVANCE_LIMIT_MS = 750;
export const GATE_ACCEPTED_P95_LIMIT_MS = 350;

export const GATE_REGISTER_STRATA = [
  { id: "low", lowMidi: 40, highMidi: 55 },
  { id: "mid", lowMidi: 56, highMidi: 72 },
  { id: "high", lowMidi: 73, highMidi: 88 },
] as const;

export const GATE_MATERIAL_STRATA = ["single", "triad", "seventh-doubled", "two-hand"] as const;

export const GATE_DYNAMICS = ["soft", "normal", "loud"] as const;

export type GateRegisterId = (typeof GATE_REGISTER_STRATA)[number]["id"];
export type GateMaterialId = (typeof GATE_MATERIAL_STRATA)[number];
export type GateDynamic = (typeof GATE_DYNAMICS)[number];

/** Per-candidate-stratum corpus minimums and floors. */
const CORPUS_MIN_CORRECT = 10;
const CORPUS_MIN_NEGATIVE = 20;
const CORPUS_CORRECT_RATE = 0.9;

/** Physical matrix: exactly five correct and five negative attempts per cell. */
const PHYSICAL_ATTEMPTS_PER_CELL = 5;
const PHYSICAL_CELL_MIN_ADVANCES = 4;
const PHYSICAL_STRATUM_MIN_ADVANCES = 14;

/** Aggregate gates over the advertised strata. */
const AGGREGATE_MIN_CORRECT = 100;
const AGGREGATE_MIN_NEGATIVE = 200;
const AGGREGATE_CORRECT_RATE = 0.95;

export interface GateTrial {
  register: GateRegisterId;
  material: GateMaterialId;
  kind: "correct" | "negative";
  /** Whether the gate advanced wait mode. A non-advance is never omitted. */
  advanced: boolean;
  /** Time to advance; required whenever `advanced` is true. */
  latencyMs?: number;
}

export interface GatePhysicalAttempt extends GateTrial {
  dynamic: GateDynamic;
}

export interface GateAcceptanceInput {
  manifestVersion: string;
  device: string;
  environment: string;
  corpus: readonly GateTrial[];
  physical: readonly GatePhysicalAttempt[];
}

export interface GateTrialTally {
  total: number;
  advanced: number;
  withinLimit: number;
  p50Ms?: number;
  p95Ms?: number;
}

export interface GatePhysicalCellReport {
  dynamic: GateDynamic;
  correct: GateTrialTally;
  negative: GateTrialTally;
  failures: string[];
}

export interface GateStratumReport {
  register: GateRegisterId;
  material: GateMaterialId;
  corpus: {
    correct: GateTrialTally;
    negative: GateTrialTally;
    passed: boolean;
    failures: string[];
  };
  physical: {
    cells: GatePhysicalCellReport[];
    correct: GateTrialTally;
    negative: GateTrialTally;
    passed: boolean;
    failures: string[];
  };
  advertised: boolean;
}

export interface GateAcceptanceReport {
  manifestVersion: string;
  device: string;
  environment: string;
  /** Every candidate stratum, passing or not. */
  strata: GateStratumReport[];
  advertised: {
    registers: GateRegisterId[];
    materials: GateMaterialId[];
    lowMidi?: number;
    highMidi?: number;
  };
  aggregate: {
    corpus: { correct: GateTrialTally; negative: GateTrialTally };
    physical: { correct: GateTrialTally; negative: GateTrialTally };
    passed: boolean;
    failures: string[];
  };
  /** True only when at least one stratum is advertised and aggregates pass. */
  hardGateEnabled: boolean;
  failures: string[];
}

export function evaluateGateAcceptance(input: GateAcceptanceInput): GateAcceptanceReport {
  const failures: string[] = [];
  if (input.manifestVersion !== GATE_ACCEPTANCE_MANIFEST_VERSION) {
    failures.push(
      `Manifest version ${input.manifestVersion} is not ${GATE_ACCEPTANCE_MANIFEST_VERSION}.`,
    );
  }

  const strata = GATE_REGISTER_STRATA.flatMap((register) =>
    GATE_MATERIAL_STRATA.map((material) => stratumReport(input, register.id, material)),
  );

  const advertisedStrata = strata.filter(({ advertised }) => advertised);
  const advertisedKeys = new Set(
    advertisedStrata.map(({ register, material }) => `${register}:${material}`),
  );
  const inAdvertised = (trial: GateTrial) =>
    advertisedKeys.has(`${trial.register}:${trial.material}`);

  const aggregateFailures: string[] = [];
  const corpusCorrect = tally(input.corpus.filter((t) => inAdvertised(t) && t.kind === "correct"));
  const corpusNegative = tally(
    input.corpus.filter((t) => inAdvertised(t) && t.kind === "negative"),
  );
  const physicalCorrect = tally(
    input.physical.filter((t) => inAdvertised(t) && t.kind === "correct"),
  );
  const physicalNegative = tally(
    input.physical.filter((t) => inAdvertised(t) && t.kind === "negative"),
  );

  if (advertisedStrata.length === 0) {
    aggregateFailures.push("No candidate stratum passed both the corpus and physical rules.");
  }
  checkAggregate("Corpus", corpusCorrect, corpusNegative, aggregateFailures, true);
  // Physical counts are fixed by the exactly-five-per-cell rule, so its
  // aggregate is rate, latency, and zero false advances only.
  checkAggregate("Physical", physicalCorrect, physicalNegative, aggregateFailures, false);

  const aggregatePassed = aggregateFailures.length === 0;
  const hardGateEnabled = aggregatePassed && failures.length === 0;
  const advertisedRegisters = GATE_REGISTER_STRATA.filter(({ id }) =>
    advertisedStrata.some(({ register }) => register === id),
  );

  return {
    manifestVersion: input.manifestVersion,
    device: input.device,
    environment: input.environment,
    strata,
    advertised: {
      registers: advertisedRegisters.map(({ id }) => id),
      materials: GATE_MATERIAL_STRATA.filter((material) =>
        advertisedStrata.some((stratum) => stratum.material === material),
      ),
      ...(advertisedRegisters.length > 0
        ? {
            lowMidi: Math.min(...advertisedRegisters.map(({ lowMidi }) => lowMidi)),
            highMidi: Math.max(...advertisedRegisters.map(({ highMidi }) => highMidi)),
          }
        : {}),
    },
    aggregate: {
      corpus: { correct: corpusCorrect, negative: corpusNegative },
      physical: { correct: physicalCorrect, negative: physicalNegative },
      passed: aggregatePassed,
      failures: aggregateFailures,
    },
    hardGateEnabled,
    failures,
  };
}

/**
 * Whether the report advertises hard gating for this exact target group. Any
 * gap — no report, aggregate failure, out-of-band note, unadvertised stratum —
 * is hint-only.
 */
export function gateAcceptanceAdvertises(
  report: GateAcceptanceReport | undefined,
  notes: readonly number[],
  material = gateMaterialFor(notes),
): boolean {
  if (!report?.hardGateEnabled || notes.length === 0) return false;
  return notes.every((note) =>
    report.strata.some(
      (stratum) =>
        stratum.advertised &&
        stratum.material === material &&
        withinRegister(stratum.register, note),
    ),
  );
}

/**
 * ponytail: material is derived from note count alone, so "two-hand" can never
 * be advertised. Pass the real material once a route knows its hand span and
 * an acceptance report actually passes; while the hard gate ships disabled this
 * only means two-hand groups stay hint-only, which is already the default.
 */
export function gateMaterialFor(notes: readonly number[]): GateMaterialId {
  if (notes.length <= 1) return "single";
  if (notes.length <= 3) return "triad";
  return "seventh-doubled";
}

function withinRegister(register: GateRegisterId, note: number): boolean {
  const stratum = GATE_REGISTER_STRATA.find(({ id }) => id === register);
  return !!stratum && note >= stratum.lowMidi && note <= stratum.highMidi;
}

function stratumReport(
  input: GateAcceptanceInput,
  register: GateRegisterId,
  material: GateMaterialId,
): GateStratumReport {
  const matches = <T extends GateTrial>(trials: readonly T[], kind: GateTrial["kind"]): T[] =>
    trials.filter((t) => t.register === register && t.material === material && t.kind === kind);

  const corpusCorrect = tally(matches(input.corpus, "correct"));
  const corpusNegative = tally(matches(input.corpus, "negative"));
  const corpusFailures: string[] = [];
  const label = `${register}/${material}`;
  if (corpusCorrect.total < CORPUS_MIN_CORRECT) {
    corpusFailures.push(
      `${label}: ${corpusCorrect.total} correct corpus trials, needs ${CORPUS_MIN_CORRECT}.`,
    );
  }
  if (corpusNegative.total < CORPUS_MIN_NEGATIVE) {
    corpusFailures.push(
      `${label}: ${corpusNegative.total} negative corpus trials, needs ${CORPUS_MIN_NEGATIVE}.`,
    );
  }
  if (rate(corpusCorrect) < CORPUS_CORRECT_RATE) {
    corpusFailures.push(
      `${label}: ${corpusCorrect.withinLimit}/${corpusCorrect.total} corpus advances within ${GATE_ADVANCE_LIMIT_MS} ms.`,
    );
  }
  if (corpusNegative.advanced > 0) {
    corpusFailures.push(`${label}: ${corpusNegative.advanced} false corpus advances.`);
  }

  const cells = GATE_DYNAMICS.map((dynamic) => {
    const cellCorrect = tally(
      matches(input.physical, "correct").filter((t) => t.dynamic === dynamic),
    );
    const cellNegative = tally(
      matches(input.physical, "negative").filter((t) => t.dynamic === dynamic),
    );
    const cellFailures: string[] = [];
    const cellLabel = `${label}/${dynamic}`;
    if (cellCorrect.total !== PHYSICAL_ATTEMPTS_PER_CELL) {
      cellFailures.push(
        `${cellLabel}: ${cellCorrect.total} correct attempts, needs exactly ${PHYSICAL_ATTEMPTS_PER_CELL}.`,
      );
    }
    if (cellNegative.total !== PHYSICAL_ATTEMPTS_PER_CELL) {
      cellFailures.push(
        `${cellLabel}: ${cellNegative.total} negative attempts, needs exactly ${PHYSICAL_ATTEMPTS_PER_CELL}.`,
      );
    }
    if (cellCorrect.withinLimit < PHYSICAL_CELL_MIN_ADVANCES) {
      cellFailures.push(
        `${cellLabel}: ${cellCorrect.withinLimit}/${cellCorrect.total} advances within ${GATE_ADVANCE_LIMIT_MS} ms, needs ${PHYSICAL_CELL_MIN_ADVANCES}.`,
      );
    }
    if (cellNegative.advanced > 0) {
      cellFailures.push(`${cellLabel}: ${cellNegative.advanced} false advances.`);
    }
    return { dynamic, correct: cellCorrect, negative: cellNegative, failures: cellFailures };
  });

  const physicalCorrect = tally(matches(input.physical, "correct"));
  const physicalNegative = tally(matches(input.physical, "negative"));
  const physicalFailures = cells.flatMap(({ failures }) => failures);
  if (physicalCorrect.withinLimit < PHYSICAL_STRATUM_MIN_ADVANCES) {
    physicalFailures.push(
      `${label}: ${physicalCorrect.withinLimit}/${physicalCorrect.total} physical advances within ${GATE_ADVANCE_LIMIT_MS} ms, needs ${PHYSICAL_STRATUM_MIN_ADVANCES}.`,
    );
  }
  if ((physicalCorrect.p95Ms ?? 0) > GATE_ACCEPTED_P95_LIMIT_MS) {
    physicalFailures.push(
      `${label}: accepted p95 ${physicalCorrect.p95Ms} ms exceeds ${GATE_ACCEPTED_P95_LIMIT_MS} ms.`,
    );
  }
  if (physicalNegative.advanced > 0) {
    physicalFailures.push(`${label}: ${physicalNegative.advanced} false physical advances.`);
  }

  const corpusPassed = corpusFailures.length === 0;
  const physicalPassed = physicalFailures.length === 0;
  return {
    register,
    material,
    corpus: {
      correct: corpusCorrect,
      negative: corpusNegative,
      passed: corpusPassed,
      failures: corpusFailures,
    },
    physical: {
      cells,
      correct: physicalCorrect,
      negative: physicalNegative,
      passed: physicalPassed,
      failures: physicalFailures,
    },
    advertised: corpusPassed && physicalPassed,
  };
}

function checkAggregate(
  label: string,
  correct: GateTrialTally,
  negative: GateTrialTally,
  failures: string[],
  minimums: boolean,
): void {
  if (minimums && correct.total < AGGREGATE_MIN_CORRECT) {
    failures.push(
      `${label} aggregate: ${correct.total} correct trials over advertised strata, needs ${AGGREGATE_MIN_CORRECT}.`,
    );
  }
  if (minimums && negative.total < AGGREGATE_MIN_NEGATIVE) {
    failures.push(
      `${label} aggregate: ${negative.total} negative trials over advertised strata, needs ${AGGREGATE_MIN_NEGATIVE}.`,
    );
  }
  if (rate(correct) < AGGREGATE_CORRECT_RATE) {
    failures.push(
      `${label} aggregate: ${correct.withinLimit}/${correct.total} advances within ${GATE_ADVANCE_LIMIT_MS} ms.`,
    );
  }
  if ((correct.p95Ms ?? 0) > GATE_ACCEPTED_P95_LIMIT_MS) {
    failures.push(
      `${label} aggregate: accepted p95 ${correct.p95Ms} ms exceeds ${GATE_ACCEPTED_P95_LIMIT_MS} ms.`,
    );
  }
  if (negative.advanced > 0) {
    failures.push(
      `${label} aggregate: ${negative.advanced} false advances over advertised strata.`,
    );
  }
}

function tally(trials: readonly GateTrial[]): GateTrialTally {
  const advanced = trials.filter(({ advanced }) => advanced);
  const latencies = advanced
    .map(({ latencyMs }) => latencyMs ?? Number.POSITIVE_INFINITY)
    .sort((left, right) => left - right);
  return {
    total: trials.length,
    advanced: advanced.length,
    withinLimit: latencies.filter((latency) => latency <= GATE_ADVANCE_LIMIT_MS).length,
    ...(latencies.length > 0
      ? { p50Ms: percentile(latencies, 0.5), p95Ms: percentile(latencies, 0.95) }
      : {}),
  };
}

function rate(correct: GateTrialTally): number {
  return correct.total === 0 ? 0 : correct.withinLimit / correct.total;
}

/** Nearest-rank percentile over an ascending list; exact, not interpolated. */
function percentile(sorted: readonly number[], fraction: number): number {
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return sorted[Math.max(0, index)]!;
}

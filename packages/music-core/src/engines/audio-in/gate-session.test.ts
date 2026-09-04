import { describe, expect, test, vi } from "vitest";

import type { NoteEvent } from "@repo/music-core/domain";

import { bank } from "./__fixtures__/synthetic-frames";
import type { AudioPitchState } from "./capture";
import type { ChordAnalysis } from "./chord-source";
import {
  evaluateGateAcceptance,
  GATE_ACCEPTANCE_MANIFEST_VERSION,
  GATE_DYNAMICS,
  GATE_MATERIAL_STRATA,
  GATE_REGISTER_STRATA,
  type GateAcceptanceReport,
} from "./gate-acceptance";
import { GateSession, MICROPHONE_HINT_MESSAGE, type GateCaptureSource } from "./gate-session";

class FakeSource implements GateCaptureSource {
  state: AudioPitchState = { status: "idle" };
  analysisListeners = new Set<(analysis: ChordAnalysis) => void>();
  stateListeners = new Set<(state: AudioPitchState) => void>();
  stopped = 0;
  constructor(private readonly startState: AudioPitchState = { status: "running" }) {}
  async start() {
    this.setState(this.startState);
  }
  async stop() {
    this.stopped += 1;
    this.setState({ status: "idle" });
  }
  subscribeAnalysis(listener: (analysis: ChordAnalysis) => void) {
    this.analysisListeners.add(listener);
    return () => this.analysisListeners.delete(listener);
  }
  subscribeState(listener: (state: AudioPitchState) => void) {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }
  emit(energies: Record<number, number>, rms = 0.2) {
    const analysis: ChordAnalysis = {
      chroma: new Float32Array(12),
      timestamp: 0,
      onset: false,
      noteEnergies: bank(energies),
      rms,
      sampleRate: 44_100,
    };
    for (const listener of this.analysisListeners) listener(analysis);
  }
  silence() {
    this.emit({}, 0);
  }
  private setState(state: AudioPitchState) {
    this.state = state;
    for (const listener of this.stateListeners) listener(state);
  }
}

function passingReport(): GateAcceptanceReport {
  const strata = GATE_REGISTER_STRATA.flatMap(({ id }) =>
    GATE_MATERIAL_STRATA.map((material) => ({ register: id, material })),
  );
  return evaluateGateAcceptance({
    manifestVersion: GATE_ACCEPTANCE_MANIFEST_VERSION,
    device: "synthetic",
    environment: "vitest",
    corpus: strata.flatMap((s) => [
      ...Array.from({ length: 10 }, () => ({
        ...s,
        kind: "correct" as const,
        advanced: true,
        latencyMs: 200,
      })),
      ...Array.from({ length: 20 }, () => ({ ...s, kind: "negative" as const, advanced: false })),
    ]),
    physical: strata.flatMap((s) =>
      GATE_DYNAMICS.flatMap((dynamic) => [
        ...Array.from({ length: 5 }, () => ({
          ...s,
          dynamic,
          kind: "correct" as const,
          advanced: true,
          latencyMs: 200,
        })),
        ...Array.from({ length: 5 }, () => ({
          ...s,
          dynamic,
          kind: "negative" as const,
          advanced: false,
        })),
      ]),
    ),
  });
}

const TRIAD = { 60: 1, 64: 0.9, 67: 0.8 };

function label(event: NoteEvent): string {
  return `${event.type}:${"midiNote" in event ? event.midiNote : ""}`;
}

function harness(options: { acceptance?: GateAcceptanceReport; accept?: () => boolean } = {}) {
  const events: NoteEvent[] = [];
  const push = vi.fn((event: NoteEvent) => {
    const ok = options.accept?.() ?? true;
    if (ok) events.push(event);
    return ok;
  });
  let source = new FakeSource();
  let now = 1_000;
  const session = new GateSession({
    router: { push },
    createSource: () => source,
    instrument: "piano",
    now: () => now,
    ...(options.acceptance ? { acceptance: options.acceptance } : {}),
  });
  return {
    session,
    events,
    push,
    get source() {
      return source;
    },
    replaceSource(next: FakeSource) {
      source = next;
    },
    tick(ms: number) {
      now += ms;
    },
    /** Silence to re-arm, then three stable frames. */
    play(energies: Record<number, number>) {
      source.silence();
      for (let i = 0; i < 3; i++) source.emit(energies);
    },
  };
}

describe("GateSession", () => {
  test("hint-only never advances: observed notes are published, no event is pushed", async () => {
    const h = harness();
    await h.session.start();
    h.session.setTarget([60, 64, 67]);
    h.play(TRIAD);
    expect(h.session.state).toMatchObject({
      status: "running",
      observed: [60, 64, 67],
      reason: "matched",
      hintOnly: true,
      hintReason: "no-acceptance",
    });
    expect(h.push).not.toHaveBeenCalled();
    expect(MICROPHONE_HINT_MESSAGE).toBe(
      "Microphone can show detected notes, but use MIDI or the on-screen piano to continue.",
    );
  });

  test("a passing acceptance report lets an accepted snapshot push ordinary audio noteOns", async () => {
    const h = harness({ acceptance: passingReport() });
    await h.session.start();
    h.session.setTarget([60, 64, 67]);
    expect(h.session.state.hintOnly).toBe(false);
    h.play(TRIAD);
    expect(h.events.map(label)).toEqual(["noteOn:60", "noteOn:64", "noteOn:67"]);
    const [first] = h.events;
    expect(first).toMatchObject({
      source: "audio",
      instrument: "piano",
      clock: "performance",
      timestamp: 1_000,
    });
    expect(first!.confidence).toBeGreaterThan(0);
    expect(new Set(h.events.map(({ timestamp }) => timestamp)).size).toBe(1);
    expect(new Set(h.events.map(({ confidence }) => confidence)).size).toBe(1);

    // Still holding the chord: nothing more is pushed.
    for (let i = 0; i < 5; i++) h.source.emit(TRIAD);
    expect(h.events).toHaveLength(3);
  });

  test("retargeting clears the snapshot without synthetic offs; a repeated chord needs a real release", async () => {
    const h = harness({ acceptance: passingReport() });
    await h.session.start();
    h.session.setTarget([60, 64, 67]);
    h.play(TRIAD);
    expect(h.events).toHaveLength(3);

    // Identical next group while the chord is still ringing.
    h.session.setTarget([60, 64, 67]);
    for (let i = 0; i < 10; i++) h.source.emit(TRIAD);
    expect(h.events).toHaveLength(3);
    expect(h.events.some(({ type }) => type === "noteOff")).toBe(false);

    // Release and replay: three fresh attacks, still no offs.
    h.tick(500);
    h.play(TRIAD);
    expect(h.events.map(({ type }) => type)).toEqual(Array(6).fill("noteOn"));
    expect(h.events.at(-1)!.timestamp).toBe(1_500);
  });

  test("a rejected snapshot rolls back and re-arms so the next stable window retries", async () => {
    let accept = false;
    const h = harness({ acceptance: passingReport(), accept: () => accept });
    await h.session.start();
    h.session.setTarget([60]);
    h.play({ 60: 1 });
    expect(h.push).toHaveBeenCalledTimes(1);
    expect(h.events).toHaveLength(0);

    accept = true;
    // No release needed: the gate is re-armed and stabilises again.
    for (let i = 0; i < 3; i++) h.source.emit({ 60: 1 });
    expect(h.events.map(label)).toEqual(["noteOn:60"]);
  });

  test("stale analysis from a superseded capture cannot emit", async () => {
    const h = harness({ acceptance: passingReport() });
    await h.session.start();
    const stale = h.source;
    const [staleListener] = stale.analysisListeners;
    h.session.setTarget([60]);
    await h.session.stop();
    expect(stale.stopped).toBe(1);
    expect(stale.analysisListeners.size).toBe(0);

    h.replaceSource(new FakeSource());
    await h.session.start();
    // Replay the old capture's listener directly: its generation is dead.
    stale.analysisListeners.add(staleListener!);
    stale.silence();
    for (let i = 0; i < 3; i++) stale.emit({ 60: 1 });
    expect(h.push).not.toHaveBeenCalled();
    expect(h.session.state.observed).toEqual([]);

    h.play({ 60: 1 });
    expect(h.events).toHaveLength(1);
  });

  test("hint reasons: not listening, out of range, unadvertised target, low SNR", async () => {
    const h = harness({ acceptance: passingReport() });
    expect(h.session.state).toMatchObject({ hintOnly: true, hintReason: "not-listening" });
    await h.session.start();
    h.session.setTarget([39]);
    expect(h.session.state.hintReason).toBe("out-of-range");
    h.session.setTarget([60, 64, 67], "two-hand");
    expect(h.session.state.hintReason).toBeUndefined();
    h.session.setTarget([60, 64, 67, 71, 74]);
    expect(h.session.state.hintReason).toBeUndefined();

    const quiet = new FakeSource();
    const session = new GateSession({
      router: { push: vi.fn(() => true) },
      createSource: () => quiet,
      acceptance: passingReport(),
      lowSnrFrameLimit: 3,
    });
    await session.start();
    session.setTarget([60]);
    for (let i = 0; i < 3; i++) quiet.silence();
    expect(session.state).toMatchObject({
      hintOnly: true,
      hintReason: "low-snr",
      reason: "low-signal",
    });
    for (let i = 0; i < 3; i++) quiet.emit({ 60: 1 });
    expect(session.state.hintOnly).toBe(false);
  });

  test("permission denial surfaces the capture message and stays hint-only", async () => {
    const source = new FakeSource({ status: "denied", message: "Microphone access was blocked." });
    const push = vi.fn(() => true);
    const session = new GateSession({
      router: { push },
      createSource: () => source,
      acceptance: passingReport(),
    });
    await session.start();
    session.setTarget([60]);
    expect(session.state).toMatchObject({
      status: "denied",
      message: "Microphone access was blocked.",
      hintOnly: true,
      hintReason: "not-listening",
    });
    source.silence();
    for (let i = 0; i < 3; i++) source.emit({ 60: 1 });
    expect(push).not.toHaveBeenCalled();
  });

  test("stop tears down the capture and resets published state", async () => {
    const h = harness();
    await h.session.start();
    h.session.setTarget([60]);
    h.play({ 60: 1 });
    expect(h.session.state.observed).toEqual([60]);
    await h.session.stop();
    expect(h.source.stopped).toBe(1);
    expect(h.session.state).toMatchObject({ status: "idle", observed: [], hintOnly: true });
  });
});

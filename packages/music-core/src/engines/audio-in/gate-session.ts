/**
 * GateSession — the route-facing microphone wait gate.
 *
 * It owns one capture lifecycle and one {@link NoteGate}, and turns the gate's
 * stable observed-note snapshots into *ordinary* audio `noteOff`/`noteOn`
 * events on the existing {@link InputRouter} seam. There is no chord event type
 * and no follower branch: the shared wait rule and source arbitration already
 * handle audio like any other source.
 *
 * Snapshot diffing lives here rather than in the detector, so the route-level
 * rules stay in one place:
 *
 * - a new target group clears the accepted snapshot and retargets the gate
 *   *unarmed*, without routing synthetic cleanup offs — the follower already
 *   cleared the prior logical owner, and no new attack may be emitted until a
 *   real release/re-arm boundary. A repeated identical chord therefore cannot
 *   advance from a sustained carry-over;
 * - every event in one accepted snapshot carries a single monotonic timestamp
 *   and the detector's confidence;
 * - if the router rejects an attack (recent-MIDI arbitration), the snapshot is
 *   rolled back and the gate re-armed so a later attempt can retry cleanly;
 * - analysis from a superseded capture generation can never emit.
 *
 * Hint-only is the default and the fallback: without a passing acceptance
 * report for the current target, observed notes are published for display and
 * *no* events are ever pushed. MIDI and on-screen input stay untouched.
 */
import type { InputSource, InstrumentId, MonotonicMs, NoteEvent } from "@repo/music-core/domain";

import type { AudioPitchState } from "./capture";
import type { ChordAnalysis } from "./chord-source";
import {
  gateAcceptanceAdvertises,
  type GateAcceptanceReport,
  type GateMaterialId,
} from "./gate-acceptance";
import { NoteGate, type NoteGateOptions, type NoteGateReason } from "./note-gate";

/** The one user-facing hint-only message. */
export const MICROPHONE_HINT_MESSAGE =
  "Microphone can show detected notes, but use MIDI or the on-screen piano to continue.";

const AUDIO_SOURCE: InputSource = "audio";

export interface GateCaptureSource {
  readonly state: AudioPitchState;
  start(): Promise<void>;
  stop(): Promise<void>;
  subscribeAnalysis(listener: (analysis: ChordAnalysis) => void): () => void;
  subscribeState(listener: (state: AudioPitchState) => void): () => void;
}

export interface GateEventSink {
  push(event: NoteEvent): boolean;
}

export type GateHintReason =
  | "no-acceptance"
  | "unadvertised-target"
  | "out-of-range"
  | "not-listening"
  | "low-snr";

export interface GateSessionState {
  status: AudioPitchState["status"];
  message: string;
  /** Notes the detector believes are sounding; display only when hint-only. */
  observed: number[];
  reason: NoteGateReason;
  hintOnly: boolean;
  hintReason?: GateHintReason;
}

export interface GateSessionOptions {
  router: GateEventSink;
  createSource: () => GateCaptureSource;
  instrument?: InstrumentId;
  /** Omitted until a real acceptance report passes, which keeps this hint-only. */
  acceptance?: GateAcceptanceReport;
  gate?: NoteGateOptions;
  /** Consecutive low-signal frames that count as failed calibration. */
  lowSnrFrameLimit?: number;
  now?: () => number;
}

export class GateSession {
  readonly #options: GateSessionOptions;
  readonly #gate: NoteGate;
  readonly #now: () => number;
  readonly #lowSnrFrameLimit: number;
  readonly #listeners = new Set<(state: GateSessionState) => void>();

  #source?: GateCaptureSource;
  #unsubscribeAnalysis?: () => void;
  #unsubscribeState?: () => void;
  #generation = 0;
  #snapshot: number[] = [];
  #target: number[] = [];
  #material?: GateMaterialId;
  #lowSnrFrames = 0;
  #state: GateSessionState = {
    status: "idle",
    message: "",
    observed: [],
    reason: "listening",
    hintOnly: true,
    hintReason: "not-listening",
  };

  constructor(options: GateSessionOptions) {
    this.#options = options;
    this.#gate = new NoteGate(options.gate);
    this.#now = options.now ?? (() => globalThis.performance?.now() ?? Date.now());
    this.#lowSnrFrameLimit = options.lowSnrFrameLimit ?? 60;
  }

  get state(): GateSessionState {
    return this.#state;
  }

  /** True when the gate may push advancing events for the current target. */
  get hardGated(): boolean {
    return !this.#state.hintOnly;
  }

  subscribe(listener: (state: GateSessionState) => void): () => void {
    this.#listeners.add(listener);
    listener(this.#state);
    return () => this.#listeners.delete(listener);
  }

  /** Only ever called from an explicit user action; never prompts on its own. */
  async start(): Promise<void> {
    if (this.#source) return;
    const generation = ++this.#generation;
    const source = this.#options.createSource();
    this.#source = source;
    this.#snapshot = [];
    this.#lowSnrFrames = 0;
    this.#gate.reset();
    this.#gate.setTarget(this.#target);
    this.#unsubscribeState = source.subscribeState((state) => {
      if (generation !== this.#generation) return;
      this.#publish({ status: state.status, message: state.message ?? "" });
    });
    this.#unsubscribeAnalysis = source.subscribeAnalysis((analysis) => {
      // Stale analysis from a superseded capture can never emit.
      if (generation !== this.#generation || this.#source !== source) return;
      this.#onAnalysis(analysis);
    });
    await source.start();
  }

  /** Capture stops on cancel, summary, setup/source change, and teardown. */
  async stop(): Promise<void> {
    this.#generation += 1;
    const source = this.#source;
    this.#unsubscribeAnalysis?.();
    this.#unsubscribeState?.();
    this.#unsubscribeAnalysis = undefined;
    this.#unsubscribeState = undefined;
    this.#source = undefined;
    this.#snapshot = [];
    this.#lowSnrFrames = 0;
    this.#gate.reset();
    this.#gate.setTarget(this.#target);
    this.#publish({ status: "idle", message: "", observed: [], reason: "listening" });
    await source?.stop();
  }

  /**
   * Retarget for a new follower group: clear the accepted snapshot and land the
   * gate unarmed. No synthetic offs are routed.
   */
  setTarget(notes: readonly number[], material?: GateMaterialId): void {
    this.#target = [...notes];
    this.#material = material;
    this.#snapshot = [];
    this.#lowSnrFrames = 0;
    this.#gate.setTarget(notes);
    this.#publish({ observed: [], reason: "listening" });
  }

  dispose(): void {
    void this.stop();
    this.#listeners.clear();
  }

  #onAnalysis(analysis: ChordAnalysis): void {
    const result = this.#gate.process(analysis);
    if (result.reason === "low-signal") this.#lowSnrFrames += 1;
    else this.#lowSnrFrames = 0;

    this.#publish({ observed: result.observed, reason: result.reason });
    if (!result.matched || this.#state.hintOnly) return;

    const previous = this.#snapshot;
    const next = [...result.observed];
    const timestamp = this.#now() as MonotonicMs;
    this.#snapshot = next;

    for (const midiNote of previous.filter((note) => !next.includes(note))) {
      this.#push("noteOff", midiNote, timestamp, result.confidence);
    }
    const attacks = next.filter((note) => !previous.includes(note));
    const accepted = attacks.map((midiNote) =>
      this.#push("noteOn", midiNote, timestamp, result.confidence),
    );
    // A rejected attack rolls the snapshot back and re-arms, so the next fresh
    // attack can retry instead of being swallowed by a stale arbitration window.
    if (accepted.some((ok) => !ok)) {
      this.#snapshot = previous;
      this.#gate.rearm();
    }
  }

  #push(
    type: "noteOn" | "noteOff",
    midiNote: number,
    timestamp: MonotonicMs,
    confidence: number,
  ): boolean {
    const base = {
      midiNote,
      source: AUDIO_SOURCE,
      timestamp,
      clock: "performance",
      confidence,
      ...(this.#options.instrument !== undefined ? { instrument: this.#options.instrument } : {}),
    } as const;
    const event: NoteEvent =
      type === "noteOn" ? { ...base, type: "noteOn", velocity: 1 } : { ...base, type: "noteOff" };
    return this.#options.router.push(event);
  }

  #hintReason(status: AudioPitchState["status"]): GateHintReason | undefined {
    if (status !== "running") return "not-listening";
    if (!this.#gate.inRange) return "out-of-range";
    if (this.#lowSnrFrames >= this.#lowSnrFrameLimit) return "low-snr";
    if (!this.#options.acceptance) return "no-acceptance";
    if (!gateAcceptanceAdvertises(this.#options.acceptance, this.#target, this.#material)) {
      return "unadvertised-target";
    }
    return undefined;
  }

  #publish(patch: Partial<GateSessionState>): void {
    const status = patch.status ?? this.#state.status;
    const hintReason = this.#hintReason(status);
    const next: GateSessionState = {
      ...this.#state,
      ...patch,
      status,
      hintOnly: hintReason !== undefined,
      ...(hintReason === undefined ? {} : { hintReason }),
    };
    if (hintReason === undefined) delete next.hintReason;
    this.#state = next;
    for (const listener of this.#listeners) listener(next);
  }
}

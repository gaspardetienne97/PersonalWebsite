/**
 * AudioPitchSource — the thin browser layer of `audio-in`. Wires
 * `getUserMedia` → AudioContext → {@link ./pitch-worklet} and runs the pure
 * detectors on each posted frame, emitting tuner readings, pitch events, and
 * transient onset events. All Web-Audio glue lives here; the analysis math
 * stays in pure modules where it is unit-tested.
 */

import type { MonotonicMs, NoteOnEvent, OnsetEvent } from "@repo/music-core/domain";

import { OnsetDetector, type OnsetDetectOptions } from "./onset-detect";
import { detectPitch, type PitchDetectOptions } from "./pitch-detect";
import pitchWorkletSource from "./pitch-worklet.js?raw";
import { tunerReading, type TunerOptions, type TunerReading } from "./tuner";

export type AudioPitchStatus = "idle" | "requesting" | "running" | "denied" | "error";

/**
 * Window of the most recent samples the detector falls back to when a frame's
 * own estimate is low or unusable — twice the worklet frame, so a low string
 * gets twice the periods per estimate.
 */
const WIDE_WINDOW = 4096;
/**
 * Below this, a 2048-sample frame holds too few periods to estimate steadily
 * (E2 has 3.5). Above it the frame stands on its own and latency is unchanged.
 */
const WIDE_WINDOW_BELOW_HZ = 130;

export interface AudioPitchState {
  status: AudioPitchStatus;
  /** Human-readable reason when status is "denied" or "error". */
  message?: string;
}

export interface AudioPitchSourceOptions {
  detect?: Omit<PitchDetectOptions, "sampleRate">;
  tuner?: TunerOptions;
  onset?: OnsetDetectOptions;
}

type ReadingListener = (reading: TunerReading) => void;
type EventListener = (event: NoteOnEvent) => void;
type OnsetListener = (event: OnsetEvent) => void;
type StateListener = (state: AudioPitchState) => void;

async function loadPitchWorklet(context: AudioContext): Promise<void> {
  const moduleUrl = URL.createObjectURL(
    new Blob([pitchWorkletSource], { type: "text/javascript" }),
  );
  try {
    await context.audioWorklet.addModule(moduleUrl);
  } finally {
    URL.revokeObjectURL(moduleUrl);
  }
}

export class AudioPitchSource {
  #context?: AudioContext;
  #stream?: MediaStream;
  #node?: AudioWorkletNode;
  #source?: MediaStreamAudioSourceNode;

  #state: AudioPitchState = { status: "idle" };
  /** Rolling tail of the incoming frames, for the wide-window second pass. */
  #wide = new Float32Array(WIDE_WINDOW);
  #wideFilled = 0;
  #detectOptions: Omit<PitchDetectOptions, "sampleRate">;
  #tunerOptions: TunerOptions;
  #onsetDetector: OnsetDetector;

  #readingListeners = new Set<ReadingListener>();
  #eventListeners = new Set<EventListener>();
  #onsetListeners = new Set<OnsetListener>();
  #stateListeners = new Set<StateListener>();

  constructor(options: AudioPitchSourceOptions = {}) {
    this.#detectOptions = options.detect ?? {};
    this.#tunerOptions = options.tuner ?? {};
    this.#onsetDetector = new OnsetDetector(options.onset);
  }

  get state(): AudioPitchState {
    return this.#state;
  }

  /** Whether this browser exposes the APIs the source needs. */
  static get supported(): boolean {
    return (
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof AudioContext !== "undefined"
    );
  }

  async start(): Promise<void> {
    if (this.#state.status === "running" || this.#state.status === "requesting") return;
    if (!AudioPitchSource.supported) {
      this.#setState({ status: "error", message: "Audio input is not supported here." });
      return;
    }

    this.#setState({ status: "requesting" });
    this.#onsetDetector.reset();
    this.#wideFilled = 0;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false,
        },
      });
      this.#stream = stream;

      const context = new AudioContext();
      this.#context = context;
      await loadPitchWorklet(context);

      const source = context.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(context, "pitch-worklet");
      node.port.onmessage = (event: MessageEvent<Float32Array>) => {
        this.#onFrame(event.data, context.sampleRate);
      };
      // Connect source → worklet only (no destination) to avoid mic feedback.
      source.connect(node);

      this.#source = source;
      this.#node = node;
      this.#setState({ status: "running" });
    } catch (err) {
      const denied = err instanceof DOMException && err.name === "NotAllowedError";
      this.#setState({
        status: denied ? "denied" : "error",
        message: denied
          ? "Microphone access was blocked. Allow it to use audio input."
          : err instanceof Error
            ? err.message
            : "Could not start audio input.",
      });
      await this.stop();
    }
  }

  async stop(): Promise<void> {
    this.#node?.port.close();
    this.#node?.disconnect();
    this.#source?.disconnect();
    this.#stream?.getTracks().forEach((track) => track.stop());
    if (this.#context && this.#context.state !== "closed") {
      await this.#context.close();
    }
    this.#node = undefined;
    this.#source = undefined;
    this.#stream = undefined;
    this.#context = undefined;
    this.#onsetDetector.reset();
    this.#wideFilled = 0;
    if (this.#state.status === "running") this.#setState({ status: "idle" });
  }

  subscribe(listener: ReadingListener): () => void {
    this.#readingListeners.add(listener);
    return () => this.#readingListeners.delete(listener);
  }

  subscribeEvents(listener: EventListener): () => void {
    this.#eventListeners.add(listener);
    return () => this.#eventListeners.delete(listener);
  }

  subscribeOnsets(listener: OnsetListener): () => void {
    this.#onsetListeners.add(listener);
    return () => this.#onsetListeners.delete(listener);
  }

  subscribeState(listener: StateListener): () => void {
    this.#stateListeners.add(listener);
    listener(this.#state);
    return () => this.#stateListeners.delete(listener);
  }

  #onFrame(frame: Float32Array, sampleRate: number): void {
    const timestamp = (globalThis.performance?.now() ?? 0) as MonotonicMs;
    if (this.#onsetListeners.size > 0) {
      const detection = this.#onsetDetector.process(frame, timestamp);
      if (detection) {
        const event: OnsetEvent = {
          type: "onset",
          strength: detection.strength,
          source: "audio",
          confidence: detection.strength,
          timestamp,
          clock: "performance",
        };
        for (const listener of this.#onsetListeners) listener(event);
      }
    }

    this.#pushWide(frame);
    if (this.#readingListeners.size === 0 && this.#eventListeners.size === 0) return;

    const detectOptions = { sampleRate, ...this.#detectOptions };
    const estimate = detectPitch(frame, detectOptions);
    let reading = tunerReading(estimate, this.#tunerOptions);
    // Low notes and unusable frames get a second pass over the last 4096
    // samples: more periods per estimate, ~4 cents less frame-to-frame jitter,
    // and the frames a single 2048 window loses to noise come back. Notes above
    // 130 Hz never pay the extra pass, so their latency is unchanged.
    const lowOrUnusable = !reading || estimate.frequency < WIDE_WINDOW_BELOW_HZ;
    if (lowOrUnusable && this.#wideFilled === WIDE_WINDOW) {
      // `?? reading`: the wide window straddles two frames, so on a transition
      // (a new pluck, a string change) half of it is the previous signal and its
      // clarity can fall under the floor. It may improve a reading, never delete
      // one the single frame already earned.
      reading = tunerReading(detectPitch(this.#wide, detectOptions), this.#tunerOptions) ?? reading;
    }
    if (!reading) return;

    for (const listener of this.#readingListeners) listener(reading);

    if (this.#eventListeners.size > 0) {
      const event: NoteOnEvent = {
        type: "noteOn",
        midiNote: reading.midi,
        frequencyHz: reading.frequency,
        velocity: 1,
        source: "audio",
        confidence: reading.clarity,
        timestamp,
        clock: "performance",
      };
      for (const listener of this.#eventListeners) listener(event);
    }
  }

  /**
   * Slide the newest frame into the tail of the rolling wide window. Resetting
   * `#wideFilled` alone is enough to forget a previous session: the wide pass
   * only re-enables once WIDE_WINDOW fresh samples have landed, by which point
   * every stale sample has been overwritten.
   */
  #pushWide(frame: Float32Array): void {
    const n = Math.min(frame.length, WIDE_WINDOW);
    this.#wide.copyWithin(0, n);
    this.#wide.set(frame.subarray(frame.length - n), WIDE_WINDOW - n);
    this.#wideFilled = Math.min(WIDE_WINDOW, this.#wideFilled + n);
  }

  #setState(state: AudioPitchState): void {
    this.#state = state;
    for (const listener of this.#stateListeners) listener(state);
  }
}

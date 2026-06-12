/**
 * AudioPitchSource — the thin browser layer of `audio-in`. Wires
 * `getUserMedia` → AudioContext → {@link ./pitch-worklet} and runs the pure
 * detector on each posted frame, emitting a {@link TunerReading} and an
 * `audio`-source {@link NoteOnEvent} (so the Input Router can consume mic pitch
 * exactly like MIDI). All Web-Audio glue lives here; the analysis math stays in
 * {@link ./pitch-detect} and {@link ./tuner} where it is unit-tested.
 */

import type { MonotonicMs, NoteOnEvent } from "@repo/music-core/domain";

import { detectPitch, type PitchDetectOptions } from "./pitch-detect";
import pitchWorkletSource from "./pitch-worklet.js?raw";
import { tunerReading, type TunerOptions, type TunerReading } from "./tuner";

export type AudioPitchStatus = "idle" | "requesting" | "running" | "denied" | "error";

export interface AudioPitchState {
  status: AudioPitchStatus;
  /** Human-readable reason when status is "denied" or "error". */
  message?: string;
}

export interface AudioPitchSourceOptions {
  detect?: Omit<PitchDetectOptions, "sampleRate">;
  tuner?: TunerOptions;
}

type ReadingListener = (reading: TunerReading) => void;
type EventListener = (event: NoteOnEvent) => void;
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
  #detectOptions: Omit<PitchDetectOptions, "sampleRate">;
  #tunerOptions: TunerOptions;

  #readingListeners = new Set<ReadingListener>();
  #eventListeners = new Set<EventListener>();
  #stateListeners = new Set<StateListener>();

  constructor(options: AudioPitchSourceOptions = {}) {
    this.#detectOptions = options.detect ?? {};
    this.#tunerOptions = options.tuner ?? {};
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
          ? "Microphone access was blocked. Allow it to use the tuner."
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

  subscribeState(listener: StateListener): () => void {
    this.#stateListeners.add(listener);
    listener(this.#state);
    return () => this.#stateListeners.delete(listener);
  }

  #onFrame(frame: Float32Array, sampleRate: number): void {
    const estimate = detectPitch(frame, { sampleRate, ...this.#detectOptions });
    const reading = tunerReading(estimate, this.#tunerOptions);
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
        timestamp: (globalThis.performance?.now() ?? 0) as MonotonicMs,
        clock: "performance",
      };
      for (const listener of this.#eventListeners) listener(event);
    }
  }

  #setState(state: AudioPitchState): void {
    this.#state = state;
    for (const listener of this.#stateListeners) listener(state);
  }
}

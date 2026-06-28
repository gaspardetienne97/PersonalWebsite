/**
 * ChordAudioSource — buffered-streaming capture for chord following.
 *
 * Mirrors AudioPitchSource's getUserMedia/worklet lifecycle, but per frame it
 * computes a chroma vector + onset and keeps recent samples in a FrameRing. On
 * an onset it assembles the last `windowMs` and resamples to 22.05 kHz mono so
 * the route can run Basic Pitch on it. Pure analysis lives in computeChroma /
 * OnsetDetector / FrameRing / resampleLinear; this is only the Web-Audio glue.
 */
import type { MonotonicMs } from "@repo/music-core/domain";

import type { AudioPitchState } from "./capture";
import { computeChroma } from "./chroma";
import { FrameRing } from "./frame-ring";
import { OnsetDetector, type OnsetDetectOptions } from "./onset-detect";
import pitchWorkletSource from "./pitch-worklet.js?raw";
import { resampleLinear } from "./resample";

const BASIC_PITCH_RATE = 22_050;

export interface ChordAnalysis {
  chroma: Float32Array;
  timestamp: number;
  onset: boolean;
  onsetWindow?: Float32Array;
}

export interface ChordAudioSourceOptions {
  onset?: OnsetDetectOptions;
  windowMs?: number;
}

type AnalysisListener = (analysis: ChordAnalysis) => void;
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

export class ChordAudioSource {
  #context?: AudioContext;
  #stream?: MediaStream;
  #node?: AudioWorkletNode;
  #source?: MediaStreamAudioSourceNode;

  #state: AudioPitchState = { status: "idle" };
  #onsetDetector: OnsetDetector;
  #windowMs: number;
  #ring = new FrameRing(1);

  #analysisListeners = new Set<AnalysisListener>();
  #stateListeners = new Set<StateListener>();

  constructor(options: ChordAudioSourceOptions = {}) {
    this.#onsetDetector = new OnsetDetector(options.onset);
    this.#windowMs = options.windowMs ?? 600;
  }

  get state(): AudioPitchState {
    return this.#state;
  }

  static get supported(): boolean {
    return (
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof AudioContext !== "undefined"
    );
  }

  async start(): Promise<void> {
    if (this.#state.status === "running" || this.#state.status === "requesting") return;
    if (!ChordAudioSource.supported) {
      this.#setState({ status: "error", message: "Audio input is not supported here." });
      return;
    }
    this.#setState({ status: "requesting" });
    this.#onsetDetector.reset();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false },
      });
      this.#stream = stream;
      const context = new AudioContext();
      this.#context = context;
      // Ring holds a little more than one window so an onset can look back.
      this.#ring = new FrameRing(Math.ceil((this.#windowMs / 1000) * context.sampleRate * 1.5));
      await loadPitchWorklet(context);
      const source = context.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(context, "pitch-worklet");
      node.port.onmessage = (event: MessageEvent<Float32Array>) => {
        this.#onFrame(event.data, context.sampleRate);
      };
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
    if (this.#context && this.#context.state !== "closed") await this.#context.close();
    this.#node = undefined;
    this.#source = undefined;
    this.#stream = undefined;
    this.#context = undefined;
    this.#onsetDetector.reset();
    if (this.#state.status === "running") this.#setState({ status: "idle" });
  }

  subscribeAnalysis(listener: AnalysisListener): () => void {
    this.#analysisListeners.add(listener);
    return () => this.#analysisListeners.delete(listener);
  }

  subscribeState(listener: StateListener): () => void {
    this.#stateListeners.add(listener);
    listener(this.#state);
    return () => this.#stateListeners.delete(listener);
  }

  #onFrame(frame: Float32Array, sampleRate: number): void {
    if (this.#analysisListeners.size === 0) return;
    this.#ring.push(frame);
    const timestamp = (globalThis.performance?.now() ?? 0) as MonotonicMs;
    const chroma = computeChroma(frame, { sampleRate });
    const detection = this.#onsetDetector.process(frame, timestamp);
    const onset = detection !== undefined;
    let onsetWindow: Float32Array | undefined;
    if (onset) {
      const raw = this.#ring.takeLast(Math.ceil((this.#windowMs / 1000) * sampleRate));
      // Construction guarantees the 22.05 kHz mono contract Basic Pitch won't check.
      onsetWindow = resampleLinear(raw, sampleRate, BASIC_PITCH_RATE);
    }
    const analysis: ChordAnalysis = {
      chroma,
      timestamp,
      onset,
      ...(onsetWindow ? { onsetWindow } : {}),
    };
    for (const listener of this.#analysisListeners) listener(analysis);
  }

  #setState(state: AudioPitchState): void {
    this.#state = state;
    for (const listener of this.#stateListeners) listener(state);
  }
}

import { monotonicMs, type MonotonicMs } from "@repo/music-core/domain";

export type QuantizationGrid = "2n" | "4n" | "8n" | "16n" | "32n";
export type TransportPosition = number | string;

export interface TransportState {
  bpm: number;
  numerator: number;
  denominator: number;
  running: boolean;
  countInBars: number;
  quantizationGrid: QuantizationGrid;
  loop: {
    enabled: boolean;
    start: TransportPosition;
    end: TransportPosition;
  };
}

export interface ScheduledTick {
  beat: number;
  atMs: number;
  accented: boolean;
}

export interface TransportEvent {
  kind: "beat" | "subdivision";
  atSeconds: number;
  atMonotonicMs: MonotonicMs;
  beat: number;
  absoluteBeat: number;
  subdivision: number;
  accented: boolean;
  countingIn: boolean;
}

export interface ToneTransportClock {
  bpm: { value: number };
  timeSignature: number | [number, number];
  loop: boolean;
  loopStart: TransportPosition;
  loopEnd: TransportPosition;
  scheduleRepeat(
    callback: (atSeconds: number) => void,
    interval: QuantizationGrid,
    startTime?: TransportPosition,
  ): number;
  clear(eventId: number): unknown;
  start(time?: TransportPosition): unknown;
  stop(time?: TransportPosition): unknown;
}

export interface TransportEngineOptions {
  bpm?: number;
  numerator?: number;
  denominator?: number;
  countInBars?: number;
  quantizationGrid?: QuantizationGrid;
  onMetronomeClick?: (event: TransportEvent) => void;
  audioNowSeconds?: () => number;
  monotonicNowMs?: () => MonotonicMs;
}

type TransportListener = (event: TransportEvent) => void;

export function createTransportState(bpm = 100, numerator = 4, denominator = 4): TransportState {
  return {
    bpm,
    numerator,
    denominator,
    running: false,
    countInBars: 0,
    quantizationGrid: "4n",
    loop: { enabled: false, start: 0, end: "1m" },
  };
}

export function beatDurationMs(bpm: number): number {
  return 60_000 / bpm;
}

export function scheduleMetronomeTicks(
  state: Pick<TransportState, "bpm" | "numerator">,
  startMs: number,
  beats: number,
): ScheduledTick[] {
  const step = beatDurationMs(state.bpm);
  return Array.from({ length: beats }, (_, beat) => ({
    beat,
    atMs: startMs + beat * step,
    accented: beat % state.numerator === 0,
  }));
}

export function quantizeMs(valueMs: number, gridMs: number): number {
  return Math.round(valueMs / gridMs) * gridMs;
}

export class TransportEngine {
  readonly state: TransportState;
  lastEvent: TransportEvent | undefined;

  #clock: ToneTransportClock;
  #listeners = new Set<TransportListener>();
  #onMetronomeClick: ((event: TransportEvent) => void) | undefined;
  #audioNowSeconds: () => number;
  #monotonicNowMs: () => MonotonicMs;
  #scheduledEventId: number | undefined;
  #subdivisionIndex = 0;
  #generation = 0;

  constructor(clock: ToneTransportClock, options: TransportEngineOptions = {}) {
    this.#clock = clock;
    this.#onMetronomeClick = options.onMetronomeClick;
    this.#audioNowSeconds = options.audioNowSeconds ?? (() => performance.now() / 1_000);
    this.#monotonicNowMs = options.monotonicNowMs ?? (() => monotonicMs(performance.now()));
    this.state = createTransportState(options.bpm, options.numerator, options.denominator);
    this.state.countInBars = options.countInBars ?? 0;
    this.state.quantizationGrid = options.quantizationGrid ?? "4n";
    this.#applyStateToClock();
  }

  subscribe(listener: TransportListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  setBpm(bpm: number): void {
    if (!Number.isFinite(bpm) || bpm <= 0) throw new Error(`Invalid BPM: ${bpm}`);
    this.state.bpm = bpm;
    this.#applyBpmToClock();
  }

  setTimeSignature(numerator: number, denominator: number): void {
    if (!Number.isInteger(numerator) || numerator <= 0) {
      throw new Error(`Invalid time signature numerator: ${numerator}`);
    }
    if (![2, 4, 8, 16].includes(denominator)) {
      throw new Error(`Unsupported time signature denominator: ${denominator}`);
    }
    this.state.numerator = numerator;
    this.state.denominator = denominator;
    this.#clock.timeSignature = [numerator, denominator];
    this.#applyBpmToClock();
  }

  setCountInBars(bars: number): void {
    if (!Number.isInteger(bars) || bars < 0) throw new Error(`Invalid count-in bars: ${bars}`);
    this.state.countInBars = bars;
  }

  setLoopPoints(start: TransportPosition, end: TransportPosition): void {
    this.state.loop = { enabled: true, start, end };
    this.#clock.loopStart = start;
    this.#clock.loopEnd = end;
    this.#clock.loop = true;
  }

  clearLoop(): void {
    this.state.loop.enabled = false;
    this.#clock.loop = false;
  }

  setQuantizationGrid(grid: QuantizationGrid): void {
    this.state.quantizationGrid = grid;
    if (this.state.running) {
      this.stop();
      this.start();
    }
  }

  start(): void {
    if (this.state.running) return;
    this.#subdivisionIndex = 0;
    const generation = ++this.#generation;
    this.#scheduledEventId = this.#clock.scheduleRepeat(
      (atSeconds) => {
        if (this.state.running && this.#generation === generation) this.#emitTick(atSeconds);
      },
      this.state.quantizationGrid,
      0,
    );
    this.state.running = true;
    this.#clock.start();
  }

  stop(): void {
    this.#generation += 1;
    if (this.#scheduledEventId !== undefined) {
      this.#clock.clear(this.#scheduledEventId);
      this.#scheduledEventId = undefined;
    }
    this.#clock.stop();
    this.state.running = false;
    this.#subdivisionIndex = 0;
  }

  #applyStateToClock(): void {
    this.#applyBpmToClock();
    this.#clock.timeSignature = [this.state.numerator, this.state.denominator];
    this.#clock.loop = this.state.loop.enabled;
    this.#clock.loopStart = this.state.loop.start;
    this.#clock.loopEnd = this.state.loop.end;
  }

  #applyBpmToClock(): void {
    this.#clock.bpm.value = (this.state.bpm * 4) / this.state.denominator;
  }

  #emitTick(atSeconds: number): void {
    const subdivisionsPerBeat = gridSubdivisionsPerBeat(
      this.state.quantizationGrid,
      this.state.denominator,
    );
    const absoluteBeat = Math.floor(this.#subdivisionIndex / subdivisionsPerBeat);
    const beat = absoluteBeat % this.state.numerator;
    const subdivision = this.#subdivisionIndex % subdivisionsPerBeat;
    const accented = subdivision === 0 && beat === 0;
    const event: TransportEvent = {
      kind: subdivision === 0 ? "beat" : "subdivision",
      atSeconds,
      atMonotonicMs: monotonicMs(
        this.#monotonicNowMs() + (atSeconds - this.#audioNowSeconds()) * 1_000,
      ),
      beat,
      absoluteBeat,
      subdivision,
      accented,
      countingIn: absoluteBeat < this.state.countInBars * this.state.numerator,
    };

    this.lastEvent = event;
    if (event.kind === "beat") this.#onMetronomeClick?.(event);
    this.#listeners.forEach((listener) => listener(event));
    this.#subdivisionIndex += 1;
  }
}

export async function createToneTransportEngine(
  options: TransportEngineOptions = {},
): Promise<TransportEngine> {
  const tone = await import("tone");
  return new TransportEngine(tone.getTransport() as unknown as ToneTransportClock, {
    ...options,
    audioNowSeconds: options.audioNowSeconds ?? tone.now,
    monotonicNowMs: options.monotonicNowMs ?? (() => monotonicMs(performance.now())),
  });
}

function gridSubdivisionsPerBeat(grid: QuantizationGrid, denominator: number): number {
  const gridDenominator = Number.parseInt(grid, 10);
  return Math.max(1, gridDenominator / denominator);
}

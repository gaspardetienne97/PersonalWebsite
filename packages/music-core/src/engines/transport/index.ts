export interface TransportState {
  bpm: number;
  numerator: number;
  denominator: number;
  running: boolean;
}

export interface ScheduledTick {
  beat: number;
  atMs: number;
  accented: boolean;
}

export function createTransportState(bpm = 100, numerator = 4, denominator = 4): TransportState {
  return { bpm, numerator, denominator, running: false };
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

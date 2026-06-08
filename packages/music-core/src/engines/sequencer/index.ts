export interface PadRow {
  id: string;
  name: string;
  /** MIDI note the pad triggers. */
  midi: number;
}

export const BOOM_BAP_KIT: PadRow[] = [
  { id: "kick", name: "Kick", midi: 36 },
  { id: "snare", name: "Snare", midi: 38 },
  { id: "hats", name: "Hats", midi: 42 },
  { id: "openhat", name: "Open Hat", midi: 46 },
  { id: "808", name: "808", midi: 35 },
  { id: "perc", name: "Perc", midi: 39 },
];

/**
 * A pure step-sequencer grid: pad rows × steps. Holds on/off cells and reports
 * which pads fire at a given step. Playback timing is the route's concern
 * (Tone), keeping this engine framework-agnostic and testable.
 */
export class StepSequencer {
  readonly rows: PadRow[];
  readonly steps: number;
  #grid: boolean[][];
  swing = 0;

  constructor(rows: PadRow[], steps = 16) {
    this.rows = rows;
    this.steps = steps;
    this.#grid = rows.map(() => new Array<boolean>(steps).fill(false));
  }

  isOn(rowIndex: number, step: number): boolean {
    return this.#grid[rowIndex]?.[step] ?? false;
  }

  toggle(rowIndex: number, step: number): void {
    const row = this.#grid[rowIndex];
    if (!row || step < 0 || step >= this.steps) return;
    row[step] = !row[step];
  }

  rowPattern(rowIndex: number): boolean[] {
    return [...(this.#grid[rowIndex] ?? [])];
  }

  padsAt(step: number): PadRow[] {
    return this.rows.filter((_, rowIndex) => this.isOn(rowIndex, step));
  }

  clear(): void {
    this.#grid = this.rows.map(() => new Array<boolean>(this.steps).fill(false));
  }
}

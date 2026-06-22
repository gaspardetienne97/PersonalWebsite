export interface PadRow {
  id: string;
  name: string;
  /** MIDI note the pad triggers. */
  midi: number;
}

export interface StepSequencerPattern {
  steps: number;
  rows: Array<{
    id: string;
    steps: number[];
  }>;
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
    this.#grid = rows.map(() => Array.from({ length: steps }, () => false));
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

  toPattern(): StepSequencerPattern {
    return {
      steps: this.steps,
      rows: this.rows.map((row, rowIndex) => ({
        id: row.id,
        steps: this.rowPattern(rowIndex).flatMap((enabled, step) => (enabled ? [step] : [])),
      })),
    };
  }

  applyPattern(pattern: StepSequencerPattern): void {
    this.clear();
    const rowIndexById = new Map(this.rows.map((row, index) => [row.id, index]));
    for (const row of pattern.rows) {
      const rowIndex = rowIndexById.get(row.id);
      if (rowIndex === undefined) continue;
      for (const step of row.steps) {
        if (!Number.isInteger(step) || step < 0 || step >= this.steps) continue;
        this.toggle(rowIndex, step);
      }
    }
  }

  padsAt(step: number): PadRow[] {
    return this.rows.filter((_, rowIndex) => this.isOn(rowIndex, step));
  }

  clear(): void {
    this.#grid = this.rows.map(() => Array.from({ length: this.steps }, () => false));
  }
}

/**
 * NoteGate — constrained known-target detection for wait mode.
 *
 * It answers exactly one question: "is the chord I am currently waiting for
 * sounding right now, on its own, from a fresh attack?" It does not name
 * chords, choose progression positions, score timing, or control playback; the
 * buffered Basic Pitch path stays the transcription authority.
 *
 * Evidence per ~46 ms frame, all from the shared note-energy bank the capture
 * seam already published (the gate never rescans and never touches Web Audio):
 *
 * 1. frame RMS must clear an adaptive noise floor (learned the same way
 *    `OnsetDetector` learns one: only quiet frames update it);
 * 2. the observed note set — derived from the FULL 40–88 bank, so an arbitrary
 *    non-target extra anywhere in the range blocks a match — must equal the
 *    target set;
 * 3. every target bin must beat its adjacent semitones and its ±12/±24 octave
 *    confusers by `matchMargin`, because energy at the target frequency alone
 *    is not proof of the exact octave;
 * 4. that must hold for `stableFrames` consecutive frames (the rolling window);
 * 5. the gate must be *armed*: a match is only emitted after a re-arm boundary
 *    (silence, or a frame where the target was not fully sounding) since the
 *    last match. A sustained carry-over therefore cannot re-advance, including
 *    for a repeated identical chord.
 *
 * ponytail: the re-arm boundary is the hard requirement and a fresh onset only
 * lifts confidence — soft attacks do not reliably trip `OnsetDetector`, and
 * requiring an onset would fail the soft-dynamics acceptance cells outright.
 */
import { noteEnergy, type NoteEnergyBank } from "./chroma";

/** V1 hard-gate range: the existing chroma scan band, E2–E6. */
export const GATE_MIN_MIDI = 40;
export const GATE_MAX_MIDI = 88;

/**
 * Partials a real piano puts above a fundamental: octave, octave + fifth, two
 * octaves. A bin explained by one of these is a harmonic, not a played note.
 */
const HARMONIC_OFFSETS = [12, 19, 24];

/** Confusers a target must out-shout to prove its own octave. */
const CONFUSER_OFFSETS = [-24, -12, -1, 1, 12, 24];

export interface NoteGateOptions {
  /** Absolute frame-RMS floor below which a frame carries no evidence. */
  signalFloor?: number;
  /** Multiple of the learned noise floor a frame must also clear. */
  snrRatio?: number;
  /** Weight retained from the previous noise-floor estimate. */
  noiseFloorSmoothing?: number;
  /** Consecutive identical frames required before a snapshot is stable. */
  stableFrames?: number;
  /** Fraction of the strongest bin a bin must reach to count as sounding. */
  presenceRatio?: number;
  /** How strong a sub-octave must be, relative to a bin, to explain it. */
  harmonicMargin?: number;
  /** How far a target must beat its neighbours and octave confusers. */
  matchMargin?: number;
}

const DEFAULTS = {
  signalFloor: 0.01,
  snrRatio: 2.5,
  noiseFloorSmoothing: 0.9,
  stableFrames: 3,
  presenceRatio: 0.25,
  harmonicMargin: 0.9,
  matchMargin: 1.4,
} satisfies Required<NoteGateOptions>;

export type NoteGateReason = "listening" | "partial" | "extra" | "matched" | "low-signal";

export interface NoteGateResult {
  /** Every note the gate believes is sounding, across the whole band. */
  observed: number[];
  confidence: number;
  /** The observed set has held for `stableFrames` frames. */
  stable: boolean;
  /** Stable, complete, exclusive, in range, and past a re-arm boundary. */
  matched: boolean;
  reason: NoteGateReason;
  /** Frame RMS over the learned noise floor; below `snrRatio` is noise. */
  snr: number;
}

export interface NoteGateFrame {
  noteEnergies: NoteEnergyBank;
  rms: number;
  onset: boolean;
}

export class NoteGate {
  readonly #options: Required<NoteGateOptions>;
  #target: number[] = [];
  #targetSet = new Set<number>();
  #noiseFloor: number;
  #stableCount = 0;
  #observedKey = "";
  #armed = false;
  #onsetSinceArm = false;

  constructor(options: NoteGateOptions = {}) {
    this.#options = { ...DEFAULTS, ...options };
    this.#noiseFloor = this.#options.signalFloor / this.#options.snrRatio;
  }

  get target(): number[] {
    return [...this.#target];
  }

  get armed(): boolean {
    return this.#armed;
  }

  /** A non-empty target entirely inside the V1 hard-gate band. */
  get inRange(): boolean {
    return (
      this.#target.length > 0 &&
      this.#target.every((note) => note >= GATE_MIN_MIDI && note <= GATE_MAX_MIDI)
    );
  }

  /** Retargeting always lands unarmed, so a carry-over cannot advance. */
  setTarget(notes: Iterable<number>): void {
    this.#target = [...new Set(notes)].sort((left, right) => left - right);
    this.#targetSet = new Set(this.#target);
    this.#disarm();
  }

  /** Give a rejected snapshot another chance without waiting for a release. */
  rearm(): void {
    this.#armed = true;
    this.#stableCount = 0;
    this.#observedKey = "";
  }

  /** Full reset, including the learned noise floor, for a new capture. */
  reset(): void {
    this.#target = [];
    this.#targetSet = new Set();
    this.#noiseFloor = this.#options.signalFloor / this.#options.snrRatio;
    this.#disarm();
  }

  process(frame: NoteGateFrame): NoteGateResult {
    const threshold = Math.max(
      this.#options.signalFloor,
      this.#noiseFloor * this.#options.snrRatio,
    );
    const snr = frame.rms / Math.max(this.#noiseFloor, this.#options.signalFloor / 1_000);

    if (frame.rms < threshold) {
      const smoothing = this.#options.noiseFloorSmoothing;
      this.#noiseFloor = smoothing * this.#noiseFloor + (1 - smoothing) * frame.rms;
      this.rearm();
      return {
        observed: [],
        confidence: 0,
        stable: false,
        matched: false,
        reason: "low-signal",
        snr,
      };
    }

    if (frame.onset) this.#onsetSinceArm = true;

    const observed = observedNotes(frame.noteEnergies, this.#options);
    const key = observed.join(",");
    if (key === this.#observedKey) this.#stableCount += 1;
    else {
      this.#observedKey = key;
      this.#stableCount = 1;
    }
    const stable = this.#stableCount >= this.#options.stableFrames;

    const observedSet = new Set(observed);
    const extras = observed.filter((note) => !this.#targetSet.has(note));
    const confirmed = this.#target.filter(
      (note) =>
        observedSet.has(note) &&
        clearsConfusers(frame.noteEnergies, note, this.#targetSet, this.#options.matchMargin),
    );
    const complete = this.#target.length > 0 && confirmed.length === this.#target.length;

    // Anything short of the whole target sounding alone is a release boundary.
    if (!complete) {
      this.#armed = true;
      this.#onsetSinceArm = frame.onset;
    }

    const matched = complete && extras.length === 0 && stable && this.#armed && this.inRange;
    const confidence = this.#confidence(frame.noteEnergies, confirmed, extras, complete);
    if (matched) this.#disarm();

    return {
      observed,
      confidence,
      stable,
      matched,
      reason: matched
        ? "matched"
        : extras.length > 0
          ? "extra"
          : complete
            ? "listening"
            : "partial",
      snr,
    };
  }

  #confidence(
    bank: NoteEnergyBank,
    confirmed: number[],
    extras: number[],
    complete: boolean,
  ): number {
    if (!complete) return 0;
    const targetEnergy = confirmed.reduce((total, note) => total + noteEnergy(bank, note), 0);
    const extraEnergy = extras.reduce((total, note) => total + noteEnergy(bank, note), 0);
    const share = targetEnergy > 0 ? targetEnergy / (targetEnergy + extraEnergy) : 0;
    const settled = Math.min(1, this.#stableCount / this.#options.stableFrames);
    return clamp01(share * settled * (this.#onsetSinceArm ? 1 : 0.9));
  }

  #disarm(): void {
    this.#armed = false;
    this.#onsetSinceArm = false;
    this.#stableCount = 0;
    this.#observedKey = "";
  }
}

/**
 * Every note the bank says is sounding: a local peak clearing a share of the
 * strongest bin, minus bins a lower octave already explains as a harmonic.
 *
 * ponytail: peak-relative presence plus sub-octave subtraction, not a spectral
 * model. Its known ceiling is the low register, where a 2,048-sample Goertzel
 * window cannot resolve adjacent semitones — those strata fail acceptance and
 * stay hint-only rather than being propped up with a bigger analysis stage.
 */
function observedNotes(bank: NoteEnergyBank, options: Required<NoteGateOptions>): number[] {
  let peak = 0;
  for (const value of bank.energies) if (value > peak) peak = value;
  if (peak <= 0) return [];

  const floor = peak * options.presenceRatio;
  const observed: number[] = [];
  for (let midi = bank.minMidi; midi <= bank.maxMidi; midi++) {
    const energy = noteEnergy(bank, midi);
    if (energy < floor) continue;
    if (energy < noteEnergy(bank, midi - 1) || energy < noteEnergy(bank, midi + 1)) continue;
    const harmonic = HARMONIC_OFFSETS.some(
      (offset) => noteEnergy(bank, midi - offset) * options.harmonicMargin >= energy,
    );
    if (harmonic) continue;
    observed.push(midi);
  }
  return observed;
}

/** A target must beat every confuser that is not itself a target note. */
function clearsConfusers(
  bank: NoteEnergyBank,
  target: number,
  targetSet: Set<number>,
  margin: number,
): boolean {
  const energy = noteEnergy(bank, target);
  for (const offset of CONFUSER_OFFSETS) {
    const confuser = target + offset;
    if (targetSet.has(confuser)) continue;
    if (energy < noteEnergy(bank, confuser) * margin) return false;
  }
  return true;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

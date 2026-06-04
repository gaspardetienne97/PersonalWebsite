export type StringInstrumentId = "guitar" | "ukulele";

export interface TuningProfile {
  id: string;
  name: string;
  instrument: StringInstrumentId;
  /** Conventional string-number order: string 1 first. */
  openStrings: number[];
  fretCount: number;
  notationTransposition: number;
  source: "curated" | "custom";
}

export type TuningValidationField = "id" | "name" | "openStrings" | "fretCount";

export interface TuningValidation {
  valid: boolean;
  errors: Partial<Record<TuningValidationField, string>>;
}

const CURATED: Record<StringInstrumentId, TuningProfile[]> = {
  guitar: [
    profile("guitar.standard", "Standard", "guitar", [64, 59, 55, 50, 45, 40], 22, -12),
    profile("guitar.drop-d", "Drop D", "guitar", [64, 59, 55, 50, 45, 38], 22, -12),
    profile("guitar.dadgad", "DADGAD", "guitar", [62, 57, 55, 50, 45, 38], 22, -12),
    profile("guitar.open-g", "Open G", "guitar", [62, 59, 55, 50, 43, 38], 22, -12),
  ],
  ukulele: [
    profile("ukulele.high-g", "High G", "ukulele", [69, 64, 60, 67], 15, 0),
    profile("ukulele.low-g", "Low G", "ukulele", [69, 64, 60, 55], 15, 0),
    profile("ukulele.baritone", "Baritone DGBE", "ukulele", [64, 59, 55, 50], 15, 0),
  ],
};

export function curatedTunings(instrument: StringInstrumentId): TuningProfile[] {
  return structuredClone(CURATED[instrument]);
}

export function validateTuning(tuning: TuningProfile): TuningValidation {
  const errors: TuningValidation["errors"] = {};

  if (tuning.source === "custom" && !tuning.id.startsWith("custom.")) {
    errors.id = "Custom tuning ids must start with custom.";
  }
  if (tuning.name.trim() === "") errors.name = "Tuning name is required.";

  const expectedStrings = tuning.instrument === "guitar" ? 6 : 4;
  const validNotes =
    tuning.openStrings.length === expectedStrings &&
    tuning.openStrings.every((midi) => Number.isInteger(midi) && midi >= 0 && midi <= 127);
  if (!validNotes) {
    const instrument = tuning.instrument === "guitar" ? "Guitar" : "Ukulele";
    errors.openStrings = `${instrument} tunings need exactly ${expectedStrings} valid MIDI notes.`;
  }

  if (!Number.isInteger(tuning.fretCount) || tuning.fretCount < 1 || tuning.fretCount > 36) {
    errors.fretCount = "Fret count must be an integer from 1 to 36.";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

function profile(
  id: string,
  name: string,
  instrument: StringInstrumentId,
  openStrings: number[],
  fretCount: number,
  notationTransposition: number,
): TuningProfile {
  return {
    id,
    name,
    instrument,
    openStrings,
    fretCount,
    notationTransposition,
    source: "curated",
  };
}

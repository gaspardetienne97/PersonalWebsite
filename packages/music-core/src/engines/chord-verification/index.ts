export interface ChordVerificationInput {
  expectedMidiNotes: number[];
  observedMidiNotes: number[];
}

export interface ChordVerificationResult {
  expectedPitchClasses: number[];
  observedPitchClasses: number[];
  matchedPitchClasses: number[];
  missingPitchClasses: number[];
  extraPitchClasses: number[];
  coverage: number;
  score: number;
  correct: boolean;
}

export function verifyChordTarget(input: ChordVerificationInput): ChordVerificationResult {
  const expectedPitchClasses = uniquePitchClasses(input.expectedMidiNotes);
  const observedPitchClasses = uniquePitchClasses(input.observedMidiNotes);
  const matchedPitchClasses = expectedPitchClasses.filter((pitchClass) =>
    observedPitchClasses.includes(pitchClass),
  );
  const missingPitchClasses = expectedPitchClasses.filter(
    (pitchClass) => !observedPitchClasses.includes(pitchClass),
  );
  const extraPitchClasses = observedPitchClasses.filter(
    (pitchClass) => !expectedPitchClasses.includes(pitchClass),
  );
  const coverage =
    expectedPitchClasses.length === 0
      ? 0
      : matchedPitchClasses.length / expectedPitchClasses.length;
  const extraPenalty =
    expectedPitchClasses.length === 0
      ? extraPitchClasses.length
      : extraPitchClasses.length / expectedPitchClasses.length;
  const score = clamp01(coverage - extraPenalty * 0.25);

  return {
    expectedPitchClasses,
    observedPitchClasses,
    matchedPitchClasses,
    missingPitchClasses,
    extraPitchClasses,
    coverage,
    score,
    correct: coverage === 1 && extraPitchClasses.length === 0 && expectedPitchClasses.length > 0,
  };
}

function uniquePitchClasses(midiNotes: number[]): number[] {
  return [...new Set(midiNotes.map((midi) => pitchClass(midi)))].sort(
    (left, right) => left - right,
  );
}

function pitchClass(midiNote: number): number {
  return ((Math.round(midiNote) % 12) + 12) % 12;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

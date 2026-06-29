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

/**
 * Extra-tone penalty weight: a chord shouldn't grade clean when the observation
 * is flooded with non-chord tones. Shared by `verifyChordTarget` and the
 * streaming `chord-follower` so the constant lives in exactly one place.
 */
export const EXTRA_TONE_PENALTY = 0.25;

/**
 * Coverage of the expected template, penalized by the ratio of extra (non-chord)
 * tones. The single grading formula used by both chord-verification and the
 * real-time chord-follower.
 */
export function coverageScore(coverage: number, extraRatio: number): number {
  return clamp01(coverage - EXTRA_TONE_PENALTY * extraRatio);
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
  const score = coverageScore(coverage, extraPenalty);

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

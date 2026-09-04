/**
 * Suggested finger numbers (1 = thumb … 5 = pinky) for a hand's note set, one
 * finger per ascending pitch. Right hand counts up from the thumb; left hand
 * counts down from the pinky. The only survivor of the deleted legacy geometry module.
 */
export function suggestedFingerings(
  midiNotes: number[],
  hand: "left" | "right" | "both" | undefined,
): Record<number, number> {
  const unique = [...new Set(midiNotes)].sort((left, right) => left - right);
  return Object.fromEntries(
    unique.map((midiNote, index) => [
      midiNote,
      hand === "left" ? Math.max(1, 5 - index) : Math.min(5, index + 1),
    ]),
  );
}

/** Finger numbers require an authored map; pitch order alone cannot supply one. */
export function suggestedFingerings(
  _midiNotes: number[],
  _hand: "left" | "right" | "both" | undefined,
  authored: Record<number, number> = {},
): Record<number, number> {
  return authored;
}

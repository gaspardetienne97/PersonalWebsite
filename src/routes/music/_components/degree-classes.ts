// Musical colour: every scale degree keeps one fixed colour in every drill and
// reference view (tokens --degree-* in app.css). Literal class strings so
// Tailwind emits them; hue is never the only carrier (the degree name or the
// note name always sits on the element).
export const DEGREE_CLASS: Record<string, string> = {
  "1": "border-degree-1 bg-degree-1/40",
  b2: "border-degree-b2 bg-degree-b2/40",
  "2": "border-degree-2 bg-degree-2/40",
  b3: "border-degree-b3 bg-degree-b3/40",
  "3": "border-degree-3 bg-degree-3/40",
  "4": "border-degree-4 bg-degree-4/40",
  "#4": "border-degree-s4 bg-degree-s4/40",
  "5": "border-degree-5 bg-degree-5/40",
  b6: "border-degree-b6 bg-degree-b6/40",
  "6": "border-degree-6 bg-degree-6/40",
  b7: "border-degree-b7 bg-degree-b7/40",
  "7": "border-degree-7 bg-degree-7/40",
};

const TOKENS_BY_SEMITONE = ["1", "b2", "2", "b3", "3", "4", "#4", "5", "b6", "6", "b7", "7"];

/** The degree token for a note `semitones` above the root (any octave). */
export function degreeToken(semitones: number): string {
  return TOKENS_BY_SEMITONE[((semitones % 12) + 12) % 12]!;
}

export function degreeClassForSemitones(semitones: number): string {
  return DEGREE_CLASS[degreeToken(semitones)]!;
}

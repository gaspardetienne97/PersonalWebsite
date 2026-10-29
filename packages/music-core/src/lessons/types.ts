export type LessonFigure =
  | { kind: "wheel"; selected?: number | null; marks?: Record<number, string> } // fifths -7..7, as CircleOfFifths
  | { kind: "signature"; clef: "treble" | "bass"; fifths: number; reveal?: number } // first `reveal` accidentals
  | { kind: "keys"; low: number; high: number; marks: Record<number, string> } // midi -> label, as Piano
  | {
      kind: "fretboard";
      instrument: "guitar" | "ukulele";
      /** Open-string midi, string 1 first; the instrument's standard tuning when absent. */
      openStrings?: number[];
      marks: { string: number; fret: number; label: string }[];
    };

/** Times in seconds. */
export interface LessonSound {
  /** `drum` plays the note as a drum hit (General MIDI number); `velocity` is 0 to 1. */
  notes: { midi: number[]; at: number; dur: number; drum?: boolean; velocity?: number }[];
}

export interface LessonStep {
  text: string;
  figure?: LessonFigure;
  sound?: LessonSound;
}

export interface LessonScreen {
  title: string;
  text: string;
  figure?: LessonFigure;
  sound?: LessonSound;
  /** Step-through example: Next reveals one step at a time. */
  steps?: LessonStep[];
  /** Hear each option, or an A/B: each a labelled button that plays and shows. */
  options?: { label: string; sound: LessonSound; figure?: LessonFigure }[];
}

export interface Lesson {
  id: string;
  title: string;
  screens: LessonScreen[];
}

export interface LessonRef {
  lessons: Lesson[];
  trigger?: "open" | "check";
}

/** Lessons not yet seen, in order. An old backup may lack the seen list. */
export function pendingLessons(
  ref: LessonRef | null,
  seen: readonly string[] | undefined,
): Lesson[] {
  return ref ? ref.lessons.filter((l) => !seen?.includes(l.id)) : [];
}

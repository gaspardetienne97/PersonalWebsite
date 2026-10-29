import type { StudioChange, StudioMaterial } from "../content/studio";

export type LessonFigure =
  | { kind: "wheel"; selected?: number | null; marks?: Record<number, string> } // fifths -7..7, as CircleOfFifths
  | { kind: "signature"; clef: "treble" | "bass"; fifths: number; reveal?: number } // first `reveal` accidentals
  | { kind: "keys"; low: number; high: number; marks: Record<number, string> } // midi -> label, as Piano
  | {
      /** The groove dictation grid, read-only: kick, snare and hat rows, `perBeat` cells a beat, onsets in beats. */
      kind: "groove";
      bars: number;
      perBeat: 2 | 4;
      lanes: Partial<Record<"hat" | "snare" | "kick", number[]>>;
    }
  | {
      /** Notes on one staff, one after another; `midi: null` is a rest. A bar as long as the notes. */
      kind: "staff";
      clef: "treble" | "bass";
      notes: { midi: number | null; beats: number }[];
      /** Key signature as circle-of-fifths position; none when absent. */
      fifths?: number;
      /** The bar's time signature, drawn when given. */
      meter?: { beats: number; beatUnit: number };
    }
  | {
      /** One line of rhythm on the dictation grid, read-only; onsets in beats from the start. */
      kind: "rhythm";
      bars: number;
      perBeat: 2 | 3 | 4;
      beatsPerBar: 2 | 4;
      onsets: number[];
    }
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
  /**
   * A studio loop heard through the drill's own audio graph, as in the mixing-ear quiz
   * (`notes` is then empty). `matched` trims Changed to Flat's loudness, as the quiz does.
   */
  effect?: { material: StudioMaterial; change: StudioChange; matched?: boolean };
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

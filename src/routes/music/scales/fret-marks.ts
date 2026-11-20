// The scale on the neck: every target with its fretting finger, the root
// marked, the step to play now lit, and each played step green or red.
import { pc } from "@repo/music-core";
import type { FretMark } from "#lib/music/components/Fretboard.svelte";

export type Outcome = "correct" | "wrong" | "missed";
// A place played on the way up and again on the way down shows its worse take.
const RANK = { correct: 1, missed: 2, wrong: 3 } as const;
const SPOKEN = { correct: "played right", wrong: "played wrong", missed: "missed" } as const;

/** One finger a fret from the lowest fretted note, 1 index to 4 little finger; open strings take none. */
// ponytail: assumes the one hand position positionLine picks; a line that shifts position needs fingering per note.
export const fretFinger = (fret: number, lowest: number) =>
  fret > 0 ? Math.min(4, Math.max(1, fret - lowest + 1)) : undefined;

export function scaleFretMarks(o: {
  steps: readonly { notes: readonly { midi: number }[] }[];
  at: ReadonlyMap<number, { string: number; fret: number }>;
  tonic: number;
  /** Every target, else only the demo's step. */
  all: boolean;
  outcomes: readonly (Outcome | undefined)[];
  /** The step to play now, during a run. */
  now?: number | null;
  demo?: number | null;
}): FretMark[] {
  const fretted = [...o.at.values()].map((p) => p.fret).filter((f) => f > 0);
  const lowest = fretted.length ? Math.min(...fretted) : 1;
  const by = new Map<
    number,
    { string: number; fret: number; midi: number; outcome?: Outcome; now: boolean; demo: boolean }
  >();
  o.steps.forEach((st, i) => {
    if (!o.all && i !== o.demo) return;
    for (const n of st.notes) {
      const p = o.at.get(n.midi);
      if (!p) continue;
      const k = p.string * 100 + p.fret;
      const m = by.get(k) ?? { ...p, midi: n.midi, now: false, demo: false };
      const out = o.outcomes[i];
      if (out && (!m.outcome || RANK[out] > RANK[m.outcome])) m.outcome = out;
      m.now ||= i === o.now;
      m.demo ||= i === o.demo;
      by.set(k, m);
    }
  });
  return [...by.values()].map((m): FretMark => {
    const root = pc(m.midi) === pc(o.tonic);
    const state = m.now
      ? "now"
      : m.outcome === "correct"
        ? "correct"
        : m.outcome
          ? "wrong"
          : undefined;
    const finger = fretFinger(m.fret, lowest);
    return {
      string: m.string,
      fret: m.fret,
      finger,
      role: root ? "root" : undefined,
      state,
      demo: m.demo || undefined,
      label: state === "correct" ? "✓" : state === "wrong" ? "✕" : finger?.toString(),
      spoken: ["target", root && "root", m.now ? "play next" : m.outcome && SPOKEN[m.outcome]]
        .filter(Boolean)
        .join(", "),
    };
  });
}

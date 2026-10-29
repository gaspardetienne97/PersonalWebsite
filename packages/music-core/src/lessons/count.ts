// The count names a rhythm is read with, shared by the lessons and LessonView (kept small: every drill page loads it).

/** The count names on the grid: a number on the beat, then these. */
export const SUBS = { 2: ["&"], 3: ["&", "a"], 4: ["e", "&", "a"] } as const;
export type PerBeat = 2 | 3 | 4;

/** "1", "2 &", "3 e": the count a note at `beat` falls on. */
export function countName(beat: number, perBeat: PerBeat, beatsPerBar: number): string {
  const i = Math.round(beat * perBeat);
  const sub = i % perBeat;
  const num = (Math.floor(i / perBeat) % beatsPerBar) + 1;
  return sub ? `${num} ${SUBS[perBeat][sub - 1]}` : String(num);
}

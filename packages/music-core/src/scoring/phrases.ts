// Phrases with chords in them: the notes that start together are one event,
// and an event is right when every pitch class in it was played, in any order
// and any octave (a MIDI chord, a strum, or strings tapped one by one).
import type { NoteEvent } from "../types";
import { pc } from "../theory/notes";
import { type Graded, noteOns, notMeasured } from "./grade";

export interface PhraseEventNote {
  midi: number;
  string?: number;
  fret?: number;
}
export interface PhraseEvent {
  startBeat: number;
  notes: PhraseEventNote[];
}

/** Notes that start on the same beat, as one event each, in time order. */
export function phraseEvents(
  notes: readonly (PhraseEventNote & { startBeat: number })[],
): PhraseEvent[] {
  const out: PhraseEvent[] = [];
  for (const n of [...notes].sort((a, b) => a.startBeat - b.startBeat)) {
    const last = out.at(-1);
    const { startBeat, ...note } = n;
    if (last && Math.abs(last.startBeat - startBeat) < 1e-6) last.notes.push(note);
    else out.push({ startBeat, notes: [note] });
  }
  return out;
}

/** A doubled note (two strings on one pitch class) still belongs to its chord this long after the first. */
export const CHORD_SPREAD_MS = 150;

export interface EventMatch {
  right: boolean;
  /** When the event's first note came, null when nothing did. */
  at: number | null;
  played: NoteEvent[];
}

/**
 * Walk the played note-ons through the events in order. An event takes notes
 * while their pitch class is in it, up to its note count; once every pitch
 * class is in, only doublings within CHORD_SPREAD_MS still join it. A note
 * outside the event is a wrong event on its own, so the rest stays aligned.
 * ponytail: tapping a doubled string slowly can spill into the next event; a
 * per-string match would fix it for on-screen taps.
 */
export function matchEvents(
  events: readonly PhraseEvent[],
  notes: readonly NoteEvent[],
): EventMatch[] {
  const played = noteOns(notes);
  const out: EventMatch[] = [];
  let p = 0;
  for (const e of events) {
    if (p >= played.length) break;
    const want = new Set(e.notes.map((n) => pc(n.midi)));
    const seen = new Set<number>();
    const got: NoteEvent[] = [];
    while (p < played.length && got.length < e.notes.length) {
      const q = played[p];
      const k = pc(q.midi);
      if (!want.has(k)) {
        if (!got.length) {
          got.push(q);
          p++;
        }
        break;
      }
      const complete = seen.size === want.size;
      if (complete && (seen.has(k) ? q.at - got[0].at > CHORD_SPREAD_MS : true)) break;
      seen.add(k);
      got.push(q);
      p++;
    }
    out.push({
      right: seen.size === want.size && got.every((g) => want.has(pc(g.midi))),
      at: got[0]?.at ?? null,
      played: got,
    });
  }
  return out;
}

export interface PhraseResult extends Graded {
  /** Events right, of all. */
  matched: number;
  total: number;
  onTime: number;
  /** Fretted instruments, on-screen taps only; null when not measured. */
  positions: number | null;
  /** First event wrong or missing, null when all right. */
  firstWrong: number | null;
}

/**
 * score = events right / events, correct at 0.9. On time when an event's first
 * note lands within min(180, beat/4) of a grid anchored on the count-in.
 */
export function gradePhrase(input: {
  events: readonly PhraseEvent[];
  notes: readonly NoteEvent[];
  beatMs: number;
  startAt: number;
}): PhraseResult {
  const { events, beatMs, startAt } = input;
  const m = matchEvents(events, input.notes);
  const onTimeMs = Math.min(180, beatMs / 4);
  const expectedAt = (i: number) => startAt + events[i].startBeat * beatMs;
  const matched = m.filter((x) => x.right).length;
  const onTime = m.filter(
    (x, i) => x.right && x.at !== null && Math.abs(x.at - expectedAt(i)) <= onTimeMs,
  ).length;
  const fretted = events.some((e) => e.notes.some((n) => n.string !== undefined));
  // A position counts only for on-screen taps, which know their string and fret: an event is right when every tap was.
  const posChecks = m.flatMap((x, i) => {
    const taps = x.played.filter((q) => q.source === "onscreen" && q.string !== undefined);
    return taps.length
      ? [taps.every((q) => events[i].notes.some((n) => n.string === q.string && n.fret === q.fret))]
      : [];
  });
  const positionsMeasured = fretted && posChecks.length > 0;
  const wrongAt = events.findIndex((_, i) => !m[i]?.right);
  const score = events.length ? matched / events.length : 0;
  return {
    score,
    correct: score >= 0.9,
    metrics: [
      ...events.map((e, i) => ({
        kind: "pitch" as const,
        expectedMidi: e.notes[0].midi,
        actualMidi: m[i]?.played[0]?.midi,
      })),
      ...m.flatMap((x, i) =>
        x.at === null
          ? []
          : [
              {
                kind: "timing" as const,
                expectedMs: expectedAt(i),
                actualMs: x.at,
                errorMs: x.at - expectedAt(i),
              },
            ],
      ),
    ],
    notMeasured: fretted ? notMeasured({ position: positionsMeasured }) : [],
    matched,
    total: events.length,
    onTime,
    positions: positionsMeasured ? posChecks.filter(Boolean).length : null,
    firstWrong: wrongAt < 0 ? null : wrongAt,
  };
}

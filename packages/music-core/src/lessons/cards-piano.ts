// Concept cards for the piano drills that cards.ts does not hold: the minor and altered voicings,
// guide tones, the gospel progressions, the thumb passing under, and the chord-scale tabs.

import {
  DOMINANT_VOICING as DOM,
  GOSPEL_PROGRESSIONS,
  UPPER_STRUCTURE_II as US_II,
  chordPattern,
  chordPatternLine,
  chordScaleTargets,
  gospelChords,
  stripJt as strip,
  voiceLeadingTargets,
  type ChordPattern,
} from "../content/piano";
import { SCALE_FINGERINGS } from "../content/piano-fingering";
import { parseChordSymbol } from "../theory/chords";
import { noteName, pc } from "../theory/notes";
import { scaleSemitones } from "../theory/scales";
import { degreeOf, flat, join, run, sharp, tones, voicingInC } from "./card-kit";
import { keys } from "./tier1";
import type { Lesson, LessonFigure, LessonSound, LessonStep } from "./types";

// ---------------------------------------------------------------------------
// Voicings: minor, altered

/** A tone's name against the chord: the drill's own words for the half-diminished ii and the altered V. */
const HALF_DIM: Record<number, string> = { 0: "1", 3: "b3", 6: "b5", 10: "b7" };
const DOMINANT: Record<number, string> = {
  1: "b9",
  2: "9",
  3: "#9",
  4: "3",
  6: "#11",
  7: "5",
  8: "b13",
  9: "13",
  10: "7",
};
export function tag(symbol: string, midi: number): string {
  const root = parseChordSymbol(symbol)!.rootPc;
  const i = pc(midi - root);
  if (/m7b5/.test(symbol)) return HALF_DIM[i] ?? String(i);
  if (/alt|b9|13/.test(symbol)) return DOMINANT[i] ?? String(i);
  return degreeOf(symbol, midi);
}
/** The right hand of a voicing target from the bottom, as tags: "b3 b5 b7 1". */
export const tagsOf = (symbol: string, displayMidi: number[]) =>
  displayMidi
    .slice(1)
    .sort((a, b) => a - b)
    .map((m) => tag(symbol, m))
    .join(" ");

function voicingSteps(ts: ReturnType<typeof voicingInC>): LessonStep[] {
  const span = ts.flatMap((t) => t.displayMidi);
  return ts.map((t) => {
    const name = /#11/.test(t.symbol) ? sharp : flat;
    const rh = t.displayMidi.slice(1).sort((a, b) => a - b);
    return {
      text: `${t.symbol}: ${tagsOf(t.symbol, t.displayMidi)} is ${rh.map(name).join(" ")}, with ${name(t.displayMidi[0])} below.`,
      figure: keys(
        Object.fromEntries([[t.displayMidi[0], "root"], ...rh.map((m) => [m, tag(t.symbol, m)])]),
        span,
      ),
      sound: tones(t.displayMidi),
    };
  });
}

export function minorVoicings(): Lesson {
  const ts = voicingInC("minor");
  const top = pc(Math.max(...ts[0].displayMidi)) === pc(ts[0].displayMidi[0]);
  const altered = ts[1].displayMidi
    .slice(1)
    .sort((a, b) => a - b)
    .map((midi) => ({ midi, tag: tag(ts[1].symbol, midi) }))
    .filter((x) => /[b#]/.test(x.tag) && x.tag !== "b3");
  return {
    id: "voicings.minor",
    title: "Minor ii-V-i voicings",
    screens: [
      {
        title: "Half-diminished, altered, minor",
        text: `The minor ii-V-i is ${join(ts.map((t) => t.symbol))} in C minor. The ii is half-diminished (m7b5: flat 3rd, flat 5th, flat 7th)${top ? ", voiced with the root on top" : ""}. The V is altered, and the i is a rootless minor 7th.`,
        steps: voicingSteps(ts),
      },
      {
        title: "The altered V",
        text: `${ts[1].symbol} uses the voicing "${DOM.altered.label}". Its altered tones are the ${join(altered.map((a) => `${a.tag} (${flat(a.midi)})`))}. ${strip(DOM.altered.hint)}`,
      },
    ],
  };
}

export function alteredVoicings(): Lesson {
  const ts = voicingInC("altered");
  return {
    id: "voicings.altered",
    title: "Altered dominant voicings",
    screens: [
      {
        title: "Three ways to colour the V",
        text: "Each voicing puts tension tones on the G dominant of a ii-V-I in C. The tones are named against the chord: b9 is the 9th lowered a half step, #11 the 11th raised, and 13 the 6th an octave up. Tap Next for each voicing.",
        steps: voicingSteps(ts),
      },
      {
        title: "What each one is",
        text: `${ts[0].symbol} is "${DOM.rootlessB9.label}": ${strip(DOM.rootlessB9.hint)} ${ts[1].symbol} is "${DOM.altered.label}": ${strip(DOM.altered.hint)} The third is an upper structure: a ${US_II.triad} triad, a major triad a whole step above the root, over a 1 3 7 shell, adding the ${US_II.adds}.`,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Voicings: guide tones, gospel

export function guideTones(): Lesson {
  // The drill's own pairs: Dm7 is given, then each chord's pair nearest the one before.
  const vt = voiceLeadingTargets();
  const seq = [
    { s: "Dm7", midi: vt[0].fromMidi },
    { s: vt[0].symbol, midi: vt[0].targetMidi },
    { s: vt[1].symbol, midi: vt[1].targetMidi },
  ];
  const info = seq.map(({ s, midi }) => {
    const c = parseChordSymbol(s)!;
    const at = (...is: number[]) => midi.find((m) => is.some((i) => pc(m) === pc(c.rootPc + i)))!;
    return { s, third: at(3, 4), seventh: at(10, 11) };
  });
  const span = info.flatMap((x) => [x.third, x.seventh]);
  return {
    id: "voicings.guide-tones",
    title: "Guide tones",
    screens: [
      {
        title: "The 3rd and the 7th",
        text: "A chord's 3rd and 7th say what kind of chord it is. The drill asks for just those two notes of each chord, in turn, through as many keys as the Keys setting says. Each time it asks for the pair nearest the one before.",
        steps: info.map((x) => ({
          text: `${x.s}: the 3rd is ${flat(x.third)} and the 7th is ${flat(x.seventh)}.`,
          figure: keys(
            { [x.third]: `3 ${flat(x.third)}`, [x.seventh]: `7 ${flat(x.seventh)}` },
            span,
          ),
          sound: tones([x.third, x.seventh]),
        })),
      },
      {
        title: "The 7th falls to the next 3rd",
        text: `In a ii-V-I the 7th of each chord falls a half step to the 3rd of the next: ${flat(info[0].seventh)} to ${flat(info[1].third)}, then ${flat(info[1].seventh)} to ${flat(info[2].third)} in C. The 3rd of each chord stays put as the 7th of the next. In Check the keys stay dark, so find each pair from the chord before.`,
      },
    ],
  };
}

/** The bass as the symbol writes it: the note after the slash, else the root. */
const bassName = (symbol: string) =>
  symbol.includes("/") ? symbol.split("/")[1] : /^[A-G][b#]?/.exec(symbol)![0];

export function gospel(id: string): Lesson {
  const prog = GOSPEL_PROGRESSIONS.find((p) => p.id === id) ?? GOSPEL_PROGRESSIONS[0];
  const bars = gospelChords(0, prog.id, [55, 76]);
  const span = bars.flatMap((b) => [b.leftHand, ...b.rightHand]);
  const inv = ["root position", "first inversion", "second inversion", "third inversion"];
  return {
    id: `voicings.gospel.${prog.id}`,
    title: prog.label,
    screens: [
      {
        title: "Chords over a moving bass",
        text: `${prog.about} The note after a slash is the bass; with no slash the bass is the root. In C, tap Next for each chord.`,
        steps: bars.map((b) => ({
          text: `${b.symbol}: the bass is ${bassName(b.symbol)} and the other notes are in ${inv[b.inversion] ?? "an inversion"}.`,
          figure: keys(
            Object.fromEntries([[b.leftHand, "bass"], ...b.rightHand.map((m) => [m, "R"])]),
            span,
          ),
          sound: tones([b.leftHand, ...b.rightHand]),
        })),
      },
      {
        title: "The bass line",
        text: `In C the bass plays ${bars.map((b) => bassName(b.symbol)).join(" ")}. Follow it first, then fill in the chord above it. In Check the keys stay dark.`,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Scales: the thumb passing under

export function thumbUnder(): Lesson {
  const f = SCALE_FINGERINGS.major[0].rh;
  const low = 60;
  const notes = scaleSemitones("major")!.map((s) => low + s);
  const cross = f.findIndex((x, i) => i > 0 && x === 1);
  const fig = (n: number): LessonFigure =>
    keys(Object.fromEntries(notes.slice(0, n).map((m, i) => [m, String(f[i])])), notes);
  return {
    id: "scales.thumb-under",
    title: "The thumb passing under",
    screens: [
      {
        title: "Thumb under, finger over",
        text: "A scale is longer than five fingers reach, so the hand passes the thumb under. Going up with the right hand, the thumb passes under the 3rd or 4th finger. Going down, that finger crosses over the thumb.",
        steps: [
          {
            text: `In C major the right hand plays ${f.slice(0, cross).join(" ")}.`,
            figure: fig(cross),
            sound: run(notes.slice(0, cross)),
          },
          {
            text: `The thumb passes under finger ${f[cross - 1]} to play ${noteName(notes[cross], "flat", false)}.`,
            figure: fig(cross + 1),
            sound: run(notes.slice(cross - 1, cross + 1)),
          },
          {
            text: `Then ${f.slice(cross + 1).join(" ")} finish the octave.`,
            figure: fig(notes.length),
            sound: run(notes.slice(cross)),
          },
        ],
      },
      {
        title: "The left hand does the reverse",
        text: "Going up, the left hand's 3rd or 4th finger crosses over its thumb. Going down, its thumb passes under. The fingers are the same each time round, so learn where the crossing falls in each key.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Chord scales: minor tab, patterns

const MINOR_KEY = new Set(scaleSemitones("natural-minor")!.map((s) => pc(60 + s)));

export function chordScalesMinor(): Lesson {
  const ts = chordScaleTargets("minor", 0);
  const names = (t: (typeof ts)[number]) => t.midi.slice(0, 7).map(flat);
  const outside = (t: (typeof ts)[number]) =>
    [...new Set(t.midi.map(pc))].filter((p) => !MINOR_KEY.has(p)).map((p) => flat(60 + p));
  const fig = (t: (typeof ts)[number]): LessonFigure =>
    keys(
      Object.fromEntries(t.midi.map((m) => [m, flat(m)])),
      ts.flatMap((x) => x.midi),
    );
  return {
    id: "chord-scales.minor",
    title: "Scales for a minor ii-V-i",
    screens: [
      {
        title: "A scale for each chord",
        text: `Over each chord of a minor ii-V-i you play its go-to scale. In C minor, ${ts[0].symbol} takes ${ts[0].scaleLabel}, ${ts[1].symbol} takes ${ts[1].scaleLabel} and ${ts[2].symbol} takes ${ts[2].scaleLabel}. Tap Next for the notes of each.`,
        steps: ts.map((t) => ({
          text: `${t.symbol} takes ${t.scaleLabel}: ${names(t).join(" ")}. ${outside(t).length ? `${join(outside(t))} ${outside(t).length > 1 ? "are" : "is"} not in C natural minor.` : "All of it is in C natural minor."}`,
          figure: fig(t),
          sound: run(t.midi, 0.3),
        })),
      },
      {
        title: "Notes outside the key",
        text: "The altered V brings notes the key does not have, such as the B that leads up to C. The ii and the i stay close to the key. In Check the keys stay dark, so know each scale's notes.",
      },
    ],
  };
}

/** Both patterns as the drill plays them (up and back, the top note twice), 1-2-3-5 then 3-5-7-9. */
const lineSound = (symbol: string): LessonSound => {
  const notes = (["1235", "3579"] as ChordPattern[]).flatMap((p, k) =>
    chordPatternLine([symbol], p).map((n) => ({
      midi: [n.midi],
      at: k * 2.8 + n.startBeat * 0.6,
      dur: 0.5,
    })),
  );
  return { notes };
};

export function chordPatterns(): Lesson {
  const make = (changes: "major" | "minor") => chordScaleTargets(changes, 0);
  const step = (symbol: string): LessonStep => {
    const root = 60 + parseChordSymbol(symbol)!.rootPc;
    const line = (p: ChordPattern) => chordPattern(symbol, p).map((s) => root + s);
    const a = line("1235");
    const b = line("3579");
    return {
      text: `${symbol}: 1-2-3-5 is ${a.map(flat).join(" ")}, and 3-5-7-9 is ${b.map(flat).join(" ")}.`,
      figure: keys(Object.fromEntries([...a, ...b].map((m) => [m, flat(m)])), [...a, ...b]),
      sound: lineSound(symbol),
    };
  };
  return {
    id: "chord-scales.patterns",
    title: "1-2-3-5 and 3-5-7-9",
    screens: [
      {
        title: "Two note patterns",
        text: "On each chord you play a four-note pattern up and back. 1-2-3-5 starts on the root, and 3-5-7-9 starts on the 3rd. The 3rd, 5th and 7th are the chord's own, and the 2nd or 9th comes from its go-to scale.",
        steps: make("major").map((t) => step(t.symbol)),
      },
      {
        title: "On the minor changes",
        text: "The minor ii-V-i works the same way. On an altered chord the 5th is its flat 13th, and the 2nd or 9th is the flat 9th. In Check the keys stay dark, so know each pattern's notes.",
        steps: make("minor").map((t) => step(t.symbol)),
      },
    ],
  };
}

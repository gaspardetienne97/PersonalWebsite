// Tier 3 concept cards: 1 to 3 screens for drills that already show what to play in Practice, shown
// the first time the player switches to Check on that setup. Facts come from the theory and content
// code (scale formulas, CAGED forms, voicings), so a card cannot drift from what the drill plays.
// A drill passes the card that matches its current setup (see cards.test.ts for what each holds).

import { FRETBOARD_PATTERNS } from "../data";
import {
  COMPING_PATTERNS,
  chordScaleTargets,
  cadenceChords,
  closestChords,
  voicingTargets,
} from "../content/piano";
import { baseOffset } from "../content/technique";
import { parseChordSymbol } from "../theory/chords";
import { noteName, pc } from "../theory/notes";
import { tuningById } from "../theory/fretboard";
import { scaleSemitones } from "../theory/scales";
import { chordTones, keys } from "./tier1";
import type { Lesson, LessonFigure, LessonScreen, LessonSound, LessonStep } from "./types";

const join = (a: string[]) =>
  a.length < 2 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`;
const flat = (m: number) => noteName(m, "flat", false);
const sharp = (m: number) => noteName(m, "sharp", false);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const tones = (ms: number[], at = 0, dur = 1.4): LessonSound => ({
  notes: [{ midi: ms, at, dur }],
});
/** The notes one after another. */
const run = (ms: number[], gap = 0.35): LessonSound => ({
  notes: ms.map((m, i) => ({ midi: [m], at: i * gap, dur: gap * 1.4 })),
});

// ---------------------------------------------------------------------------
// Scales

/** A scale's steps as the formula writes them: W, H, or the step and a half of the harmonic minor. */
export function scaleFormula(kind: string): string[] {
  const s = scaleSemitones(kind)!;
  return s.slice(1).map((x, i) => ({ 1: "H", 2: "W", 3: "1.5" })[x - s[i]] ?? String(x - s[i]));
}
const words = (f: string) =>
  f === "W" ? "a whole step" : f === "H" ? "a half step" : "a step and a half";

function majorFormula(): Lesson {
  const semis = scaleSemitones("major")!;
  const formula = scaleFormula("major");
  const notes = semis.map((s) => 60 + s);
  const names = notes.map(flat);
  const fig = (n: number): LessonFigure =>
    keys(Object.fromEntries(notes.slice(0, n).map((m) => [m, flat(m)])), notes);
  const halves = formula.flatMap((f, i) => (f === "H" ? [i] : []));
  return {
    id: "scales.major-formula",
    title: "The major scale formula",
    screens: [
      {
        title: "Whole steps and half steps",
        text: `Every major scale follows one pattern of whole steps (W) and half steps (H): ${formula.join(" ")}. Start on any note and follow it. Tap Next to build C major.`,
        steps: formula.map((f, i) => ({
          text: `${names[i]} to ${names[i + 1]} is ${words(f)}: ${f}.`,
          figure: fig(i + 2),
          sound: run([notes[i], notes[i + 1]], 0.5),
        })),
      },
      {
        title: "Find it in Check",
        text: `Check hides the notes, so the formula is your map. In any major scale the half steps fall between ${halves.map((i) => `notes ${i + 1} and ${i + 2}`).join(", and between ")}. In C that is ${join(halves.map((i) => `${names[i]} to ${names[i + 1]}`))}.`,
        figure: keys(
          Object.fromEntries(
            halves.flatMap((i) => [
              [notes[i], names[i]],
              [notes[i + 1], names[i + 1]],
            ]),
          ),
          notes,
        ),
      },
    ],
  };
}

function minorForms(): Lesson {
  const base = 57; // A3: the natural minor has no sharps or flats
  const at = (kind: string) => scaleSemitones(kind)!.map((s) => base + s);
  const natural = at("natural-minor");
  const fig = (ms: number[]): LessonFigure =>
    keys(Object.fromEntries(ms.map((m) => [m, sharp(m)])), natural);
  const changed = (kind: string) =>
    at(kind)
      .slice(0, 7)
      .filter((m) => !natural.includes(m))
      .map(sharp);
  const form = (kind: string) => scaleFormula(kind).join(" ");
  return {
    id: "scales.minor-forms",
    title: "The three minor scales",
    screens: [
      {
        title: "Natural minor",
        text: `Natural minor follows ${form("natural-minor")}. The other two minor scales change its top notes. Harmonic minor raises the 7th by a half step, which leaves a step and a half under it.`,
        figure: fig(natural),
        sound: run(natural),
      },
      {
        title: "Three forms in A",
        text: `Tap each form to hear it. Harmonic minor is ${form("harmonic-minor")}, with ${join(changed("harmonic-minor"))} in A. Melodic minor, as the drill plays it, raises the 6th and 7th both ways: ${form("melodic-minor")}, with ${join(changed("melodic-minor"))} in A.`,
        options: ["natural-minor", "harmonic-minor", "melodic-minor"].map((k) => ({
          label: {
            "natural-minor": "Natural",
            "harmonic-minor": "Harmonic",
            "melodic-minor": "Melodic",
          }[k]!,
          sound: run(at(k)),
          figure: fig(at(k)),
        })),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Positions

const strings = (p: { offsets: { stringNumber: number }[] }) => {
  const s = p.offsets.map((o) => o.stringNumber);
  return [Math.max(...s), Math.min(...s)];
};
const place = (off: number) =>
  off === 0 ? "at the root fret" : `${plural(off, "fret")} above the root fret`;

/** The CAGED forms from the data, lowest on the neck first. */
export const cagedForms = () =>
  FRETBOARD_PATTERNS.filter((p) => p.family === "caged-major")
    .map((p) => ({
      letter: p.id.split("-")[2].toUpperCase(),
      base: baseOffset(p),
      strings: strings(p),
    }))
    .sort((a, b) => a.base - b.base);
/** The pentatonic boxes from the data, lowest on the neck first. */
export const boxes = () =>
  FRETBOARD_PATTERNS.filter((p) => p.family === "minor-pentatonic")
    .map((p) => ({ ...p, base: baseOffset(p) }))
    .sort((a, b) => a.base - b.base);

function caged(): Lesson {
  const forms = cagedForms();
  return {
    id: "positions.caged",
    title: "The five CAGED shapes",
    screens: [
      {
        title: "Five shapes for one chord",
        text: "CAGED names five shapes for a major chord, after the open chords C, A, G, E and D. The same chord can be played with each of them, in five places along the neck. Tap Next for where each sits, counted from the root fret on string 6 in standard tuning.",
        steps: forms.map((f) => ({
          text: `The ${f.letter} shape uses strings ${f.strings[0]} to ${f.strings[1]}, and its lowest fret is ${place(f.base)}.`,
        })),
      },
      {
        title: "Find it in Check",
        text: "Check hides the notes of the shape. Know which shape it is, which strings it uses and where it sits, then play it from its lowest string up.",
      },
    ],
  };
}

function pentatonicBoxes(): Lesson {
  const std = tuningById("guitar.standard")!;
  const bx = boxes();
  const box1 = bx[0];
  // Box 1 with the root fret at 0: the open strings, so E minor pentatonic, inside frets 0 to 3.
  const marks = [...box1.offsets]
    .sort((a, b) => b.stringNumber - a.stringNumber || a.fretOffset - b.fretOffset)
    .map((o) => ({
      string: o.stringNumber,
      fret: o.fretOffset,
      midi: std.openStrings[o.stringNumber - 1] + o.fretOffset,
    }));
  return {
    id: "positions.boxes",
    title: "The five pentatonic boxes",
    screens: [
      {
        title: "A box is a hand position",
        text: "A box of the minor pentatonic is one hand position with two notes on each of the six strings. Here is box 1 of E minor pentatonic, from the open strings. The drill plays a box from the low string to the high.",
        figure: {
          kind: "fretboard",
          instrument: "guitar",
          marks: marks.map((m) => ({ string: m.string, fret: m.fret, label: sharp(m.midi) })),
        },
        sound: run(
          marks.map((m) => m.midi),
          0.25,
        ),
      },
      {
        title: "Five boxes up the neck",
        text: `The five boxes climb the neck. Counted from the root fret on string 6 in standard tuning, the lowest fret of ${join(bx.map((b, i) => `box ${i + 1} is ${b.base}`))}. In Check the notes stay hidden, so know where each box starts.`,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Comping

/** A beat as a player counts it: 0 is "1", 1.5 is "2 and". */
const at = (b: number) => (b % 1 ? `on the and of ${Math.floor(b) + 1}` : `on ${b + 1}`);
const count = (b: number) => `${Math.floor(b) + 1}${b % 1 ? " and" : ""}`;

function charleston(): Lesson {
  const p = COMPING_PATTERNS[0];
  const hits = p.compRhythm;
  const names = p.shellMidi.map(flat);
  return {
    id: "comping.charleston",
    title: "The Charleston rhythm",
    screens: [
      {
        title: "Two hits in a bar",
        text: `The Charleston is two left-hand hits in a bar: ${join(hits.map((h) => `one ${at(h.beat)}, ${h.durationBeats === 1 ? "held for a beat" : h.durationBeats < 1 ? "short" : `held for ${h.durationBeats} beats`}`))}. Each hit is the left hand's two notes together, such as ${names[0]} and ${names[1]} over ${p.chord}. Then the hand rests until the next bar.`,
        figure: {
          kind: "rhythm",
          bars: 1,
          perBeat: 2,
          beatsPerBar: 4,
          onsets: hits.map((h) => h.beat),
        },
        sound: {
          notes: hits.map((h) => ({
            midi: [...p.shellMidi],
            at: h.beat * 0.5,
            dur: h.durationBeats * 0.5,
          })),
        },
      },
      {
        title: "Count it in Check",
        text: `Check hides what to play, so count it yourself: ${hits.map((h) => count(h.beat)).join(", ")}, and nothing else in the bar. Leaving the other beats empty is what lets the right hand's line stand out.`,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Voicings

/** The key of C's targets from the voicing data, grouped by chord. */
const inC = (variant: "major", start: "A" | "B" = "A") =>
  voicingTargets({ variant, startPosition: start, mode: "chord" }).filter((t) =>
    t.id.startsWith("C-"),
  );

/** A chord note's name in the chord's own terms: 1, 3, 5, 7 from its symbol, 9 for the step above the root. */
export function degreeOf(symbol: string, midi: number): string {
  const c = parseChordSymbol(symbol)!;
  const i = pc(midi - c.rootPc);
  return i === 2 ? "9" : ["1", "3", "5", "7"][c.intervals.indexOf(i)];
}
/** "3 5 7 9" or "7 9 3 5": the right hand from the bottom. */
export const degreesOf = (symbol: string, right: number[]) =>
  [...right]
    .sort((a, b) => a - b)
    .map((m) => degreeOf(symbol, m))
    .join(" ");

function rootless(): Lesson {
  const ts = inC("major");
  const shape = (t: (typeof ts)[number]) => {
    const rh = t.displayMidi.slice(1);
    const d = degreesOf(t.symbol, rh);
    return { t, rh, d, pos: d === "3 5 7 9" ? "A" : d === "7 9 3 5" ? "B" : "?" };
  };
  const ex = ts.map(shape);
  const fig = (x: (typeof ex)[number]): LessonFigure =>
    keys(
      Object.fromEntries([
        [x.t.displayMidi[0], "root"],
        ...[...x.rh].sort((a, b) => a - b).map((m) => [m, degreeOf(x.t.symbol, m)]),
      ]),
      ex.flatMap((y) => y.t.displayMidi),
    );
  return {
    id: "voicings.rootless",
    title: "Rootless voicings",
    screens: [
      {
        title: "Leave the root out",
        text: "A rootless voicing leaves the chord's root to the bass. Here the left hand plays the root alone and the right hand plays four chord notes above it. Position A puts the 3rd lowest and position B the 7th, so they read 3 5 7 9 and 7 9 3 5.",
      },
      {
        title: "A ii-V-I in C",
        text: "Tap Next for each chord. The drill can start on position B instead, which swaps A and B.",
        steps: ex.map((x) => ({
          text: `${x.t.symbol}: position ${x.pos}, ${x.d} in the right hand (${[...x.rh]
            .sort((a, b) => a - b)
            .map(flat)
            .join(" ")}) over ${flat(x.t.displayMidi[0])} in the left.`,
          figure: fig(x),
          sound: tones(x.t.displayMidi),
        })),
      },
      {
        title: "The voices barely move",
        text: "Between one chord and the next in the same key, each right-hand note moves a whole step at most, counting note names and ignoring which octave the keys show. Some do not move at all. In Check the keys stay dark, so work out each chord's notes from its position.",
      },
    ],
  };
}

const INVERSION = ["root position", "first inversion", "second inversion"];
const bars = (key = 0) => closestChords(key, [55, 76]);

function inversions(): Lesson {
  const bs = bars();
  const stay = (i: number) => bs[i].rightHand.filter((m) => bs[i - 1].rightHand.includes(m));
  const fig = (i: number): LessonFigure =>
    keys(
      Object.fromEntries([[bs[i].leftHand, "root"], ...bs[i].rightHand.map((m) => [m, flat(m)])]),
      bs.flatMap((b) => [b.leftHand, ...b.rightHand]),
    );
  const steps: LessonStep[] = bs.map((b, i) => {
    const kept = i ? stay(i) : [];
    return {
      text: `${b.symbol}: ${INVERSION[b.inversion]}, ${b.rightHand.map(flat).join(" ")}${i ? `, moving ${plural(b.movement, "half step")} in all. ${kept.length ? `${join(kept.map(flat))} ${kept.length > 1 ? "stay" : "stays"} where ${kept.length > 1 ? "they were" : "it was"}` : "No note stays"}.` : ", over its root in the left hand."}`,
      figure: fig(i),
      sound: tones([b.leftHand, ...b.rightHand]),
    };
  });
  return {
    id: "voicings.inversions",
    title: "Closest chords",
    screens: [
      {
        title: "Move as little as you can",
        text: "I IV V I in one key: a triad in the right hand over its root in the left. Aim to move the right hand as little as you can from the chord before, keeping the notes the two chords share. In some keys the range of the keyboard forces a bigger move.",
      },
      {
        title: "I IV V I in C",
        text: "Tap Next for each chord and what carries over.",
        steps,
      },
      {
        title: "Find it in Check",
        text: "Check hides the keys, so work forward from the chord before. Ask which note stays, then where the others go.",
      },
    ],
  };
}

function cadence(minor: boolean): Lesson {
  const bs = cadenceChords(0, minor, [55, 76]);
  const tonic = minor ? "C minor" : "C major";
  const fig = (i: number): LessonFigure =>
    keys(
      Object.fromEntries([[bs[i].leftHand, "root"], ...bs[i].rightHand.map((m) => [m, flat(m)])]),
      bs.flatMap((b) => [b.leftHand, ...b.rightHand]),
    );
  const steps: LessonStep[] = bs.map((b, i) => ({
    text: `${b.roman} is ${b.symbol}: ${INVERSION[b.inversion] ?? "third inversion"}, ${b.rightHand.map(flat).join(" ")}.${b.roman === "V7" ? " Root, 3rd and 7th, with the 5th left out." : ""}`,
    figure: fig(i),
    sound: tones([b.leftHand, ...b.rightHand]),
  }));
  const raised = (scaleSemitones("harmonic-minor")![6] + 60) % 12;
  const natural = (scaleSemitones("natural-minor")![6] + 60) % 12;
  const letters = (m: number) => flat(m);
  return {
    id: minor ? "voicings.cadence-minor" : "voicings.cadence",
    title: minor ? "Minor cadences" : "Cadences",
    screens: [
      {
        title: "Roman numerals",
        text: minor
          ? `A Roman numeral names a chord by the scale degree its root sits on: i is the chord on the 1st note, iv on the 4th and V on the 5th. Small letters mean a minor chord and capitals a major one. Here are i iv i V7 i in ${tonic}.`
          : `A Roman numeral names a chord by the scale degree its root sits on: I is the chord on the 1st note, IV on the 4th and V on the 5th. Capitals mean a major chord. Here are I IV I V7 I in ${tonic}.`,
        steps,
      },
      minor
        ? {
            title: "The raised 7th",
            text: `The V7 chord needs the 7th note raised by a half step: ${letters(60 + raised)} instead of ${letters(60 + natural)} in ${tonic}. That raised note is the 3rd of V7 and leads up to the tonic. Tap each to hear it.`,
            options: [
              {
                label: `Natural 7th, ${letters(60 + natural)}`,
                sound: run([60 + natural - 12, 60], 0.5),
              },
              {
                label: `Raised 7th, ${letters(60 + raised)}`,
                sound: run([60 + raised - 12, 60], 0.5),
              },
            ],
          }
        : {
            title: "V7 pulls home",
            text: "The 7th of V7 falls a half step to the 3rd of the tonic chord, and the 3rd of V7 rises a half step to the tonic. That pull is what to listen for in Check, where the keys stay dark.",
          },
    ],
  };
}

// ---------------------------------------------------------------------------
// Accompany

function chordSymbols(): Lesson {
  const sym = (s: string, gloss: string): LessonStep => {
    const t = chordTones(s);
    return {
      text: `${s} is ${join(t.map((x) => x.name))}. ${gloss}`,
      figure: keys(
        Object.fromEntries(t.map((x) => [x.midi, x.name])),
        chordTones("Cmaj7").map((x) => x.midi),
      ),
      sound: tones(t.map((x) => x.midi)),
    };
  };
  return {
    id: "accompany.chord-symbols",
    title: "Reading chord symbols",
    screens: [
      {
        title: "Root, then the kind",
        text: "A chord symbol starts with the root note. What follows says which chord it is. Tap Next to build the chords on C.",
        steps: [
          sym("C", "A root alone means a major triad."),
          sym("Cm", "The m makes the 3rd minor."),
          sym("C7", "A 7 adds the flat 7th."),
          sym("Cmaj7", "Maj7 adds the major 7th."),
        ],
      },
      {
        title: "Slashes and numbers",
        text: "A note after a slash is the lowest note: C/E is a C chord with E in the bass. A number such as 9 or 13 adds that tone to a seventh chord. You choose how to place the notes.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Chord scales

function whyDorian(): Lesson {
  const ts = chordScaleTargets("major", 0);
  const key = new Set(scaleSemitones("major")!.map((s) => pc(60 + s)));
  const names = (t: (typeof ts)[number]) => t.midi.slice(0, 7).map(sharp);
  const outside = (t: (typeof ts)[number]) =>
    [...new Set(t.midi.map(pc))].filter((p) => !key.has(p)).map((p) => sharp(60 + p));
  const fig = (t: (typeof ts)[number]): LessonFigure =>
    keys(
      Object.fromEntries(t.midi.map((m) => [m, sharp(m)])),
      ts.flatMap((x) => x.midi),
    );
  return {
    id: "chord-scales.why",
    title: "Why ii is Dorian",
    screens: [
      {
        title: "A scale for each chord",
        text: `Over each chord of a ii-V-I you play its go-to scale. In C, ${ts[0].symbol} takes ${ts[0].scaleLabel}: ${names(ts[0]).join(" ")}. Those are the notes of C major, started on D, so nothing clashes with the key.`,
        figure: fig(ts[0]),
        sound: run(ts[0].midi, 0.3),
      },
      {
        title: "All three chords",
        text: "The scale starts from a different note for each chord. Tap Next for each chord and whether its scale stays inside the key.",
        steps: ts.map((t) => ({
          text: `${t.symbol} takes ${t.scaleLabel}: ${names(t).join(" ")}. ${outside(t).length ? `${join(outside(t))} is not in C major.` : "All of it is in C major."}`,
          figure: fig(t),
          sound: run(t.midi, 0.3),
        })),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Technique tips (true for guitar and ukulele alike where both apply)

const tip = (id: string, title: string, screens: LessonScreen[]): Lesson => ({
  id,
  title,
  screens,
});

const TIPS: Record<string, () => Lesson> = {
  "tips.strum": () =>
    tip("tips.strum", "Strumming to be heard", [
      {
        title: "Fret first, then strum",
        text: "Put every finger down before you strum, so all the strings are ready. Strum once, in one smooth downward motion across the strings the shape uses. Let it ring until the app has named it.",
      },
      {
        title: "If a note is missing",
        text: "A string that is dead or buzzing usually has a finger resting on it, or pressing away from the fret. Press with the tip of the finger, close behind the fret. The app checks each chord tone, so a muted string can show up as a missing one.",
      },
    ]),
  "tips.chords": () =>
    tip("tips.chords", "Fretting a clean chord", [
      {
        title: "Shape the hand",
        text: "Press with the tips of your fingers, close behind the fret. Keep the fingers arched so none of them touches the string next to its own.",
      },
      {
        title: "Listen to each string",
        text: "Sound the strings one at a time and listen: each should ring clearly, not buzz or fade. If one is dead, adjust the finger that should be pressing it, then play the shape again.",
      },
    ]),
  "tips.changes": () =>
    tip("tips.changes", "Changing chords", [
      {
        title: "Move as one shape",
        text: "Lift all your fingers together and put them down together, rather than one at a time. Picture the next shape before the change. Go slowly enough that every change lands on the beat, then speed up.",
      },
      {
        title: "Look for a guide finger",
        text: "Some pairs of chords let a finger stay on its string or slide along it. Use that finger to guide the rest. Other pairs have none, so there you move every finger together.",
      },
    ]),
  "tips.spider": () =>
    tip("tips.spider", "Spider technique", [
      {
        title: "One finger a fret",
        text: "Each finger has its own fret: the index the first, the middle the second, the ring the third and the little finger the fourth. The pattern says which finger plays next. Keep the hand where it is and move only the fingers.",
      },
      {
        title: "Even and relaxed",
        text: "Press just hard enough for a clear note, and lift a finger only as far as it needs. Aim for each note the same length and loudness, one a click. Start at a tempo where it feels easy, then raise it.",
      },
    ]),
  "tips.two-hand": () =>
    tip("tips.two-hand", "Keeping two hands together", [
      {
        title: "One hand at a time",
        text: "The Practise setting can ask for Left only or Right only. Learn each part that way first, then play Both hands.",
      },
      {
        title: "Share one count",
        text: "Both hands follow the same click, so count the beats out loud. Where both hands play on the same beat, aim to land them together.",
      },
    ]),
};

const CARDS: Record<string, () => Lesson> = {
  "scales.major-formula": majorFormula,
  "scales.minor-forms": minorForms,
  "positions.caged": caged,
  "positions.boxes": pentatonicBoxes,
  "comping.charleston": charleston,
  "voicings.rootless": rootless,
  "voicings.inversions": inversions,
  "voicings.cadence": () => cadence(false),
  "voicings.cadence-minor": () => cadence(true),
  "accompany.chord-symbols": chordSymbols,
  "chord-scales.why": whyDorian,
  ...TIPS,
};

export const CARD_IDS = Object.keys(CARDS);

/** A tier 3 concept card by id, as the lessons a drill passes with `trigger: "check"`; none for an unknown id. */
export function conceptCard(id: string): Lesson[] {
  const make = CARDS[id];
  return make ? [make()] : [];
}

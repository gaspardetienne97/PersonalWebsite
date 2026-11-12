// Tier 3 concept cards: 1 to 3 screens for drills that already show what to play in Practice, shown
// the first time the player switches to Check on that setup. Facts come from the theory and content
// code (scale formulas, CAGED forms, voicings), so a card cannot drift from what the drill plays.
// A drill passes the card that matches its current setup (see cards.test.ts for what each holds).

import {
  COMPING_PATTERNS,
  GOSPEL_PROGRESSIONS,
  chordScaleTargets,
  cadenceChords,
  closestChords,
} from "../content/piano";
import { pc } from "../theory/notes";
import { scaleSemitones } from "../theory/scales";
import { SCALE_FINGERINGS } from "../content/piano-fingering";
import {
  bbBox,
  caged,
  connectedBoxes,
  pentatonicBoxes,
  triadIds,
  triads,
  ukuleBoxes,
} from "./cards-guitar";
import {
  alteredVoicings,
  chordPatterns,
  chordScalesMinor,
  gospel,
  guideTones,
  minorVoicings,
  thumbUnder,
} from "./cards-piano";
import { chordTones, keys } from "./tier1";
import {
  degreeOf,
  voicingInC,
  flat,
  join,
  plural,
  run,
  sharp,
  tones,
  type CardOpts,
} from "./card-kit";
import { positionLine } from "../theory/fretboard";
import type { Lesson, LessonFigure, LessonScreen, LessonStep } from "./types";

// ---------------------------------------------------------------------------
// Scales

/** A scale's steps as the formula writes them: W, H, or the step and a half of the harmonic minor. */
export function scaleFormula(kind: string): string[] {
  const s = scaleSemitones(kind)!;
  return s.slice(1).map((x, i) => ({ 1: "H", 2: "W", 3: "1.5" })[x - s[i]] ?? String(x - s[i]));
}

/**
 * The major formula drawn one step at a time: C4 to C5 on the keys (or, on a fretted
 * instrument, in the one position the scales drill plays it, across the strings). Each
 * Next adds the step's W or H on the note it reaches, so the last step reads the formula.
 */
function majorFormula(o: CardOpts = {}): Lesson {
  const semis = scaleSemitones("major")!;
  const formula = scaleFormula("major");
  const names = semis.map((s) => flat(60 + s));
  const t = o.tuning;
  const notes = semis.map((x) => 60 + x);
  // On frets: the drill's own position for the line (positionLine, as InstrumentStage places it).
  const at = t ? positionLine(t, notes) : [];
  const placed = t && at.every(Boolean);
  const frets = at.flatMap((p) => (p ? [p.fret] : []));
  /** The octave with a label on each scale note (null leaves it unmarked). */
  const draw = (labels: (string | null)[]): LessonFigure =>
    t && placed
      ? {
          kind: "fretboard",
          instrument: t.instrument,
          openStrings: [...t.openStrings],
          from: Math.max(0, Math.min(...frets) - 1),
          to: Math.max(...frets) + 1,
          marks: at.flatMap((p, i) =>
            labels[i] === null ? [] : [{ string: p!.string, fret: p!.fret, label: labels[i]! }],
          ),
        }
      : keys(
          Object.fromEntries(
            notes.flatMap((m, i) => (labels[i] === null ? [] : [[m, labels[i]!]])),
          ),
          notes,
        );
  /** After `n` steps: the root named, the steps taken as W or H on the note they reach, the rest by name. */
  const fig = (n: number) => draw(names.map((nm, i) => (i > 0 && i <= n ? formula[i - 1] : nm)));
  const halves = formula.flatMap((f, i) => (f === "H" ? [i] : []));
  const gap = (f: string) =>
    placed
      ? f === "W"
        ? "a whole step, 2 frets on one string"
        : "a half step, the next fret on one string"
      : f === "W"
        ? "one key skipped"
        : "the very next key";
  return {
    id: t ? `scales.major-formula.${t.instrument}` : "scales.major-formula",
    title: "The major scale formula",
    screens: [
      {
        title: "Whole steps and half steps",
        text: `Every major scale follows one pattern of whole steps (W) and half steps (H): ${formula.join(" ")}. Tap Next to build C major one step at a time.`,
        figure: fig(0),
        sound: run(notes),
        steps: formula.map((f, i) => ({
          text: `${names[i]} to ${names[i + 1]}: ${f}, ${gap(f)}.`,
          figure: fig(i + 1),
          sound: run([notes[i], notes[i + 1]], 0.5),
        })),
      },
      {
        title: "Find it in Check",
        text: `Check hides the notes, so the formula is your map. In any major scale the half steps fall between ${halves.map((i) => `notes ${i + 1} and ${i + 2}`).join(", and between ")}. In C that's ${join(halves.map((i) => `${names[i]} to ${names[i + 1]}`))}.`,
        figure: draw(
          names.map((nm, i) => (halves.some((h) => i === h || i === h + 1) ? nm : null)),
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

/** "3 5 7 9" or "7 9 3 5": the right hand from the bottom. */
export const degreesOf = (symbol: string, right: number[]) =>
  [...right]
    .sort((a, b) => a - b)
    .map((m) => degreeOf(symbol, m))
    .join(" ");

function rootless(o: CardOpts): Lesson {
  const arp = !!o.arpeggio;
  const ts = voicingInC("major");
  const shape = (t: (typeof ts)[number]) => {
    const rh = t.displayMidi.slice(1);
    const d = degreesOf(t.symbol, rh);
    return { t, rh, d, pos: d === "3 5 7 9" ? "A" : d === "7 9 3 5" ? "B" : "?" };
  };
  const ex = ts.map(shape);
  const b0 = shape(voicingInC("major", "B")[0]);
  const hear = (ms: number[]) => (arp ? run(ms) : tones(ms));
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
        figure: fig(ex[0]),
        sound: hear(ex[0].t.displayMidi),
        text: `A rootless voicing leaves the root to the bass: ${arp ? "you play the root, then four chord notes above it, one at a time" : "the left hand plays the root, the right hand four chord notes above it"}. Tap Position A (the 3rd lowest) or Position B (the 7th lowest) to see and hear each on ${ex[0].t.symbol}.`,
        // The same chord in both positions, one keyboard each.
        options: [ex[0], b0].map((x) => ({
          label: `Position ${x.pos}: ${x.d}`,
          sound: hear(x.t.displayMidi),
          figure: keys(
            Object.fromEntries([
              [x.t.displayMidi[0], "root"],
              ...[...x.rh].sort((a, c) => a - c).map((m) => [m, degreeOf(x.t.symbol, m)]),
            ]),
            [ex[0], b0].flatMap((y) => y.t.displayMidi),
          ),
        })),
      },
      {
        title: "A ii-V-I in C",
        text: "Tap Next for each chord. The drill can start on position B instead, which swaps A and B.",
        steps: ex.map((x) => ({
          text: `${x.t.symbol}: position ${x.pos}, ${x.d} (${[...x.rh]
            .sort((a, b) => a - b)
            .map(flat)
            .join(
              " ",
            )}) ${arp ? "above" : "in the right hand over"} ${flat(x.t.displayMidi[0])}${arp ? "" : " in the left"}.`,
          figure: fig(x),
          sound: tones(x.t.displayMidi),
        })),
      },
      {
        title: "The voices barely move",
        text: `Between one chord and the next in the same key, each of the four upper notes moves a whole step at most, counting note names and ignoring which octave the keys show. Some don't move at all. In Check the keys stay dark, so work out each chord's notes from its position.`,
      },
    ],
  };
}

const INVERSION = ["root position", "first inversion", "second inversion"];
const bars = (key = 0) => closestChords(key, [55, 76]);

function inversions(o: CardOpts): Lesson {
  const arp = !!o.arpeggio;
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
      text: `${b.symbol}: ${INVERSION[b.inversion]}, ${b.rightHand.map(flat).join(" ")}${i ? `, moving ${plural(b.movement, "half step")} in all. ${kept.length ? `${join(kept.map(flat))} ${kept.length > 1 ? "stay" : "stays"} where ${kept.length > 1 ? "they were" : "it was"}` : "No note stays"}.` : arp ? ", above its root." : ", over its root in the left hand."}`,
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
        figure: fig(1),
        text: `I IV V I in one key: a triad ${arp ? "played one note at a time, above its root" : "in the right hand over its root in the left"}. Aim to move the notes as little as you can from the chord before, keeping the notes the two chords share. In some keys ${arp ? "the range the drill uses" : "the range of the keyboard"} forces a bigger move.`,
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
            text: `The V7 chord needs the 7th note raised by a half step: ${flat(60 + raised)} instead of ${flat(60 + natural)} in ${tonic}. That raised note is the 3rd of V7 and leads up to the tonic. Tap each to hear it.`,
            options: [
              {
                label: `Natural 7th, ${flat(60 + natural)}`,
                sound: run([60 + natural - 12, 60], 0.5),
              },
              {
                label: `Raised 7th, ${flat(60 + raised)}`,
                sound: run([60 + raised - 12, 60], 0.5),
              },
            ],
          }
        : {
            title: "V7 pulls home",
            text: "The 7th of V7 falls a half step to the 3rd of the tonic chord. The 3rd of V7 rises a half step to the tonic. That pull is what to listen for in Check, where the keys stay dark.",
          },
    ],
  };
}

// ---------------------------------------------------------------------------
// Accompany

/** The chord kinds the lead-sheet charts use, each with what its suffix adds (cards.test.ts checks the charts use no other). */
export const SYMBOL_KINDS: { suffix: string; gloss: (names: Record<string, string>) => string }[] =
  [
    { suffix: "", gloss: () => "A root alone means a major triad." },
    { suffix: "m", gloss: () => "The m makes the 3rd minor." },
    { suffix: "7", gloss: () => "A 7 adds the flat 7th." },
    { suffix: "m7", gloss: () => "Minor, with the flat 7th added." },
    { suffix: "maj7", gloss: () => "Maj7 adds the major 7th." },
    {
      suffix: "m7b5",
      gloss: () => "Minor with a flat 5th and a flat 7th, also called half-diminished.",
    },
    {
      suffix: "7alt",
      gloss: (n) =>
        `Alt is a dominant with altered tones in place of the 5th: ${n.b9}, ${n["#9"]}, ${n["#11"]} and ${n.b13}.`,
    },
    { suffix: "add9", gloss: (n) => `Add9 adds the 9th, ${n["9"]}, with no 7th.` },
    { suffix: "sus2", gloss: (n) => `Sus2 swaps the 3rd for the 2nd, ${n["2"]}.` },
    { suffix: "sus4", gloss: (n) => `Sus4 swaps the 3rd for the 4th, ${n["4"]}.` },
  ];

function chordSymbols(): Lesson {
  const all = SYMBOL_KINDS.map((k) => chordTones(`C${k.suffix}`));
  const span = all.flat().map((x) => x.midi);
  const steps = SYMBOL_KINDS.map((k, i): LessonStep => {
    const t = all[i];
    const names = Object.fromEntries(t.map((x) => [x.label, x.name]));
    return {
      text: `C${k.suffix} is ${join(t.map((x) => x.name))}. ${k.gloss(names)}`,
      figure: keys(Object.fromEntries(t.map((x) => [x.midi, x.name])), span),
      sound: tones(t.map((x) => x.midi)),
    };
  });
  return {
    id: "accompany.chord-symbols",
    title: "Reading chord symbols",
    screens: [
      {
        title: "Root, then the kind",
        text: "A chord symbol starts with the root note. What follows says which chord it is. Tap Next to build each kind on C.",
        steps,
      },
      {
        title: "Slashes",
        text: "A note after a slash is the lowest note. C/E is a C chord with E in the bass, and Am/G is A minor with G in the bass. You choose how to place the notes.",
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
          text: `${t.symbol} takes ${t.scaleLabel}: ${names(t).join(" ")}. ${outside(t).length ? `${join(outside(t))} isn't in C major.` : "It's all in C major."}`,
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

/** The strip's instrument, from its tuning (guitar when the drill passes none). */
const fretted = (o: CardOpts): "guitar" | "ukulele" => o.tuning?.instrument ?? "guitar";
/**
 * Open C, fingertips just behind the frets: the shape the chord tips draw. Guitar: x32010.
 * Ukulele: the ring finger on string 1, fret 3. Drawn on the standard tuning: it is a hand shape.
 */
const cShape = (o: CardOpts): LessonFigure =>
  fretted(o) === "ukulele"
    ? { kind: "fretboard", instrument: "ukulele", marks: [{ string: 1, fret: 3, label: "3" }] }
    : {
        kind: "fretboard",
        instrument: "guitar",
        marks: [
          { string: 5, fret: 3, label: "3" },
          { string: 4, fret: 2, label: "2" },
          { string: 2, fret: 1, label: "1" },
        ],
      };
/** Open C as it sounds, low string first (ukulele high G: G C E C). */
const cChord = (o: CardOpts) =>
  fretted(o) === "ukulele" ? [67, 60, 64, 72] : [48, 52, 55, 60, 64];
/** One finger a fret: index to little finger on frets 1 to 4 of the top string as you hold it (guitar 6, ukulele 4). */
const spiderString = (o: CardOpts) => (fretted(o) === "ukulele" ? 4 : 6);
const spider = (o: CardOpts): LessonFigure => ({
  kind: "fretboard",
  instrument: fretted(o),
  marks: [1, 2, 3, 4].map((f) => ({ string: spiderString(o), fret: f, label: String(f) })),
});
/** The spider's four notes: frets 1 to 4 above the open string (guitar E2, ukulele high G4). */
const spiderRun = (o: CardOpts) =>
  [1, 2, 3, 4].map((f) => (fretted(o) === "ukulele" ? 67 : 40) + f);

const TIPS: Record<string, (o: CardOpts) => Lesson> = {
  "tips.strum": (o) =>
    tip("tips.strum", "Strumming to be heard", [
      {
        title: "Fret first, then strum",
        figure: cShape(o),
        sound: tones(cChord(o), 0, 1.6),
        text: "Put every finger down before you strum, so all the strings are ready. Strum once, in one smooth downward motion across the strings the shape uses. Let it ring until the app has named it.",
      },
      {
        title: "If a note is missing",
        text: "A dead or buzzing string usually has a finger resting on it, or pressing away from the fret. Press with the tip of the finger, close behind the fret. The app checks each chord tone, so a muted string can show up as a missing one.",
      },
    ]),
  "tips.chords": (o) =>
    tip("tips.chords", "Fretting a clean chord", [
      {
        title: "Shape the hand",
        figure: cShape(o),
        sound: tones(cChord(o), 0, 1.6),
        text: "Press with the tips of your fingers, close behind the fret. Keep the fingers arched so none of them touches the string next to its own.",
      },
      {
        title: "Listen to each string",
        text: "Sound the strings one at a time and listen: each should ring clearly, not buzz or fade. If one is dead, adjust the finger that should be pressing it, then play the shape again.",
      },
    ]),
  "tips.changes": (o) =>
    tip("tips.changes", "Changing chords", [
      {
        title: "Move as one shape",
        figure: cShape(o),
        text: "Lift all your fingers together and put them down together, rather than one at a time. Picture the next shape before the change. Go slowly enough that every change is clean, then speed up, landing on the beat when a clock runs.",
      },
      {
        title: "Look for a guide finger",
        text: "Some pairs of chords let a finger stay on its string or slide along it. Use that finger to guide the rest. Other pairs have none, so there you move every finger together.",
      },
    ]),
  "tips.spider": (o) =>
    tip("tips.spider", "Spider technique", [
      {
        title: "One finger a fret",
        figure: spider(o),
        sound: run(spiderRun(o)),
        text: "Each finger has its own fret: the index the first, the middle the second, the ring the third and the little finger the fourth. The pattern says which finger plays next. Keep the hand where it is and move only the fingers.",
      },
      {
        title: "Even and relaxed",
        text: "Press just hard enough for a clear note, and lift a finger only as far as it needs. Aim for each note the same length and loudness, evenly on the click. Start at a tempo where it feels easy, then raise it.",
      },
    ]),
  "tips.two-hand": () =>
    tip("tips.two-hand", "Keeping two hands together", [
      {
        title: "One hand at a time",
        figure: keys({ 48: "L", 50: "L", 52: "L", 60: "R", 62: "R", 64: "R" }),
        sound: run([48, 50, 52, 60, 62, 64]),
        text: "The Practise setting can ask for Left only or Right only. Learn each part that way first, then play Both hands.",
      },
      {
        title: "Share one count",
        text: "Both hands follow the same click, so count the beats out loud. Where both hands play on the same beat, aim to land them together.",
      },
    ]),
};

const CARDS: Record<string, (o: CardOpts) => Lesson> = {
  "scales.major-formula": (o) => majorFormula(o),
  "scales.minor-forms": minorForms,
  "scales.thumb-under": thumbUnder,
  "positions.caged": caged,
  "positions.boxes": pentatonicBoxes,
  "positions.connected": connectedBoxes,
  "positions.boxes-ukulele": ukuleBoxes,
  "positions.bb-box": bbBox,
  "comping.charleston": charleston,
  "voicings.rootless": rootless,
  "voicings.minor": minorVoicings,
  "voicings.altered": alteredVoicings,
  "voicings.inversions": inversions,
  "voicings.guide-tones": guideTones,
  "voicings.cadence": () => cadence(false),
  "voicings.cadence-minor": () => cadence(true),
  "accompany.chord-symbols": chordSymbols,
  "chord-scales.why": whyDorian,
  "chord-scales.minor": chordScalesMinor,
  "chord-scales.patterns": chordPatterns,
  ...Object.fromEntries(
    triadIds().map((id) => [`positions.${id}`, (o: CardOpts) => triads(id, o)]),
  ),
  ...Object.fromEntries(
    GOSPEL_PROGRESSIONS.map((g) => [`voicings.gospel.${g.id}`, () => gospel(g.id)]),
  ),
  ...TIPS,
};

export const CARD_IDS = Object.keys(CARDS);
/** The scale kinds that have a standard piano fingering (so the thumb card applies). */
export const hasThumbUnder = (kind: string) => !!SCALE_FINGERINGS[kind];
export { positionsCard } from "./cards-guitar";
/** Cards whose wording changes when the instrument plays one note at a time; the arpeggio version has `.arp` added to its id. */
export const ARPEGGIO_IDS = ["voicings.rootless", "voicings.inversions"];

/**
 * A tier 3 concept card by id, as the lessons a drill passes with `trigger: "check"`; none for an
 * unknown id. `opts` carries what the setup chooses (the tuning for position cards, one note at a
 * time for voicings); a card that changes with it has a different id (`.arp`, or `@tuning-id` when the tuning is not standard), so each is seen once.
 */
export function conceptCard(id: string, opts: CardOpts = {}): Lesson[] {
  const make = CARDS[id];
  if (!make) return [];
  const arp = !!opts.arpeggio && ARPEGGIO_IDS.includes(id);
  const l = make({ ...opts, arpeggio: arp });
  // A position card placed on another tuning has other frets, so it is its own card.
  const t = opts.tuning;
  const retuned =
    id.startsWith("positions.") && t && !["guitar.standard", "ukulele.high-g"].includes(t.id);
  return [arp ? { ...l, id: `${id}.arp` } : retuned ? { ...l, id: `${id}@${t.id}` } : l];
}

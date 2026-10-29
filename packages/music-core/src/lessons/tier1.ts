import {
  JAZZ_VOICING_TYPES,
  UPPER_TUNES,
  chordSpeller,
  jazzVoicingChords,
  type JazzVoicingId,
} from "../content/jazz-voicings";
import { GROOVE_LANES, GROOVE_LEVELS, earGroove, type GrooveLane } from "../content/rhythm";
import { functionChord, functionSymbol, keyCadence, scaleRun } from "../content/ear";
import { parseChordSymbol } from "../theory/chords";
import { noteName, pc, pcOf } from "../theory/notes";
import type { Lesson, LessonFigure, LessonSound, LessonStep } from "./types";

/** The keys figure; `span` is every note the screen's steps will show, so the keyboard keeps its size from step to step. */
const keys = (
  marks: Record<number, string>,
  span: number[] = Object.keys(marks).map(Number),
): LessonFigure => {
  const low = Math.min(...span) - 1;
  return { kind: "keys", low, high: Math.max(...span) + 1, marks };
};
/** One block chord, or several one after the other. */
const chords = (...sets: number[][]): LessonSound => ({
  notes: sets.map((midi, i) => ({ midi, at: i * 1.8, dur: 1.6 })),
});

// ---------------------------------------------------------------------------
// Jazz voicing types

const INTERVALS = [
  "a unison",
  "a minor 2nd",
  "a major 2nd",
  "a minor 3rd",
  "a major 3rd",
  "a perfect 4th",
  "a tritone",
  "a perfect 5th",
  "a minor 6th",
  "a major 6th",
  "a minor 7th",
  "a major 7th",
  "an octave",
  "a minor 9th",
  "a major 9th",
  "a minor 10th",
  "a major 10th",
  "a perfect 11th",
];
const gap = (semis: number) => INTERVALS[semis] ?? `${semis} half steps`;

/** What the drill's type says in words, true of every chord the type gives. */
const IDEAS: Record<JazzVoicingId, string> = {
  sevenths:
    "A seventh chord stacks the root, 3rd, 5th and 7th, all from the notes of the key. The chord on each degree gets its quality from the key: maj7 on the I and IV, m7 on the ii, iii and vi, 7 on the V and m7b5 on the vii. The drill plays them in root position, up the key and back.",
  "so-what":
    "The So What chord is a stack of 4ths with a 3rd on top, all from the dorian mode. The two lowest notes go in the left hand and the other three in the right. To stay in the mode, a 4th or the top 3rd sometimes shrinks or grows by a half step.",
  quartal:
    "A quartal stack is three notes a 4th apart, all in the left hand. The drill moves it up the dorian mode for two octaves. To stay in the mode, one of its 4ths is sometimes an augmented 4th.",
  sus: "A 7sus chord voiced as a slash chord: the root and 5th in the left hand, and the major triad a whole step below the root in the right. For D7sus that triad is C major, written C/D. The right hand can use any inversion of the triad.",
  "two-hand":
    "A rootless voicing leaves the root to the bass. In a ii-V-I the left hand plays the 3rd and 7th (the 7th and 3rd on the V), and the right hand adds the 9th, 5th and 13th.",
  close:
    "A 4-way close voicing puts a melody note on top with the next three chord tones close below it, all within an octave. The drill goes through a ii-V-I with each chord tone on top in turn. A major chord with its root on top takes the 6th instead of the 7th.",
  drop2:
    "Drop-2 starts from the 4-way close voicing and drops its second voice from the top down an octave. That note goes in the left hand and the other three stay in the right. The chord spreads wider than the close voicing, with the same four notes.",
  locked:
    "In George Shearing's locked hands the melody note is doubled an octave below in the left hand, with a 4-way close chord under it in the right. A melody note that belongs to the major 6th chord (root, 3rd, 5th or 6th) gets that chord. Any other melody note gets the diminished seventh chord.",
  garland:
    "Red Garland's block chords on a 12-bar blues: the left hand plays the 3rd, 7th and 9th of the chord. The right hand plays the melody in octaves, with a note a 5th above the lower one between them. The drill gives one chord a bar.",
  evans:
    "Bill Evans's spreads on a ii-V-I use three notes in the left hand and two in the right. The left hand plays the 3rd, 7th and 9th, and on the V the 7th, 3rd and 13th. The top right-hand note is the melody, with one voice under it.",
  monk: "Thelonious Monk's shells on a 12-bar blues keep the root in the left hand. On the I the right hand plays the 3rd, b7 and root. On the IV and V it plays the 3rd and b7, with the root and b9 together on top, a half step apart.",
  upper:
    "Each dominant in a tune gets a 1-3-7 shell in the left hand and a triad on top that adds colour tones. A b9 mark takes the VI triad (b9 13). Otherwise a dominant that resolves to a minor chord, or is marked alt, #9 or b13, takes the bVI triad (#9 b13), and any other takes the II triad (9 #11 13).",
  "quartal-tune":
    "Every chord in a tune's changes gets a left-hand stack of two 4ths taken from the chord's scale, with the chord's 3rd or 7th inside it. Which tones the stack uses depends on the chord and its scale. The picture shows the first chord.",
  "slash-tune":
    "Every chord in a tune's changes becomes a triad over its root, chosen by the chord type. A minor 7th, 7sus or dominant takes the major triad a whole step below the root. A major 7th takes the triad on its 5th, and a half-diminished chord the minor triad on its b3.",
};

/** A chord's note names by its own symbol, so flats and sharps come out right (Bb in C7, not A#). */
function voicingNamer(symbol: string): (midi: number) => string {
  const parsed = parseChordSymbol(symbol.split(" ")[0]);
  if (!parsed) return (m) => noteName(m, "flat", false);
  const speller = chordSpeller(
    parsed.rootName,
    parsed.intervals.includes(3) && !parsed.intervals.includes(4) ? "m7" : "7",
  );
  return speller;
}

/** The first chord the drill gives a voicing type (the default key, and the default tune on a tune). */
export function exampleVoicing(id: JazzVoicingId) {
  return jazzVoicingChords(id, 0, { tune: UPPER_TUNES[0].id })[0];
}

function voicingCard(id: JazzVoicingId, lessonId: string): Lesson {
  const type = JAZZ_VOICING_TYPES.find((t) => t.id === id)!;
  const all = jazzVoicingChords(id, 0, { tune: UPPER_TUNES[0].id });
  const c = all[0];
  const name = voicingNamer(c.symbol);
  const notes = [...c.left, ...c.right].sort((a, b) => a - b);
  const marks = (ms: number[]) => keys(Object.fromEntries(ms.map((m) => [m, name(m)])), notes);
  const steps: LessonStep[] = notes.map((m, i) => ({
    text:
      (i === 0
        ? `Start on ${name(m)}, the lowest note,`
        : `Add ${name(m)}, ${gap(m - notes[i - 1])} above ${name(notes[i - 1])},`) +
      ` in the ${c.left.includes(m) ? "left" : "right"} hand.`,
    figure: marks(notes.slice(0, i + 1)),
  }));
  return {
    id: lessonId,
    title: type.label,
    screens: [
      {
        title: type.label,
        text: IDEAS[id],
        figure: marks(notes),
        sound: chords(...all.slice(0, 2).map((x) => [...x.left, ...x.right])),
      },
      {
        title: "How it is stacked",
        text: `Here is the first one the drill gives, ${c.symbol}. Tap Next to add its notes from the bottom up.`,
        figure: marks([notes[0]]),
        steps,
      },
    ],
  };
}

/** The short lesson for one jazz voicing type; drop-2 comes after 4-way close. */
export function jazzVoicingLesson(type: string): Lesson[] {
  const id = JAZZ_VOICING_TYPES.find((t) => t.id === type)?.id;
  if (!id) return [];
  const lessonId = (x: JazzVoicingId) =>
    `voicing.${x === "close" ? "four-way-close" : x === "drop2" ? "drop-2" : x}`;
  return id === "drop2"
    ? [voicingCard("close", lessonId("close")), voicingCard(id, lessonId(id))]
    : [voicingCard(id, lessonId(id))];
}

// ---------------------------------------------------------------------------
// Rhythm: groove dictation

/** A beat position as a count: 0 is "1", 0.5 is "1&". */
const count = (beat: number) => `${Math.floor(beat) + 1}${beat % 1 ? "&" : ""}`;
const countList = (beats: number[]) =>
  beats.length < 2
    ? beats.map(count).join("")
    : `${beats.slice(0, -1).map(count).join(", ")} and ${count(beats[beats.length - 1])}`;

const drums = (g: Record<GrooveLane, number[]>, lanes: GrooveLane[], bpm = 100): LessonSound => ({
  notes: GROOVE_LANES.filter((l) => lanes.includes(l.id)).flatMap((l) =>
    g[l.id].map((b) => ({
      midi: [l.midi],
      at: (b * 60) / bpm,
      dur: 0.1,
      drum: true,
      velocity: l.id === "hat" ? 0.5 : 0.9,
    })),
  ),
});

/** The first rock groove the drill can give: its first kick pattern, snare on 2 and 4, eighth-note hats. */
export const EXAMPLE_GROOVE = () => earGroove(() => 0, "rock").lanes;

export function grooveDictationLesson(): Lesson {
  const g = EXAMPLE_GROOVE();
  const levels = GROOVE_LEVELS.map((l) => l.title.toLowerCase());
  return {
    id: "rhythm.groove-parts",
    title: "Kick, snare and hi-hat",
    screens: [
      {
        title: "The kick",
        text: "The kick is the low drum, and it lands on beat 1 of every bar in every groove here. The other kick hits move around from groove to groove. Tap Hear it for a kick on beats 1 and 3.",
        sound: drums(g, ["kick"]),
      },
      {
        title: "The snare",
        text: "The snare is the sharp crack on beats 2 and 4. The sixteenths level can add extra snare hits around it, and in trap the main snare moves to beat 3.",
        sound: drums(g, ["snare"]),
      },
      {
        title: "The hi-hat",
        text: "The hi-hat keeps time with a steady run of hits. The first two levels play every eighth note, and the sixteenths and trap levels sometimes play every sixteenth.",
        sound: drums(g, ["hat"]),
      },
      {
        title: "All three together",
        text: "Here is one bar of the simplest groove, counted 1 & 2 & 3 & 4 &, where & is the half beat. Tap Next to add the drums one at a time.",
        steps: [
          {
            text: `The hi-hat plays on ${countList(g.hat)}.`,
            sound: drums(g, ["hat"]),
          },
          {
            text: `The snare joins on ${countList(g.snare)}.`,
            sound: drums(g, ["hat", "snare"]),
          },
          {
            text: `The kick lands on ${countList(g.kick)}.`,
            sound: drums(g, ["hat", "snare", "kick"]),
          },
        ],
      },
      {
        title: "Writing it on the grid",
        text: `In the drill, each drum is a row and each column is a count. Mark the squares where you heard a hit, then check. The levels go ${levels.join(", then ")}.`,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// By ear: find home

export function findHomeLesson(): Lesson {
  const C = 60;
  /** The triads sit between middle C and the B above it. */
  const TRIAD_SPAN = [60, 71];
  const triad = (token: string) => functionChord(0, token).slice(1);
  const names = (ms: number[]) =>
    Object.fromEntries(ms.map((m) => [m, noteName(m, "flat", false)]));
  const cadence = keyCadence(0);
  const step = (i: number, text: string): LessonStep => ({
    text: `${functionSymbol(0, ["I", "IV", "V", "I"][i])}, ${["the I", "the IV", "the V", "the I"][i]} chord. ${text}`,
    figure: keys(names(triad(["I", "IV", "V", "I"][i])), TRIAD_SPAN),
    sound: { notes: [{ midi: cadence[i].midi, at: 0, dur: 1.6 }] },
  });
  const run = scaleRun(C, "major", "ascending");
  const home = noteName(C, "flat", false);
  return {
    id: "by-ear.home",
    title: "Finding home",
    screens: [
      {
        title: "Home is one note",
        text: `In most music one note feels like the place the music rests. It is the tonic, and the key is named for it. In ${home} major home is ${home}, and in a minor key it is the minor key's first note, such as A in A minor.`,
        figure: keys({ [C]: "home" }, [C - 5, C + 7]),
        sound: { notes: [{ midi: [C - 12], at: 0, dur: 4 }] },
      },
      {
        title: "A cadence points home",
        text: "Chords can lead away from home and back. Tap Next to hear one chord at a time.",
        figure: keys(names(triad("I")), TRIAD_SPAN),
        sound: { notes: cadence.map((e, i) => ({ midi: e.midi, at: i * 0.9, dur: 0.8 })) },
        steps: [
          step(0, "This is home."),
          step(1, "It moves away from home."),
          step(2, "It sounds unfinished and wants to go home."),
          step(3, "It sounds finished, because you are back home."),
        ],
      },
      {
        title: "A scale leads home",
        text: "A major scale climbs 1 2 3 4 5 6 7 and then 1 again. Stopping on 7 sounds unfinished, and the step up to 1 sounds like arriving.",
        figure: keys(Object.fromEntries(run.map((m, i) => [m, String((i % 7) + 1)]))),
        sound: { notes: run.map((m, i) => ({ midi: [m], at: i * 0.5, dur: 0.45 })) },
      },
      {
        title: "Finding it in a recording",
        text: "Listen for the note the music settles on, the one where it could stop. Play it on your instrument, sing it, or pick it from the notes below. The octave does not matter.",
      },
      {
        title: "How it is checked",
        text: "The drill works out the key from the whole recording, so home belongs to the song and not to the stretch you looped. Sometimes the relative key's tonic counts too, such as C and A. A song that changes key, or sits long away from home, can fool it.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Call and response: answer

/** What each chord tone is called, by semitones above the root (extensions kept above the octave), and the letter it takes. */
const TONES: Record<number, [label: string, degree: number]> = {
  0: ["R", 1],
  2: ["2", 2],
  3: ["b3", 3],
  4: ["3", 3],
  5: ["4", 4],
  6: ["b5", 5],
  7: ["5", 5],
  8: ["#5", 5],
  9: ["6", 6],
  10: ["b7", 7],
  11: ["7", 7],
  13: ["b9", 2],
  14: ["9", 2],
  15: ["#9", 2],
  17: ["11", 4],
  18: ["#11", 4],
  20: ["b13", 6],
  21: ["13", 6],
};
const LETTERS = "CDEFGAB";
const NATURAL = [0, 2, 4, 5, 7, 9, 11];
/** A chord tone's name, spelled from the root's letter (D7 has F#, Dm7b5 has Ab). */
function spellTone(rootName: string, interval: number): string {
  const li = (LETTERS.indexOf(rootName[0]) + TONES[interval][1] - 1) % 7;
  let diff = pc(pcOf(rootName)! + interval - NATURAL[li]);
  if (diff > 6) diff -= 12;
  return LETTERS[li] + (diff > 0 ? "#".repeat(diff) : "b".repeat(-diff));
}
const ROLES: Record<string, string> = {
  R: "the root, the note the chord is named for",
  "3": "the 3rd, which makes the chord major",
  b3: "the 3rd, which makes the chord minor",
  "5": "the 5th",
  b5: "the flat 5th",
  b7: "the flat 7th",
  "7": "the major 7th",
  "6": "the 6th",
};
const join = (a: string[]) =>
  a.length < 2 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`;

/** The tones of a chord as the drill counts them: its labels, spelled names and midi notes above the root. */
export function chordTones(symbol: string) {
  const c = parseChordSymbol(symbol)!;
  const root = 55 + pc(c.rootPc - 55);
  return c.intervals.map((i) => ({
    label: TONES[i][0],
    name: spellTone(c.rootName, i),
    midi: root + i,
  }));
}

export function chordTonesLesson(chord: string): Lesson {
  const tones = chordTones(chord);
  const upTo = (n: number) =>
    keys(
      Object.fromEntries(tones.slice(0, n).map((t) => [t.midi, t.label])),
      tones.map((t) => t.midi),
    );
  const names = join(tones.map((t) => t.name));
  return {
    id: "call-response.chord-tones",
    title: "Chord tones",
    screens: [
      {
        title: "The chord's tones",
        text: `Your answer should finish on a tone of the chord that is playing. ${chord} is made of ${names}, lit on the keys.`,
        figure: upTo(tones.length),
        sound: {
          notes: [
            ...tones.map((t, i) => ({ midi: [t.midi], at: i * 0.4, dur: 0.4 })),
            { midi: tones.map((t) => t.midi), at: tones.length * 0.4 + 0.2, dur: 1.6 },
          ],
        },
      },
      {
        title: "Each tone",
        text: "Tap Next to light the tones from the bottom up.",
        steps: tones.map((t, i) => ({
          text: ROLES[t.label]
            ? `${t.name} is ${ROLES[t.label]}.`
            : `${t.name} is a tone of the chord.`,
          figure: upTo(i + 1),
          sound: { notes: [{ midi: [t.midi], at: 0, dur: 1 }] },
        })),
      },
      {
        title: "Land on one",
        text: "End your phrase on one of these tones and it sounds settled. Notes outside the chord are fine on the way there. The chord changes as the groove goes round, and the tones change with it.",
        figure: upTo(tones.length),
      },
    ],
  };
}

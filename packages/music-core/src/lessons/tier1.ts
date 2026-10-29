import {
  JAZZ_VOICING_TYPES,
  UPPER_TUNES,
  chordSpeller,
  spellAbove,
  jazzVoicingChords,
  type JazzVoicingId,
} from "../content/jazz-voicings";
import { GROOVE_LANES, GROOVE_LEVELS, earGroove, type GrooveLane } from "../content/rhythm";
import { functionChord, functionSymbol, keyCadence, scaleRun } from "../content/ear";
import { VIBRATO, VIBRATO_SETS } from "../content/aero-skills";
import { fillGroove } from "../content/pad-skills";
import { parseChordSymbol } from "../theory/chords";
import { isBlackKey, noteName, pc } from "../theory/notes";
import type { Lesson, LessonFigure, LessonSound, LessonStep } from "./types";

/**
 * The keys figure; `span` is every note the screen's steps will show, so the keyboard keeps its size
 * from step to step. It starts and ends on a white key, which Piano draws whole.
 */
const keys = (
  marks: Record<number, string>,
  span: number[] = Object.keys(marks).map(Number),
): LessonFigure => {
  let low = Math.min(...span) - 1;
  let high = Math.max(...span) + 1;
  while (isBlackKey(low)) low--;
  while (isBlackKey(high)) high++;
  return { kind: "keys", low, high, marks };
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
    "The So What chord is a stack of 4ths with a 3rd on top, all from the dorian mode. The two lowest notes go in the left hand and the other three in the right. To stay in the mode, a 4th can grow to an augmented 4th and the top 3rd can shrink to a minor 3rd.",
  quartal:
    "A quartal stack is three notes a 4th apart, all in the left hand. The drill moves it up the dorian mode for two octaves. To stay in the mode, one of its 4ths is sometimes an augmented 4th.",
  sus: "A 7sus chord voiced as a slash chord: the root and 5th in the left hand, and the major triad a whole step below the root in the right. For C7sus that triad is Bb major, written Bb/C. The right hand can use any inversion of the triad.",
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
    "Every chord in a tune's changes gets a left-hand stack of two 4ths taken from the chord's scale, with one of the chord's guide tones inside it: the 3rd or 7th, the 4th on a sus chord, or the 6th on a sixth or diminished chord. A chord on a diminished scale, such as a b9 dominant or a diminished 7th, has no such stack, so it gets a tritone under a 4th. The picture shows the first chord.",
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

/** The first chord the drill gives a voicing type (default key, default tune); for Monk the first with a cluster on top. */
export function exampleVoicing(id: JazzVoicingId) {
  const all = jazzVoicingChords(id, 0, { tune: UPPER_TUNES[0].id });
  return (id === "monk" && all.find((x) => x.right.length === 4)) || all[0];
}

function voicingCard(id: JazzVoicingId, lessonId: string): Lesson {
  const type = JAZZ_VOICING_TYPES.find((t) => t.id === id)!;
  const all = jazzVoicingChords(id, 0, { tune: UPPER_TUNES[0].id });
  const c = exampleVoicing(id);
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
        sound: chords(
          ...[c, all[all.indexOf(c) + 1]].filter(Boolean).map((x) => [...x.left, ...x.right]),
        ),
      },
      {
        title: "How it is stacked",
        text: `Here is ${id === "monk" ? "the first chord with a cluster" : "the first one the drill gives"}, ${c.symbol}. Tap Next to add its notes from the bottom up.`,
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

/** The drill's grid with only these drums marked. */
const grid = (g: Record<GrooveLane, number[]>, lanes: GrooveLane[]): LessonFigure => ({
  kind: "groove",
  bars: 1,
  perBeat: 2,
  lanes: Object.fromEntries(lanes.map((l) => [l, g[l]])),
});

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
        figure: grid(g, ["kick"]),
      },
      {
        title: "The snare",
        text: "The snare is the sharp crack on beats 2 and 4. The sixteenths level can add extra snare hits around it, and in trap the main snare moves to beat 3.",
        sound: drums(g, ["snare"]),
        figure: grid(g, ["snare"]),
      },
      {
        title: "The hi-hat",
        text: "The hi-hat keeps time with a steady run of hits. The first two levels play every eighth note, and the sixteenths and trap levels sometimes play every sixteenth.",
        sound: drums(g, ["hat"]),
        figure: grid(g, ["hat"]),
      },
      {
        title: "All three together",
        text: "Here is one bar of the simplest groove, counted 1 & 2 & 3 & 4 &, where & is the half beat. Tap Next to add the drums one at a time.",
        figure: grid(g, []),
        steps: [
          {
            text: `The hi-hat plays on ${countList(g.hat)}.`,
            sound: drums(g, ["hat"]),
            figure: grid(g, ["hat"]),
          },
          {
            text: `The snare joins on ${countList(g.snare)}.`,
            sound: drums(g, ["hat", "snare"]),
            figure: grid(g, ["hat", "snare"]),
          },
          {
            text: `The kick lands on ${countList(g.kick)}.`,
            sound: drums(g, ["hat", "snare", "kick"]),
            figure: grid(g, ["hat", "snare", "kick"]),
          },
        ],
      },
      {
        title: "Writing it on the grid",
        text: `In the drill, each drum is a row and each column is a count, and the picture shows the example filled in. Mark the squares where you heard a hit, then check. The levels go ${levels.join(", then ")}.`,
        figure: grid(g, ["hat", "snare", "kick"]),
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
/** A chord tone's name, spelled from the root's letter (D7 has F#, Dm7b5 has Ab). */
const spellTone = (rootName: string, interval: number) =>
  spellAbove(rootName, interval, TONES[interval][1]);
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

// ---------------------------------------------------------------------------
// Aerophone: bite vibrato

/** Cycles a second the drill asks for, as the drill works it out. */
export const vibratoRate = (set: (typeof VIBRATO_SETS)[number]) => (set.pulses * set.bpm) / 60;

/**
 * The audio runtime has no pitch bend, so a pulse is heard as the note and the note a semitone below,
 * one cycle each. Real vibrato is far narrower than that: this gives the rate only.
 */
const pulses = (rate: number, seconds: number, top = 67): LessonSound => ({
  notes: Array.from({ length: Math.round(seconds * rate * 2) }, (_, i) => ({
    midi: [top - (i % 2)],
    at: i / (rate * 2),
    dur: 1 / (rate * 2),
  })),
});

const rateText = (set: (typeof VIBRATO_SETS)[number]) => {
  const r = vibratoRate(set);
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};

export function biteVibratoLesson(): Lesson {
  const going = VIBRATO_SETS.find((v) => v.bpm === 80)!;
  const slowest = VIBRATO_SETS[0];
  return {
    id: "aerophone.vibrato",
    title: "Bite vibrato",
    screens: [
      {
        title: "Vibrato from the bite",
        text: "Hold a note and pulse your bite on the mouthpiece. The Aerophone sends the bite as pitch bend, and the drill reads those values. If it says no bite arrived, set the bite to send pitch bend (E-Wind bite mode gives vibrato).",
      },
      {
        title: "Pulses a beat",
        text: `The drill sets a tempo and a number of pulses a beat, so ${slowest.pulses} a beat at ${slowest.bpm} is ${rateText(slowest)} pulses a second. The top setting, ${going.pulses} a beat at ${going.bpm}, is ${rateText(going)} a second, the going rate from Larry Teal. Tap each rate to hear it.`,
        options: VIBRATO_SETS.map((v) => ({
          label: `${v.pulses} a beat at ${v.bpm}`,
          sound: pulses(vibratoRate(v), 2),
        })),
      },
      {
        title: "What you hear here",
        text: "Each tap above alternates a note with the note a semitone below, one pair per pulse. The app cannot bend a pitch, and real vibrato is much narrower than a semitone. So this shows the rate only, not the width.",
      },
      {
        title: "What the drill checks",
        text: `The drill listens for ${VIBRATO.seconds} seconds from your first note. You pass with the rate within ${Math.round(VIBRATO.rateTolerance * 100)} percent of the target and an evenness of at least ${Math.round(VIBRATO.evenness * 100)} percent. It shows how deep your pulses are as a share of the bend range but does not score the depth.`,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Pads: improvise

const BEAT = 0.6;
/** The drill's fill and the rock groove under it, as onsets in beats within one bar. */
const PAD_BARS = () => {
  const g = fillGroove("snare-eighths");
  const bar = (n: number) => {
    const lanes: Record<GrooveLane, number[]> = { hat: [], snare: [], kick: [] };
    for (const t of g.targets) {
      const b = t.beat - n * 4;
      if (b < 0 || b >= 4) continue;
      if (t.voice === "hats") lanes.hat.push(b);
      else if (t.voice === "snare" || t.voice === "kick") lanes[t.voice].push(b);
    }
    for (const k of GROOVE_LANES) lanes[k.id].sort((a, c) => a - c);
    return lanes;
  };
  return { groove: bar(0), fill: bar(3) };
};

/** Bars of drum hits one after the other, `at` in beats within each bar; extra hits are `[midi, beat]`. */
const padSound = (
  bars: Record<GrooveLane, number[]>[],
  extra: [number, number][] = [],
): LessonSound => ({
  notes: [
    ...bars.flatMap((g, i) =>
      GROOVE_LANES.flatMap((l) =>
        g[l.id].map((b) => ({
          midi: [l.midi],
          at: (i * 4 + b) * BEAT,
          dur: 0.1,
          drum: true,
          velocity: l.id === "hat" ? 0.5 : 0.9,
        })),
      ),
    ),
    ...extra.map(([midi, beat]) => ({
      midi: [midi],
      at: beat * BEAT,
      dur: 0.4,
      drum: true,
      velocity: 0.9,
    })),
  ],
});

const padGrid = (bars: Record<GrooveLane, number[]>[]): LessonFigure => ({
  kind: "groove",
  bars: bars.length,
  perBeat: 2,
  lanes: Object.fromEntries(
    GROOVE_LANES.map((l) => [l.id, bars.flatMap((g, i) => g[l.id].map((b) => i * 4 + b))]),
  ),
});

/** The groove bar with one more kick, on the "and" of 4. */
export const variedBar = () => {
  const { groove } = PAD_BARS();
  return { ...groove, kick: [...groove.kick, 3.5] };
};

export function padImproviseLesson(): Lesson {
  const { groove, fill } = PAD_BARS();
  const varied = variedBar();
  const bare = { ...groove, hat: [] };
  const CRASH = 49;
  const KICK = GROOVE_LANES.find((l) => l.id === "kick")!.midi;
  return {
    id: "pads.improvise",
    title: "Improvising on the pads",
    screens: [
      {
        title: "Play over the band",
        text: "In this drill the band plays a loop and you play any pads and any rhythm over it. It is graded on time, meaning how close your hits sit to the sixteenth grid, and on keeping every bar going. A bar counts as kept going when it has at least two hits.",
      },
      {
        title: "Vary the groove",
        text: "Keep a groove going and change a little each time round. Tap Plain to hear one bar twice, or Varied to hear it then the same bar with one more kick on the and of 4. The grid shows the second bar.",
        options: [
          { label: "Plain", sound: padSound([groove, groove]), figure: padGrid([groove]) },
          { label: "Varied", sound: padSound([groove, varied]), figure: padGrid([varied]) },
        ],
      },
      {
        title: "Add a fill",
        text: "The grid shows a groove bar, then a fill bar where the hi-hat drops out after the & of 2 and the snare plays eighths on 3 and 4. Hear it adds the crash and kick on the next bar's one. In the drill, with A fill every 4 or 8 bars set, the fill bar needs more hits than your usual bar, so keep the hi-hat going, and a hit on the next bar's one.",
        figure: padGrid([groove, fill]),
        sound: padSound(
          [groove, fill],
          [
            [CRASH, 8],
            [KICK, 8],
          ],
        ),
      },
      {
        title: "Leave space",
        text: "You do not have to fill every beat. This bar is only the kick and snare, with no hi-hat, and it still counts as kept going. Only a bar with no hits, or one hit, loses that part of the score.",
        figure: padGrid([bare]),
        sound: padSound([bare, bare]),
      },
    ],
  };
}

import { CADENCES_AND_QUALITIES, SCALE_DATA } from "../data";
import {
  BASS_LEVELS,
  CENT_STEPS,
  CHORD_FUNCTIONS,
  EAR_INTERVALS,
  EAR_INVERSIONS,
  EAR_SCALES,
  KEY_CHANGE_PATHS,
  SCALE_DEGREES,
  errorDetectPrompt,
  functionChord,
  functionLabel,
  functionSymbol,
  intervalPrompt,
  inversionVoicing,
  keyCadence,
  keyChangePlayback,
  melodyDictationPrompt,
  parseFunction,
  scaleDegreePrompt,
  scalePlayback,
  type PlaybackEvent,
} from "../content/ear";
import {
  loopPalette,
  loopsIn,
  numeralChord,
  numeralLabel,
  numeralSymbol,
  parseNumeral,
} from "../content/loops";
import { FEELS } from "../content/pads-studio";
import { repertoireFor } from "../content/pads-repertoire";
import { grooveTargetsFor } from "../content/winds-pads";
import { rng } from "../content/random";
import { noteName, pc } from "../theory/notes";
import { keys } from "./tier1";
import type { Lesson, LessonScreen, LessonSound } from "./types";

const QUALITIES = CADENCES_AND_QUALITIES.chordQualities;
const CADENCES = CADENCES_AND_QUALITIES.cadences;
const MAJOR = SCALE_DATA.semitonesByKind.major;

const hs = (n: number) => (n === 1 ? "1 half step" : `${n} half steps`);
const name = (m: number) => noteName(m, "flat", false);
const sound = (events: PlaybackEvent[], shift = 0): LessonSound => ({
  notes: events.map((e) => ({
    midi: e.midi,
    at: e.time + shift,
    dur: e.duration,
  })),
});
/** The key set with I, IV, V, I, then the chord, as the drill plays them (the chord 0.6 s after the last). */
const afterSetup = (minor: boolean, chord: PlaybackEvent[]): LessonSound => {
  const setup = keyCadence(0, minor);
  return sound([
    ...setup,
    ...chord.map((e) => ({ ...e, time: e.time + setup.length * 0.9 + 0.6 })),
  ]);
};
const marksOf = (midis: number[]) => Object.fromEntries(midis.map((m) => [m, name(m)]));
const card = (id: string, title: string, ...screens: LessonScreen[]): Lesson => ({
  id,
  title,
  screens,
});

/** The quality's name and whether it is a triad: "major triad", "dominant 7th chord". */
function chordWord(intervals: number[]) {
  const q = QUALITIES.find((x) => x.intervals.join() === intervals.join());
  return q ? `${q.label.toLowerCase()} ${q.level === "triad" ? "triad" : "chord"}` : "chord";
}
/** Where a chord's root sits above the tonic, in words. */
const rootAbove = (n: number) =>
  n === 0 ? "Its root is the tonic" : `Its root is ${hs(n)} above the tonic`;

// ---------------------------------------------------------------------------
// Intervals

/** The direction the quiz will use: a fixed setting, else up (the quiz also plays others, which the text says). */
type Direction = "ascending" | "descending" | "harmonic";
const fixedDirection = (setting?: string): Direction | null =>
  setting === "ascending" || setting === "descending" || setting === "harmonic" ? setting : null;
const intervalSound = (token: string, direction: Direction = "ascending", root = 60) =>
  sound(intervalPrompt(rng(1), { difficulty: 0.3, token, direction, root }).playback);

const intervals = {
  intro: (o: EarOptions) =>
    card("ear.intervals", "Intervals", {
      title: "Distance in half steps",
      text: "An interval is the distance between two notes, counted in half steps: one piano key to the next. The quiz plays two notes and you name the distance. Tap a distance to hear it.",
      options: ["m2", "P5", "P8"].map((t) => {
        const i = EAR_INTERVALS.find((x) => x.token === t)!;
        return {
          label: hs(i.semitones),
          sound: intervalSound(t, fixedDirection(o.direction) ?? "ascending"),
          figure: keys({
            60: "1st",
            [60 + (fixedDirection(o.direction) === "descending" ? -i.semitones : i.semitones)]:
              "2nd",
          }),
        };
      }),
    }),
  item: (token: string, o: EarOptions = {}) => {
    const i = EAR_INTERVALS.find((x) => x.token === token);
    if (!i) return null;
    const dir = fixedDirection(o.direction);
    const n = hs(i.semitones);
    const text = !i.semitones
      ? "The same note twice, 0 half steps apart. Nothing moves between the two."
      : dir === "descending"
        ? `The second note is ${n} below the first, as the quiz plays it.`
        : dir === "harmonic"
          ? `The two notes sound together, ${n} apart, as the quiz plays them.`
          : dir === "ascending"
            ? `The second note is ${n} above the first, as the quiz plays it.`
            : `The second note is ${n} above the first. The quiz can also play it coming down or together, with the same ${n}.`;
    const second = 60 + (dir === "descending" ? -i.semitones : i.semitones);
    return card(`ear.intervals:${token}`, i.name, {
      title: i.name,
      text,
      figure: keys({ 60: "1st", [second]: "2nd" }),
      sound: intervalSound(token, dir ?? "ascending"),
    });
  },
};

const ev = (midi: number, time: number, duration: number): PlaybackEvent => ({
  midi: [midi],
  time,
  duration,
});
/** Two intervals from one root, as the compare drill plays them at first: 0.5 s notes, the second interval at 1.8 s. */
const pair = (a: number, b: number) =>
  sound([ev(60, 0, 0.5), ev(60 + a, 0.6, 0.5), ev(60, 1.8, 0.5), ev(60 + b, 2.4, 0.5)]);
const compare = {
  intro: () =>
    card("ear.interval-compare", "Interval comparison", {
      title: "Which is bigger?",
      text: "Two intervals play one after the other, and you say which one is bigger. Compare the distance between the notes in each, not how high they sound. Later the second interval can start on a different note.",
      options: [
        { label: "First is bigger", sound: pair(7, 4) },
        { label: "Second is bigger", sound: pair(4, 7) },
      ],
    }),
};

// ---------------------------------------------------------------------------
// Chord qualities

const THIRDS: Record<number, string> = { 3: "minor 3rd", 4: "major 3rd" };
const FIFTHS: Record<number, string> = {
  6: "diminished 5th",
  7: "perfect 5th",
  8: "augmented 5th",
};
const SEVENTHS: Record<number, string> = {
  9: "diminished 7th",
  10: "minor 7th",
  11: "major 7th",
};
/** What a cue can name: a chord's 3rd, 5th or 7th (its half steps above the root), or the lack of a 7th. */
export type CueElement =
  | { kind: "third" | "fifth" | "seventh"; n: number }
  | { kind: "none7"; n: 0 };
const elementsOf = (token: string): CueElement[] => {
  const [, third, fifth, seventh] = QUALITIES.find((x) => x.token === token)!.intervals;
  return [
    { kind: "third", n: third },
    { kind: "fifth", n: fifth },
    seventh ? { kind: "seventh", n: seventh } : { kind: "none7", n: 0 },
  ];
};
const hasElement = (token: string, c: CueElement) =>
  elementsOf(token).some((e) => e.kind === c.kind && e.n === c.n);
/**
 * The fewest of a quality's own intervals (3rd, 5th, 7th, or no 7th) that no other quality in `set` has all of,
 * so the cue tells it from every other quality the quiz can ask in that set.
 */
export function qualityCue(token: string, set: readonly string[]): CueElement[] {
  const own = elementsOf(token);
  const others = set.filter((t) => t !== token && QUALITIES.some((q) => q.token === t));
  // Always at least one interval the chord has; "no 7th" only comes with one.
  const subsets = [1, 2, 3].flatMap((size) =>
    [[0], [1], [2], [0, 1], [0, 2], [1, 2], [0, 1, 2]]
      .filter((x) => x.length === size)
      .map((x) => x.map((i) => own[i]))
      .filter((sub) => sub.some((c) => c.kind !== "none7")),
  );
  return subsets.find((sub) => !others.some((t) => sub.every((c) => hasElement(t, c)))) ?? own;
}
const CUE_CODE = {
  third: { 3: "m3", 4: "M3" },
  fifth: { 6: "d5", 7: "P5", 8: "A5" },
  seventh: { 9: "d7", 10: "m7", 11: "M7" },
} as const;
/** The cue as an id part: "M3|P5|no7". */
const cueCode = (cue: CueElement[]) =>
  cue
    .map((c) => (c.kind === "none7" ? "no7" : (CUE_CODE[c.kind] as Record<number, string>)[c.n]))
    .join("|");
const plainList = (xs: (string | number)[]) =>
  xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : `${xs[0]}`;
const qualities = {
  intro: () =>
    card("ear.chord-qualities", "Chord qualities", {
      title: "One chord, all notes together",
      text: "A chord's quality comes from the intervals stacked above its root. The quiz plays one chord with all its notes at once, and you name the quality. Each quality is next.",
    }),
  item: (token: string, o: EarOptions = {}) => {
    const q = QUALITIES.find((x) => x.token === token);
    if (!q) return null;
    const [, third, fifth, seventh] = q.intervals;
    const parts = ["root", THIRDS[third], FIFTHS[fifth], ...(seventh ? [SEVENTHS[seventh]] : [])];
    const cue = qualityCue(token, o.items ?? [token]);
    const heard = cue.filter((c) => c.kind !== "none7");
    const words = heard.map(
      (c) => ({ third: THIRDS, fifth: FIFTHS, seventh: SEVENTHS })[c.kind as "third"][c.n],
    );
    // The cue is part of the id: a set that needs another cue shows the item again.
    const no7 = cue.some((c) => c.kind === "none7");
    const chord = q.intervals.map((i) => 60 + i);
    const title = q.label.charAt(0) + q.label.slice(1).toLowerCase();
    return card(`ear.chord-qualities:${token}|${cueCode(cue)}`, title, {
      title,
      text: `It stacks the ${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}. Listen for the ${plainList(words)}: ${plainList(heard.map((c) => c.n))} half steps above the root${no7 ? ", with no 7th on top" : ""}.`,
      figure: keys(marksOf(chord)),
      sound: { notes: [{ midi: chord, at: 0, dur: 0.9 }] },
    });
  },
};

// ---------------------------------------------------------------------------
// Cadences

const CADENCE_LINE: Record<string, string> = {
  authentic: "It lands on I, home, so it sounds finished.",
  plagal: "It also lands on I, but it comes from IV instead of V.",
  half: "It ends on V, so it sounds unfinished, like a pause.",
  deceptive: "V leads you to expect I, but it goes to vi instead.",
};
const cadences = {
  intro: () =>
    card("ear.cadences", "Cadences", {
      title: "Two chords that close a phrase",
      text: "A cadence is two chords that end a phrase, like punctuation. The quiz plays two chords and you name the cadence by where they go. Each one is next.",
    }),
  item: (token: string) => {
    const c = CADENCES.find((x) => x.token === token);
    if (!c) return null;
    return card(`ear.cadences:${token}`, `${c.label} cadence`, {
      title: `${c.label} cadence`,
      text: `${c.romanProgression.join(" to ")}. ${CADENCE_LINE[token]} Here it is in C, and the quiz moves it to other keys.`,
      sound: {
        notes: c.playback.map((e) => ({
          midi: e.midiNotes,
          at: e.offsetSeconds,
          dur: e.durationSeconds,
        })),
      },
    });
  },
};

// ---------------------------------------------------------------------------
// Chords in a key: chord functions, progressions, song loops

const CALL = "I, IV, V, I";
/** One chord of C (or C minor) after the key is set, from a note list with the root in the bass. */
function chordItem(
  id: string,
  title: string,
  o: {
    minor: boolean;
    chord: number[];
    intervals: number[];
    label: string;
    symbol: string;
  },
) {
  const rootPc = pc(o.chord[0]);
  const key = o.minor ? "C minor" : "C major";
  return card(id, title, {
    title,
    text: `${o.label} in ${key} is ${o.symbol}: a ${chordWord(o.intervals)}. ${rootAbove(rootPc)}. Here the key is set first with ${o.minor ? "i, iv, V, i" : CALL}.`,
    figure: keys(marksOf(o.chord.slice(1))),
    sound: afterSetup(o.minor, [{ midi: o.chord, time: 0, duration: 1.1 }]),
  });
}
const functionItem = (drill: string) => (token: string) => {
  const p = parseFunction(token);
  if (!p.f) return null;
  const chord = functionChord(0, token);
  const intervals = [...new Set(chord.slice(1).map((m) => pc(m - chord[0])))].sort((a, b) => a - b);
  return chordItem(`ear.${drill}:${token}`, functionLabel(token), {
    minor: p.minor,
    chord,
    intervals,
    label: functionLabel(token),
    symbol: functionSymbol(0, token),
  });
};
const functions = {
  intro: () =>
    card("ear.chord-functions", "Chords in a key", {
      title: "Each chord has a place in the key",
      text: "The key is set with I, IV, V, I, then one chord plays and you name its numeral. The numeral is the chord's place in the key: I is built on the tonic, V on the 5th degree. Each chord is next.",
    }),
  item: functionItem("chord-functions"),
};
const progressions = {
  intro: () =>
    card("ear.progressions", "Progression dictation", {
      title: "Write down the chords",
      text: "A progression of three or four chords plays, always starting on I, and you write down the rest as numerals. Hearing where each chord sits in the key tells you which numeral it is. Each chord is next.",
    }),
  item: functionItem("progressions"),
};
const loops = {
  intro: () =>
    card("ear.song-loops", "Song loops", {
      title: "A loop of chords",
      text: "The key is set, then a loop of chords plays as a groove, and you name every chord as a numeral. A flat sign, as in bVII, means the chord's root is a half step lower than that degree in the major scale. Each chord is next.",
    }),
  item: (id: string) => {
    // "min:V" is the numeral heard after a minor setup, "V" after a major one.
    const minor = id.startsWith("min:");
    const numeral = minor ? id.slice(4) : id;
    const n = parseNumeral(numeral);
    if (!n) return null;
    return chordItem(
      `ear.song-loops:${id}`,
      `${numeralLabel(numeral)}${minor ? " in a minor key" : ""}`,
      {
        minor,
        chord: numeralChord(0, numeral),
        intervals: n.intervals,
        label: numeralLabel(numeral),
        symbol: numeralSymbol(0, numeral),
      },
    );
  },
};

/** The lesson items of a loop set: each numeral in each kind of key its loops use. */
export function loopLessonItems(set: string): string[] {
  const ids = new Set<string>();
  const loops = loopsIn(set);
  for (const numeral of loopPalette(set))
    for (const minor of [false, true])
      if (loops.some((l) => !!l.minor === minor && l.numerals.includes(numeral)))
        ids.add(minor ? `min:${numeral}` : numeral);
  return [...ids];
}

// ---------------------------------------------------------------------------
// Key changes

const WAYS: Record<string, string> = {
  "ii7 V7 Imaj7": "ii-V",
  "V7 Imaj7": "V7",
  "iv7 bVII7 Imaj7": "Backdoor",
};
const keyChanges = {
  intro: () =>
    card(
      "ear.key-changes",
      "Key changes",
      {
        title: "The key moves",
        text: "The old key is set with I, IV, V, I, then a few chords take the music to a new key. You answer where it went, then name the chords as numerals in the new key. The last chord is the new tonic.",
      },
      {
        title: "Ways in",
        text: `A ii-V, a V7 or a backdoor leads into a major key, here a whole step up. To a minor key the quiz uses ${KEY_CHANGE_PATHS.minor.map((p) => p.replaceAll(" ", ", ")).join(" or ")}.`,
        options: KEY_CHANGE_PATHS.major.map((path) => ({
          label: WAYS[path] ?? path,
          sound: sound(keyChangePlayback(0, `up-step ${path}`)),
        })),
      },
    ),
};

// ---------------------------------------------------------------------------
// Bass lines

const bassLines = {
  intro: () =>
    card("ear.bass-lines", "Bass lines", {
      title: "The lowest note of each chord",
      text: "Chords play from I with their bass, and you write down the bass note of each as a scale degree. The bass is the chord's root, and at a higher level it can be another chord tone. Each degree is next.",
    }),
  item: (degree: string) => {
    const d = Number(degree);
    if (!BASS_LEVELS.at(-1)!.degrees.includes(degree as never)) return null;
    // 3 and 7 are no chord's root here: they are the 3rd of I and of V, as in the drill's stepwise lines.
    const [token, position] =
      d === 3 ? ["I", 1] : d === 7 ? ["V", 1] : [CHORD_FUNCTIONS[d - 1].token, 0];
    const [, ...upper] = functionChord(0, token);
    const semis = MAJOR[d - 1];
    const bass = 43 + ((((semis - 43) % 12) + 12) % 12);
    const above = semis === 0 ? "the tonic" : `${hs(semis)} above the tonic`;
    const here = position
      ? `Here the ${token} chord has its 3rd in the bass: degree ${degree}, ${above}.`
      : `Here the bass plays degree ${degree}, the root of the ${functionLabel(token)} chord: ${above}.`;
    return card(`ear.bass-lines:${degree}`, `Bass on degree ${degree}`, {
      title: `Bass on degree ${degree}`,
      text: `${here} The key is set first with ${CALL}.`,
      figure: keys(marksOf([bass, ...upper])),
      sound: afterSetup(false, [{ midi: [bass, ...upper], time: 0, duration: 0.8 }]),
    });
  },
};

// ---------------------------------------------------------------------------
// Scales and modes

/** What gives each scale its colour: the notes, and which half-step counts are in or out of it. */
const COLOUR: Record<string, string> = {
  major: "the major 3rd, 4 half steps above the tonic",
  "natural-minor": "the minor 3rd, 3 half steps above the tonic",
  "harmonic-minor": "the jump from the 6th, 8 half steps up, to the 7th, 11 half steps up",
  "melodic-minor": "the minor 3rd with a major 6th and 7th, 9 and 11 half steps up",
  "major-pentatonic": "five notes, with no 4th and no 7th",
  "minor-pentatonic": "five notes, with no 2nd and no 6th",
  blues: "the flat 5th, 6 half steps up, between the 4th and the 5th",
  mixolydian: "the major 3rd with a minor 7th, 10 half steps up",
  dorian: "the minor 3rd with a major 6th, 9 half steps up",
  lydian: "the raised 4th, 6 half steps up",
  phrygian: "the minor 2nd, 1 half step up",
  locrian: "the minor 2nd and the flat 5th, 1 and 6 half steps up",
};
const scales = {
  intro: () =>
    card("ear.scales", "Scales and modes", {
      title: "A scale from its tonic",
      text: "The quiz holds the tonic low and plays a scale from it, and you name the scale. Each scale is a set of steps from the tonic, and one or two notes give it its colour. Each scale is next.",
    }),
  item: (token: string) => {
    const s = EAR_SCALES.find((x) => x.token === token);
    if (!s) return null;
    const run = scaleRun60(token);
    return card(`ear.scales:${token}`, s.name, {
      title: s.name,
      text: `Listen for ${COLOUR[token]}. A low tonic is held under the scale, which here goes up.`,
      figure: keys(marksOf(run)),
      sound: sound(scalePlayback(60, token, "ascending")),
    });
  },
};
const scaleRun60 = (token: string) =>
  (SCALE_DATA.semitonesByKind[token as keyof typeof SCALE_DATA.semitonesByKind] ?? MAJOR).map(
    (s) => 60 + s,
  );

// ---------------------------------------------------------------------------
// Inversions

const BASS_TONE = ["root", "3rd", "5th", "7th"];
const inversions = {
  intro: () =>
    card("ear.inversions", "Inversions", {
      title: "Which note is lowest",
      text: "An inversion is which note of the chord sits lowest. The quiz plays one chord, and you name the inversion by the note in the bass. Each position is next.",
    }),
  item: (token: string) => {
    const inv = EAR_INVERSIONS.find((x) => x.token === token);
    if (!inv) return null;
    const quality = inv.seventh ? "dominant-7" : "major";
    const voicing = inversionVoicing(60, quality, inv.position);
    const bass = Math.min(...voicing);
    // Spelled out from the bass up, then together, as the drill starts out.
    const notes = [
      ...voicing.map((m, i) => ({ midi: [m], at: i * 0.22, dur: 0.2 })),
      { midi: voicing, at: voicing.length * 0.22 + 0.2, dur: 1.2 },
    ];
    return card(`ear.inversions:${token}`, inv.name, {
      title: inv.name,
      text: `The ${BASS_TONE[inv.position]} of the chord is the lowest note, with the same note again an octave higher. Here, in ${inv.seventh ? "C7" : "C major"}, that is ${name(bass)}.`,
      figure: keys(marksOf(voicing)),
      sound: { notes },
    });
  },
};

// ---------------------------------------------------------------------------
// Fine pitch

const finePitch = {
  intro: () => {
    const cents = CENT_STEPS[0];
    const two = (second: number): LessonSound => ({
      notes: [
        { midi: [69], at: 0, dur: 0.8 },
        { midi: [second], at: 1.1, dur: 0.8 },
      ],
    });
    return card("ear.fine-pitch", "Fine pitch", {
      title: "Smaller than a half step",
      text: `A cent is a hundredth of a half step. The quiz plays a note, then the same note a few cents higher or lower, or sometimes in tune, and you say which. The widest step is ${cents} cents, and the steps run down to ${CENT_STEPS.at(-1)}.`,
      options: [
        { label: `Higher by ${cents} cents`, sound: two(69 + cents / 100) },
        { label: `Lower by ${cents} cents`, sound: two(69 - cents / 100) },
      ],
    });
  },
};

// ---------------------------------------------------------------------------
// Degrees: scale degrees, wrong note, melody dictation

/** Scale degrees and melody dictation set the key first (promptKey); the wrong note drill has no key setup. */
const degreeItem =
  (drill: string, keyed: boolean) =>
  (label: string, o: EarOptions = {}) => {
    const d = SCALE_DEGREES.find((x) => x.label === label);
    if (!d) return null;
    const p = scaleDegreePrompt(rng(1), {
      difficulty: 0.3,
      level: "chromatic-color",
      degree: label,
      keyPc: 0,
    });
    const [tonic, target] = p.playback.map((e) => e.midi[0]);
    const minor = !!o.minor;
    const setup = keyed ? ` The key is set first with ${minor ? "i, iv, V, i" : CALL}.` : "";
    return card(`ear.${drill}:${label}`, `Degree ${label}`, {
      title: `Degree ${label}`,
      text: `${
        d.semitones
          ? `Degree ${label} (${d.solfege}) is ${hs(d.semitones)} above the tonic.`
          : `Degree 1 (${d.solfege}) is the tonic itself.`
      }${setup} The tonic plays ${keyed ? "next" : "first"}, then ${d.semitones ? "this note" : "the same note again"}.`,
      figure: keys({ [tonic]: "1", [target]: label === "1" ? "1" : label }),
      sound: keyed ? afterSetup(minor, p.playback) : sound(p.playback),
    });
  };
const scaleDegrees = {
  intro: () =>
    card("ear.scale-degrees", "Scale degrees", {
      title: "Every note has a number",
      text: "In a key, each note has a degree: 1 is the tonic, home, and the rest count up the scale. The quiz plays the tonic, then one more note, and you name its degree. Each degree is next.",
    }),
  item: degreeItem("scale-degrees", true),
};
const melodyDictation = {
  intro: (o: EarOptions) => {
    const p = melodyDictationPrompt(rng(3), {
      difficulty: 0.3,
      level: o.level ?? "major-pentachord",
      keyPc: 0,
    });
    return card("ear.melody-dictation", "Melody dictation", {
      title: "Write down the degrees",
      text: `The key is set first, then the tonic plays and a short phrase follows, and you write down its degrees. This one is ${p.answer}.`,
      sound: afterSetup(p.minor, p.playback),
    });
  },
  item: degreeItem("melody-dictation", true),
};
const wrongNote = {
  intro: (o: EarOptions) => {
    const p = errorDetectPrompt(rng(7), {
      difficulty: 0.3,
      level: o.level ?? "major-pentachord",
    });
    const at = Number(p.answer);
    const written = p.playback.map((e, i) =>
      i === 0 ? e : { ...e, midi: [p.expectedMidi![i - 1]] },
    );
    return card("ear.wrong-note", "Spot the wrong note", {
      title: "One note is changed",
      text: `A melody is written as degrees, here ${p.written!.join(" ")}. It plays after its tonic with one note changed, here note ${at}, and you say which place. Later it can also play exactly as written.`,
      options: [
        { label: "As written", sound: sound(written) },
        { label: "One note changed", sound: sound(p.playback) },
      ],
    });
  },
  item: degreeItem("wrong-note", false),
};

// ---------------------------------------------------------------------------
// Feel

/** A groove of the feel, at its starting tempo, for two bars at least: as the feel drill plays it. */
function feelSound(feel: string): { sound: LessonSound; label: string; bpm: number } | null {
  const f = FEELS.find((x) => x.id === feel);
  const r = f && repertoireFor(f.grooves[0]);
  if (!r) return null;
  const bpm = r.bpm.start;
  const g = grooveTargetsFor(r.groove, bpm);
  const cycles = Math.max(2, Math.ceil(2 / r.groove.bars));
  const notes = Array.from({ length: cycles }, (_, c) =>
    g.targets.map((t) => ({
      midi: [t.pad],
      at: (c * g.lengthMs + t.atMs) / 1000 + 0.05,
      dur: 0.12,
      drum: true,
      velocity: t.accent ? 0.95 : t.ghost ? 0.3 : 0.65,
    })),
  ).flat();
  return { sound: { notes }, label: r.groove.label, bpm };
}
const feel = {
  intro: () =>
    card("ear.feel", "Feel", {
      title: "How the beat is divided",
      text: "A groove's feel is how it divides each beat. The quiz plays a groove and you name its feel from where the notes between the beats fall. Each feel is next.",
    }),
  item: (id: string) => {
    const f = FEELS.find((x) => x.id === id);
    const s = f && feelSound(id);
    if (!f || !s) return null;
    return card(`ear.feel:${id}`, f.label, {
      title: f.label,
      text: `${f.hint} Played here: ${s.label}, ${s.bpm} BPM.`,
      sound: s.sound,
    });
  },
};

// ---------------------------------------------------------------------------

/** What the drill's setup changes about its items: the intervals' direction, a minor level's key setup. */
export interface EarOptions {
  direction?: string;
  minor?: boolean;
  /** The degree level (melody dictation, wrong note): the intro's example uses its degrees. */
  level?: string;
  /** The items asked, so a cue can be told apart within the set. */
  items?: readonly string[];
}
type Builder = {
  intro: (o: EarOptions) => Lesson;
  item?: (item: string, o?: EarOptions) => Lesson | null;
};
const BUILDERS: Record<string, Builder> = {
  intervals,
  "interval-compare": compare,
  "chord-qualities": qualities,
  cadences,
  "chord-functions": functions,
  progressions,
  "key-changes": keyChanges,
  "song-loops": loops,
  scales,
  inversions,
  "bass-lines": bassLines,
  "fine-pitch": finePitch,
  "wrong-note": wrongNote,
  "scale-degrees": scaleDegrees,
  "melody-dictation": melodyDictation,
  feel,
};

/**
 * What an ear drill teaches before its quiz: an intro with the idea, then one single-screen lesson
 * per item the drill's current level asks (an interval, a chord quality, a cadence, a numeral...),
 * each played with the drill's own sound. Items a drill has no lesson for are left out. The lesson
 * follows the drill and its level, never the answer mode.
 */
export function earLessons(
  drillId: string,
  items: readonly string[],
  o: EarOptions = {},
): Lesson[] {
  const b = BUILDERS[drillId];
  if (!b) return [];
  const all = { ...o, items };
  return [b.intro(all), ...items.flatMap((i) => b.item?.(i, all) ?? [])];
}

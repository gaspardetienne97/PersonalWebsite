// The drill registry every hub reads. Routes follow TASKS.md "Architecture".
// exerciseId is what a drill records on its runs and scoring events; ids named by
// the learning-path data are used exactly as written there.

import { INSTRUMENTS, type Capability, type Instrument, type Modality } from "../types";
import { EAR_DRILLS } from "./ear";
import { STUDIO_EXERCISES } from "./studio";
import { RHYTHM_PATTERNS, rhythmSkills } from "./rhythm";
import { LICK_CATEGORIES, lickSkills } from "./piano";
import { chordShapeSkills } from "./technique";
import { aerophoneSkills, GROOVES, grooveSkills } from "./winds-pads";

export interface DrillMode {
  id: string;
  label: string;
  exerciseId: string;
  skillIds: string[];
}

export interface CatalogEntry {
  id: string;
  /** The default mode's exerciseId when the entry has modes. */
  exerciseId: string;
  route: string;
  title: string;
  /** One plain sentence: what you will hear or play. */
  blurb: string;
  instruments: Instrument[];
  capability: Capability;
  skillIds: string[];
  modality: Modality;
  modes: DrillMode[];
}

const uniq = (ids: string[]) => [...new Set(ids)];
const mode = (
  id: string,
  label: string,
  exerciseId: string,
  skillIds: string[] = [],
): DrillMode => ({
  id,
  label,
  exerciseId,
  skillIds,
});
const entry = (
  e: Omit<CatalogEntry, "exerciseId" | "skillIds" | "modes"> & Partial<CatalogEntry>,
): CatalogEntry => {
  const modes = e.modes ?? [];
  return {
    ...e,
    modes,
    exerciseId: e.exerciseId ?? modes[0].exerciseId,
    skillIds: e.skillIds ?? uniq(modes.flatMap((m) => m.skillIds)),
  };
};

const EAR_EXERCISE: Record<string, string> = {
  intervals: "ear.intervals",
  "interval-compare": "ear.interval-compare",
  "chord-qualities": "ear.chord-qualities",
  cadences: "ear.cadences",
  "chord-functions": "ear.chord-functions",
  progressions: "ear.progressions",
  scales: "ear.scales",
  inversions: "ear.inversions",
  "bass-lines": "ear.bass-lines",
  "fine-pitch": "ear.fine-pitch",
  "wrong-note": "ear.error-detection",
  "scale-degrees": "ear.scale-degree-recognition",
  "melody-dictation": "ear.melody-dictation",
  "repertoire-transfer": "ear.repertoire-transfer",
  mixed: "ear.mixed",
};
const EAR_MODE_LABEL: Record<string, string> = {
  choice: "Choice",
  "play-back": "Play it back",
  voice: "Sing it",
  listen: "Pocket recall",
  "listen-along": "Listen along",
};
const EAR_BLURB: Record<string, string> = {
  intervals: "Hear two notes and name the distance between them.",
  "interval-compare": "Hear two intervals and say which one is bigger.",
  "chord-qualities": "Hear a chord and say whether it is major, minor or another quality.",
  cadences: "Hear two chords that end a phrase and name the cadence.",
  "chord-functions": "Hear a chord after the key is set and name its place in the key, I to vii°.",
  progressions: "Hear three or four chords starting on I and write down the rest.",
  scales: "Hear a scale over its tonic and name it, from major and minor to the modes.",
  inversions: "Hear a chord and say which of its notes is in the bass.",
  "bass-lines": "Hear chords from I and write down the bass line by degree.",
  "fine-pitch": "Hear whether a note is a few cents sharp or flat of another.",
  "wrong-note": "Follow a written melody by ear and find the note that was played wrong.",
  "scale-degrees": "Hear the tonic, then a note, and name its place in the key.",
  "melody-dictation": "Hear a three or four note phrase and play it back in order.",
  "repertoire-transfer": "Hear a short phrase from one of your saved songs and play it back.",
  mixed: "A short adaptive mix of intervals, chords, scale degrees and cadences.",
};

const earEntries = EAR_DRILLS.map((d) =>
  entry({
    id: `ear-${d.slug}`,
    exerciseId: EAR_EXERCISE[d.slug],
    route: d.route,
    title: d.title,
    blurb: EAR_BLURB[d.slug],
    instruments: [...INSTRUMENTS],
    capability: "ear",
    skillIds: d.skillIds,
    modality: "heard",
    // Answer modes are modalities of one exercise, so they share its exerciseId.
    modes: d.answerModes.map((m) => mode(m, EAR_MODE_LABEL[m], EAR_EXERCISE[d.slug], d.skillIds)),
  }),
);

const GUITAR_UKE: Instrument[] = ["guitar", "ukulele"];

export const CATALOG: CatalogEntry[] = [
  ...earEntries,
  entry({
    id: "reading",
    route: "/music/reading",
    title: "Note reading",
    blurb: "Read notes on the staff and name or play them, or play a short generated phrase.",
    instruments: ["piano", "guitar", "ukulele"],
    capability: "reading",
    modality: "read",
    modes: [
      mode("flashcards", "Flashcards", "reading.flashcard.note-id", [
        "reading.treble",
        "reading.treble.landmarks",
        "reading.bass",
        "reading.bass.landmarks",
        "reading.polyphonic",
      ]),
      mode("sight-reading", "Sight-reading", "reading.sight-reading", [
        "reading.treble",
        "reading.treble.stepwise",
        "reading.bass",
        "reading.bass.stepwise",
        "reading.rhythm.compound",
      ]),
    ],
  }),
  entry({
    id: "rhythm",
    route: "/music/rhythm",
    title: "Rhythm",
    blurb: "Tap a steady pulse, read a pattern and tap it, or hear one and tap or write it back.",
    instruments: [...INSTRUMENTS],
    capability: "rhythm",
    modality: "tapped",
    modes: [
      mode("pulse", "Pulse", "rhythm.pulse", rhythmSkills("pulse")),
      mode(
        "read-and-tap",
        "Read and tap",
        rhythmExerciseId("quarter-pulse"),
        uniq(RHYTHM_PATTERNS.flatMap((p) => rhythmSkills(p.id))),
      ),
      mode("echo", "Echo", "rhythm.echo", ["rhythm.subdivisions", "ear.rhythm-echo"]),
      mode("groove", "Groove dictation", "rhythm.groove-dictation", [
        "rhythm.subdivisions",
        "ear.groove-dictation",
      ]),
      mode("dictation", "Dictation", "rhythm.dictation", [
        "rhythm.subdivisions",
        "ear.rhythm-dictation",
      ]),
    ],
  }),
  entry({
    id: "scales",
    route: "/music/scales",
    title: "Scales",
    blurb: "Play a scale evenly at the target tempo, one hand or both.",
    instruments: ["piano"],
    capability: "technique",
    modality: "played",
    exerciseId: "technique.scale",
    skillIds: [
      "technique.scales",
      "technique.scale.major",
      "technique.scale.natural-minor",
      "technique.scale.harmonic-minor",
      "technique.scale.melodic-minor",
      "technique.scale.major-pentatonic",
      "technique.scale.minor-pentatonic",
    ],
  }),
  entry({
    id: "two-hand",
    route: "/music/two-hand",
    title: "Two hands",
    blurb:
      "Each hand plays its own part: a steady pulse under a moving line, or both hands mirroring.",
    instruments: ["piano"],
    capability: "technique",
    modality: "played",
    exerciseId: "technique.piano.two-hand-independence",
    skillIds: ["technique.piano.two-hand-independence", "technique.piano.independence.shell-line"],
  }),
  entry({
    id: "comping",
    route: "/music/comping",
    title: "Comping",
    blurb: "Play a blues phrase in the right hand over a Charleston shell in the left.",
    instruments: ["piano"],
    capability: "technique",
    modality: "played",
    exerciseId: "comping",
    skillIds: ["technique.piano.comping"],
  }),
  entry({
    id: "voicings",
    route: "/music/voicings",
    title: "ii-V-I voicings",
    blurb: "Play rootless jazz voicings through a ii-V-I in all twelve keys.",
    instruments: ["piano"],
    capability: "harmony",
    modality: "played",
    modes: [
      mode("major", "Major", "voicing-drill", ["harmony.ii-v-i", "harmony.ii-v-i.voicings.major"]),
      mode("minor", "Minor", "voicing-drill", ["harmony.ii-v-i", "harmony.ii-v-i.voicings.minor"]),
      mode("altered", "Altered", "voicing-drill", [
        "harmony.ii-v-i",
        "harmony.ii-v-i.voicings.altered",
      ]),
      mode("inversions", "Voice leading", "voicing-drill", [
        "harmony.ii-v-i",
        "harmony.ii-v-i.voice-leading",
      ]),
    ],
  }),
  entry({
    id: "licks",
    route: "/music/licks",
    title: "Jazz licks",
    blurb: "Hear a transcribed line over the changes, then play it back.",
    instruments: ["piano", "guitar"],
    capability: "harmony",
    modality: "played",
    modes: LICK_CATEGORIES.map((c) => mode(c, c, "jazz.lick.playback", lickSkills(c))),
  }),
  entry({
    id: "chord-scales",
    route: "/music/chord-scales",
    title: "Chord scales",
    blurb: "As a ii-V-I moves, play the go-to scale for each chord.",
    instruments: ["piano", "guitar", "ukulele", "aerophone"],
    capability: "harmony",
    modality: "played",
    modes: [
      mode("major", "Major ii-V-I", "jazz.chord-scales", ["harmony.ii-v-i.chord-scales.major"]),
      mode("minor", "Minor ii-V-i", "jazz.chord-scales", ["harmony.ii-v-i.chord-scales.minor"]),
    ],
  }),
  entry({
    id: "fretboard",
    route: "/music/fretboard",
    title: "Fretboard",
    blurb: "Work finger patterns, box shapes, note names and intervals on the neck.",
    instruments: GUITAR_UKE,
    capability: "technique",
    modality: "played",
    modes: [
      mode("spider", "Spider", "technique.guitar.spider", [
        "technique.strings.spider",
        "technique.strings.spider.permutations",
        "technique.guitar.spider",
        "technique.ukulele.spider",
      ]),
      mode("positions", "Positions", "technique.guitar.positions", [
        "technique.strings.spider",
        "technique.guitar.spider",
      ]),
      mode("note-finder", "Note finder", "technique.guitar.note-finder", [
        "technique.strings.note-finder",
        "technique.guitar.note-finder",
        "technique.ukulele.note-finder",
      ]),
      mode("interval-recall", "Interval recall", "technique.guitar.interval-recall", [
        "technique.guitar.intervals",
        "technique.guitar.intervals.3",
        "technique.guitar.intervals.4",
        "technique.guitar.intervals.7",
        "technique.guitar.intervals.12",
      ]),
    ],
  }),
  entry({
    id: "chords",
    route: "/music/chords",
    title: "Chords",
    blurb: "Fret an open chord string by string, strum it, or change between two chords in time.",
    instruments: GUITAR_UKE,
    capability: "technique",
    modality: "played",
    modes: [
      mode("build", "Build", "technique.guitar.chord-perfect", [
        ...chordShapeSkills("guitar", "build"),
        "technique.ukulele.chord-perfect",
      ]),
      mode("pick", "Pick", "technique.guitar.chord-pick", [
        ...chordShapeSkills("guitar", "pick"),
        "technique.ukulele.chord-perfect",
      ]),
      mode("strum", "Strum and identify", "technique.guitar.open-chord-id", [
        ...chordShapeSkills("guitar", "strum"),
        "technique.ukulele.open-chord-id",
      ]),
      mode("changes", "Changes", "technique.guitar.chord-changes", [
        ...chordShapeSkills("guitar", "changes"),
        "technique.ukulele.chord-changes",
      ]),
    ],
  }),
  entry({
    id: "strum",
    route: "/music/strum",
    title: "Strum a progression",
    blurb: "Strum a known chord progression in time while the microphone follows along.",
    instruments: GUITAR_UKE,
    capability: "harmony",
    modality: "played",
    // No mastery claim: the progression follower writes a journal entry only.
    exerciseId: "technique.guitar.strum-progression",
    skillIds: [],
  }),
  entry({
    id: "pads",
    route: "/music/pads",
    title: "Pads",
    blurb: "Alternate two pads on the click, or copy back a drum groove across the kit.",
    instruments: ["mpc"],
    capability: "technique",
    modality: "played",
    modes: [
      // The path data records every rudiment (singles, sixteenths, paradiddles) under this id.
      mode("rudiment", "Rudiments", "technique.mpc.single-strokes", [
        "technique.mpc",
        "technique.mpc.single-strokes",
        "technique.mpc.paradiddles",
      ]),
      mode(
        "groove",
        "Grooves",
        "technique.mpc.groove",
        uniq(GROOVES.flatMap((g) => grooveSkills(g.value))),
      ),
    ],
  }),
  entry({
    id: "aerophone",
    route: "/music/aerophone",
    title: "Aerophone",
    blurb:
      "Hold, swell and tongue notes on the wind controller, and land intervals against a drone.",
    instruments: ["aerophone"],
    capability: "technique",
    modality: "played",
    modes: [
      mode("long-tone", "Long tone", "technique.aerophone.long-tone", aerophoneSkills("long-tone")),
      mode("swell", "Swell", "technique.aerophone.swell", aerophoneSkills("swell")),
      mode(
        "articulation",
        "Articulation",
        "technique.aerophone.articulation",
        aerophoneSkills("articulation"),
      ),
      mode(
        "interval-landing",
        "Interval landing",
        "technique.aerophone.interval-landing",
        aerophoneSkills("interval-landing"),
      ),
    ],
  }),
  entry({
    id: "listening",
    route: "/music/listening",
    title: "Studio ears",
    blurb: "Hear a loop flat and changed, and name the change: an EQ band, a level, a pan.",
    instruments: [...INSTRUMENTS],
    capability: "ear",
    modality: "heard",
    modes: STUDIO_EXERCISES.map((e) =>
      mode(e.id, e.title, `studio.${e.id}`, ["studio.ears", e.skillId]),
    ),
  }),
  entry({
    id: "lab",
    route: "/music/lab",
    title: "Practice lab",
    blurb: "Play freely and record everything, with or without a backing track.",
    instruments: [...INSTRUMENTS],
    capability: "technique",
    modality: "played",
    exerciseId: "lab.free-play",
    skillIds: [],
  }),
  entry({
    id: "jam",
    route: "/music/jam",
    title: "Jam",
    blurb: "Solo over a progression with the chord tones lit for each chord.",
    instruments: [...INSTRUMENTS],
    capability: "harmony",
    modality: "played",
    exerciseId: "jam.improv",
    skillIds: [],
  }),
  entry({
    id: "song-studio",
    // Song Studio lives at /music/songs/[id]; the library is where a song is picked.
    route: "/music/library?tab=songs",
    title: "Song Studio",
    blurb: "Play through one of your saved songs while the score waits for you or keeps time.",
    instruments: [...INSTRUMENTS],
    capability: "reading",
    modality: "played",
    exerciseId: "song.studio",
    // Imported songs never write mastery.
    skillIds: [],
  }),
];

export const catalogEntry = (id: string) => CATALOG.find((e) => e.id === id);

/** Rhythm read-and-tap runs record the pattern: rhythm.pattern.<patternId>. */
export function rhythmExerciseId(patternId: string): string {
  return `rhythm.pattern.${patternId}`;
}

/** Fretted exercise ids are written for guitar; this swaps in the instrument (ukulele). */
export const exerciseIdFor = (exerciseId: string, instrument: Instrument) =>
  exerciseId.replace(/^technique\.guitar\./, `technique.${instrument}.`);

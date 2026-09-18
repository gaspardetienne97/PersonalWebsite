// The three instrument progressions (curriculum §3): guitar, piano and MPC.
// Each row of a §3 table is one step, chained by `requires` so a beginner step
// is `next` while its successor stays `locked` until the check is passed with
// independent evidence. The steps carry the Skill Graph nodes and exercise ids
// the drills already emit, so status is computed from real practice only.
import { buildLearningPath, type LearningPath, type LearningPathDefinition } from "./index";
import type { LearningPathOptions, LearningPathStepDefinition } from "./index";

export type InstrumentPathId = "guitar" | "piano" | "mpc";

export const INSTRUMENT_PATH_IDS = ["guitar", "piano", "mpc"] as const satisfies readonly [
  InstrumentPathId,
  ...InstrumentPathId[],
];

const GUITAR_STEPS: LearningPathStepDefinition[] = [
  {
    id: "G-B1",
    // The chord-perfect drill has no Check mode, so every run is recorded
    // guided. Remove when Check mode lands there.
    evidence: "guided-accepted",
    order: 1,
    title: "Open shapes, clean strings",
    summary: "Build E, A, D, G and C in the fretboard and let every string ring (span).",
    detail: "5 of 6 strings sound clean by pitch on 3 tries.",
    href: "/music/play/chord-perfect?mode=build&instrument=guitar&tuning=guitar.standard&shape=guitar.e-major&bpm=60",
    links: [
      {
        label: "A shape",
        href: "/music/play/chord-perfect?mode=build&instrument=guitar&tuning=guitar.standard&shape=guitar.a-major&bpm=60",
      },
      {
        label: "C shape",
        href: "/music/play/chord-perfect?mode=build&instrument=guitar&tuning=guitar.standard&shape=guitar.c-major&bpm=60",
      },
    ],
    skillIds: ["technique.guitar.chord-perfect"],
    exerciseIds: ["technique.guitar.chord-perfect"],
    minAttempts: 3,
  },
  {
    id: "G-B2",
    // The rhythm pattern drill has no Check mode, so every run is recorded
    // guided. Remove when Check mode lands there.
    evidence: "guided-accepted",
    order: 2,
    title: "Downstrokes on 1 2 3 4",
    summary: "Four on the floor over one chord, D then A, from 60 up to 84 (tempo).",
    detail: "90% of the strums on time at 72 BPM.",
    href: "/music/learn/rhythm?mode=read-and-tap&pattern=guitar-four-on-the-floor&bpm=72",
    requires: ["G-B1"],
    skillIds: ["rhythm.pattern.guitar-four-on-the-floor"],
    exerciseIds: ["rhythm.pattern.guitar-four-on-the-floor"],
  },
  {
    id: "G-B3",
    // The chord change drill has no Check mode, so every run is recorded
    // guided. Remove when Check mode lands there.
    evidence: "guided-accepted",
    order: 3,
    title: "Change on the bar",
    summary: "D to A, E to A and G to C against a clock (coordination).",
    detail: "40 changes a minute or more, unaided.",
    href: "/music/play/chord-perfect?mode=changes&instrument=guitar&tuning=guitar.standard&shape=guitar.d-major&to=guitar.a-major&timed=1&bpm=60&clock=4",
    links: [
      {
        label: "E to A",
        href: "/music/play/chord-perfect?mode=changes&instrument=guitar&tuning=guitar.standard&shape=guitar.e-major&to=guitar.a-major&timed=1&bpm=60&clock=4",
      },
      {
        label: "G to C",
        href: "/music/play/chord-perfect?mode=changes&instrument=guitar&tuning=guitar.standard&shape=guitar.g-major&to=guitar.c-major&timed=1&bpm=60&clock=4",
      },
    ],
    requires: ["G-B2"],
    skillIds: ["technique.guitar.chord-changes"],
    exerciseIds: ["technique.guitar.chord-changes"],
  },
  {
    id: "G-I1",
    // The rhythm pattern drill has no Check mode, so every run is recorded
    // guided. Remove when Check mode lands there.
    evidence: "guided-accepted",
    order: 4,
    title: "Island strum with a mute",
    summary: "D DU UDU over G then C, the mute played as a rest (density and syncopation).",
    detail: "85% on time at 84 BPM, with the mutes landing as rests.",
    href: "/music/learn/rhythm?mode=read-and-tap&pattern=guitar-island-strum&bpm=84",
    requires: ["G-B3"],
    skillIds: ["rhythm.pattern.guitar-island-strum"],
    exerciseIds: ["rhythm.pattern.guitar-island-strum"],
  },
  {
    id: "G-I2",
    order: 5,
    title: "Fretboard notes, strings 1 to 3",
    summary: "Name and find intervals from an anchor inside frets 0 to 5 (memory).",
    detail: "12 of 15 found in 60 seconds.",
    href: "/music/play/spider?mode=interval-recall&instrument=guitar&tuning=guitar.standard&interval=7&region=0",
    requires: ["G-I1"],
    skillIds: ["technique.guitar.intervals"],
    exerciseIds: ["technique.guitar.interval-recall"],
    minAttempts: 12,
  },
  {
    id: "G-I3",
    // The fretboard positions drill has no Check mode, so every run is recorded
    // guided. Remove when Check mode lands there.
    evidence: "guided-accepted",
    order: 6,
    title: "Minor pentatonic box 1",
    summary: "The box up and down in one position, two notes a string (span).",
    detail: "A clean run at 90 BPM.",
    href: "/music/play/spider?mode=positions&instrument=guitar&tuning=guitar.standard&pattern=minor-pentatonic-box-1&rootFret=5&bpm=90",
    requires: ["G-I2"],
    skillIds: ["technique.guitar.spider"],
    exerciseIds: ["technique.guitar.positions"],
  },
  {
    id: "G-I4",
    order: 7,
    title: "A lick in the box, in time",
    summary: "Box one at the twelfth fret over Em to D, from memory (harmony and memory).",
    detail: "All 14 notes, 80% of them on time at 96 BPM.",
    href: "/music/play/licks?category=guitar-pentatonic&lick=30&instrument=guitar&bpm=96&mode=check",
    requires: ["G-I3"],
    skillIds: ["harmony.ii-v-i.licks.guitar-pentatonic"],
    exerciseIds: ["jazz.lick.playback"],
  },
  {
    id: "G-A1",
    // The chord change drill has no Check mode, so every run is recorded
    // guided. Remove when Check mode lands there.
    evidence: "guided-accepted",
    order: 8,
    title: "Barre F and Bm",
    summary: "Barre shapes changing with the open ones (coordination).",
    detail: "30 changes a minute or more, unaided.",
    href: "/music/play/chord-perfect?mode=changes&instrument=guitar&tuning=guitar.standard&shape=guitar.f-major&to=guitar.c-major&timed=1&bpm=60&clock=4",
    links: [
      {
        label: "Bm to A",
        href: "/music/play/chord-perfect?mode=changes&instrument=guitar&tuning=guitar.standard&shape=guitar.b-minor&to=guitar.a-major&timed=1&bpm=60&clock=4",
      },
    ],
    requires: ["G-I4"],
    skillIds: ["technique.guitar.chord-changes"],
    exerciseIds: ["technique.guitar.chord-changes"],
    minSessions: 2,
  },
  {
    id: "G-A2",
    order: 9,
    title: "The same lick in a new key",
    summary: "Box one at the fifth fret over Am to D: same shape, new key (transfer).",
    detail: "The G-I4 rule again in A minor: all 14 notes, 80% on time at 96 BPM.",
    href: "/music/play/licks?category=guitar-pentatonic&lick=31&instrument=guitar&bpm=96&mode=check",
    requires: ["G-I4"],
    skillIds: ["harmony.ii-v-i.licks.guitar-pentatonic"],
    exerciseIds: ["jazz.lick.playback"],
    minSessions: 2,
  },
];

const PIANO_STEPS: LearningPathStepDefinition[] = [
  {
    id: "P-B1",
    // The scale pattern drill has no Check mode, so every run is recorded
    // guided. Remove when Check mode lands there.
    evidence: "guided-accepted",
    order: 1,
    title: "Five-finger pattern, one hand",
    summary: "C position, each hand on its own, one octave (span).",
    detail: "Every pitch right at 60 BPM.",
    href: "/music/play/scales?scale=major&tonic=C4&instrument=piano&bpm=60&motion=up&span=one-octave&hands=right",
    links: [
      {
        label: "Left hand",
        href: "/music/play/scales?scale=major&tonic=C4&instrument=piano&bpm=60&motion=up&span=one-octave&hands=left",
      },
    ],
    skillIds: ["technique.scale.major"],
    exerciseIds: ["technique.scale"],
  },
  {
    id: "P-B2",
    // The two-hand independence drill has no Check mode, so every run is recorded
    // guided. Remove when Check mode lands there.
    evidence: "guided-accepted",
    order: 2,
    title: "Hands together in contrary motion",
    summary: "Mirror hands: both thumbs on C, the hands moving apart and back (coordination).",
    detail: "80% of the beats struck within 40 ms between the hands.",
    href: "/music/play/two-hand?pattern=contrary-five&hand=both&tonic=C4&bpm=60",
    requires: ["P-B1"],
    skillIds: ["technique.piano.two-hand-independence"],
    exerciseIds: ["technique.piano.two-hand-independence"],
  },
  {
    id: "P-B3",
    order: 3,
    title: "Reading treble then bass",
    summary: "Flashcards in C position with the answers hidden (memory).",
    detail: "9 of 10 cards right.",
    href: "/music/learn/reading?activity=flashcards&instrument=piano&clefs=treble,bass&key=C%20major&low=60&high=72&answer=play",
    requires: ["P-B2"],
    skillIds: ["reading.treble.landmarks", "reading.bass.landmarks"],
    exerciseIds: ["reading.flashcard.note-id"],
    minAttempts: 10,
  },
  {
    id: "P-I1",
    order: 4,
    title: "Triads and inversions, one hand",
    summary: "Root, first and second inversion voiced in one hand and graded (harmony).",
    detail: "Root, first and second inversion right on three tries.",
    href: "/music/play/voicings?variant=inversions&instrument=piano&key=0&mode=check",
    requires: ["P-B3"],
    skillIds: ["harmony.ii-v-i.voice-leading"],
    exerciseIds: ["voicing-drill"],
    minAttempts: 3,
  },
  {
    id: "P-I2",
    order: 5,
    title: "I IV V I with minimal movement",
    summary: "Closest chords over left-hand roots (harmony and coordination).",
    detail: "Every voice moves 2 semitones or less between bars.",
    href: "/music/play/voicings?variant=inversions&instrument=piano&key=0&mode=check",
    links: [
      {
        label: "G major",
        href: "/music/play/voicings?variant=inversions&instrument=piano&key=7&mode=check",
      },
    ],
    requires: ["P-I1"],
    skillIds: ["harmony.ii-v-i.voice-leading"],
    exerciseIds: ["voicing-drill"],
    minAttempts: 8,
  },
  {
    id: "P-I3",
    // The scale pattern drill has no Check mode, so every run is recorded
    // guided. Remove when Check mode lands there.
    evidence: "guided-accepted",
    order: 6,
    title: "One-octave scale, hands together",
    summary: "The C major scale in both hands at 80 (tempo).",
    detail: "Evenness of 0.85 or better.",
    href: "/music/play/scales?scale=major&tonic=C4&instrument=piano&bpm=80&motion=up&span=one-octave&hands=both",
    requires: ["P-I2"],
    skillIds: ["technique.scale.major"],
    exerciseIds: ["technique.scale"],
    minAttempts: 3,
    minSessions: 2,
  },
  {
    id: "P-I4",
    order: 7,
    title: "Blues lick over a C7 shell",
    summary: "The right-hand lick against a Charleston left hand (syncopation and memory).",
    detail: "All 12 notes, the left hand on beat 1 and the and of 2.",
    // The comping drill has no route yet: this opens the closest two-hand
    // drill until `/music/play/comping` lands.
    kind: "reference",
    href: "/music/play/two-hand?pattern=lh-pulse-rh-line&hand=both&tonic=C4&bpm=90",
    requires: ["P-I3"],
    skillIds: ["technique.piano.comping"],
    exerciseIds: ["comping"],
  },
  {
    id: "P-A1",
    order: 8,
    title: "The same lick over F7 and G7",
    summary: "Transposed, with a rootless left hand (transfer).",
    detail: "Unaided in both keys.",
    kind: "reference",
    href: "/music/play/two-hand?pattern=lh-pulse-rh-line&hand=both&tonic=F4&bpm=90",
    requires: ["P-I4"],
    skillIds: ["technique.piano.comping"],
    exerciseIds: ["comping"],
    minSessions: 2,
  },
  {
    id: "P-A2",
    order: 9,
    title: "Sight-read a four-bar phrase",
    summary: "A two-hand phrase from your library, wait mode first (transfer).",
    detail: "Wait mode through to performance mode at 60 BPM.",
    kind: "reference",
    href: "/music/library?tab=songs",
    requires: ["P-A1"],
    skillIds: ["reading.polyphonic"],
  },
];

const MPC_STEPS: LearningPathStepDefinition[] = [
  {
    id: "M-B1",
    // The MPC rudiments drill has no Check mode, so every run is recorded
    // guided. Remove when Check mode lands there.
    evidence: "guided-accepted",
    order: 1,
    title: "Two pads on the click",
    summary: "Alternating singles at eighths, from 60 to 80 (tempo).",
    detail: "Mean absolute error of 60 ms or less.",
    href: "/music/play/mpc?mode=rudiment&pattern=single-strokes&sub=2&hits=16&bpm=60",
    skillIds: ["technique.mpc.single-strokes"],
    exerciseIds: ["technique.mpc.single-strokes"],
  },
  {
    id: "M-B2",
    // The MPC rudiments drill has no Check mode, so every run is recorded
    // guided. Remove when Check mode lands there.
    evidence: "guided-accepted",
    order: 2,
    title: "Singles at sixteenths",
    summary: "The same two pads twice as dense, and doubles at eighths (density).",
    detail: "60 ms or less at 70 BPM.",
    href: "/music/play/mpc?mode=rudiment&pattern=single-16ths&sub=4&hits=16&bpm=70",
    links: [
      {
        label: "Doubles at eighths",
        href: "/music/play/mpc?mode=rudiment&pattern=double-strokes&sub=2&hits=16&bpm=70",
      },
    ],
    requires: ["M-B1"],
    skillIds: ["technique.mpc.single-strokes"],
    exerciseIds: ["technique.mpc.single-strokes"],
    minAttempts: 2,
    minSessions: 2,
  },
  {
    id: "M-B3",
    order: 3,
    title: "Kick, snare and hat in one bar",
    summary: "Copy back a one-bar groove on all three pads (coordination).",
    detail: "No omissions and no extras.",
    href: "/music/play/mpc?mode=groove&groove=backbeat&bpm=80",
    requires: ["M-B2"],
    skillIds: ["technique.mpc.groove.backbeat"],
    exerciseIds: ["technique.mpc.groove"],
  },
  {
    id: "M-I1",
    order: 4,
    title: "Two-bar boom bap",
    summary: "An open hat and an accented snare over two bars (length and voices).",
    detail: "1 omission at most, and the accents right on 6 of 8 snares (MIDI velocity only).",
    href: "/music/play/mpc?mode=groove&groove=boom-bap-2bar&bpm=80",
    requires: ["M-B3"],
    skillIds: ["technique.mpc.groove.boom-bap-2bar"],
    exerciseIds: ["technique.mpc.groove"],
  },
  {
    id: "M-I2",
    // The MPC rudiments drill has no Check mode, so every run is recorded
    // guided. Remove when Check mode lands there.
    evidence: "guided-accepted",
    order: 5,
    title: "Paradiddle at sixteenths",
    summary: "Paradiddle and moving accent against the click (density and coordination).",
    detail: "50 ms or less at 80 BPM.",
    href: "/music/play/mpc?mode=rudiment&pattern=paradiddle&sub=4&hits=16&bpm=80",
    links: [
      {
        // Authored practice for the same curriculum row, but the rudiment
        // exercise emits `technique.mpc.paradiddles` for the paradiddle only,
        // so this link does not itself move the step's check.
        label: "Moving accent",
        href: "/music/play/mpc?mode=rudiment&pattern=moving-accent&sub=4&hits=16&bpm=80",
      },
    ],
    requires: ["M-I1"],
    skillIds: ["technique.mpc.paradiddles"],
    exerciseIds: ["technique.mpc.single-strokes"],
  },
  {
    id: "M-I3",
    order: 6,
    title: "Ghost notes between the backbeats",
    summary: "The two-bar groove with quiet snares under it (dynamics).",
    detail: "Ghosts under 40% of the accent velocity, on a velocity-sensitive pad.",
    // Same groove and the same URL as M-I1: the MPC route has no ghost-band
    // setup to pass, so what separates this row is the velocity you play and
    // the second session it asks for.
    href: "/music/play/mpc?mode=groove&groove=boom-bap-2bar&bpm=80",
    requires: ["M-I2"],
    skillIds: ["technique.mpc.groove.boom-bap-2bar"],
    exerciseIds: ["technique.mpc.groove"],
    minSessions: 2,
  },
  {
    id: "M-A1",
    order: 7,
    title: "Four-bar piece with a fill",
    summary: "Three bars of groove and a turnaround fill (length and memory).",
    detail: "2 omissions at most over the four bars, with the fill in time.",
    href: "/music/play/mpc?mode=groove&groove=turnaround-fill&bpm=80",
    requires: ["M-I3"],
    skillIds: ["technique.mpc.groove.turnaround-fill"],
    exerciseIds: ["technique.mpc.groove"],
  },
  {
    id: "M-A2",
    order: 8,
    title: "The same piece, faster and from memory",
    summary: "Plus 8 BPM with the reference muted after bar 1 (tempo and memory).",
    detail: "Unaided, 2 omissions at most.",
    href: "/music/play/mpc?mode=groove&groove=turnaround-fill&bpm=88",
    requires: ["M-A1"],
    skillIds: ["technique.mpc.groove.turnaround-fill"],
    exerciseIds: ["technique.mpc.groove"],
    minSessions: 2,
  },
];

// Every step is scoped to its own instrument. Note that
// `instrumentsForApplicability` filters `only` against `VIEWABLE_INSTRUMENTS`,
// which has no `mpc` entry yet, so it answers "no instruments" for the MPC
// steps until the MPC gets an instrument view of its own. Nothing reads it on
// this path today; `buildLearningPath` uses `applies` only for the arpeggio
// note, which is false for all three paths.
export const INSTRUMENT_PATHS: Record<InstrumentPathId, LearningPathDefinition> = {
  guitar: {
    id: "guitar-path",
    title: "Guitar Path",
    subtitle:
      "Nine steps from open shapes to a lick in a new key. Each step raises one dimension and unlocks the next.",
    href: "/music/learn/path",
    steps: GUITAR_STEPS.map((step) => ({ ...step, applies: { only: ["guitar"] } })),
  },
  piano: {
    id: "piano-path",
    title: "Piano Path",
    subtitle:
      "Nine steps from one hand in C position to a sight-read two-hand phrase. Each step raises one dimension and unlocks the next.",
    href: "/music/learn/path",
    steps: PIANO_STEPS.map((step) => ({ ...step, applies: { only: ["piano"] } })),
  },
  mpc: {
    id: "mpc-path",
    title: "MPC Path",
    subtitle:
      "Eight steps from two pads on the click to a four-bar piece with a fill. Each step raises one dimension and unlocks the next.",
    href: "/music/learn/path",
    steps: MPC_STEPS.map((step) => ({ ...step, applies: { only: ["mpc"] } })),
  },
};

/** The §3 progression for one instrument, with its done count and next step. */
export function buildInstrumentPath(
  instrument: InstrumentPathId,
  opts: LearningPathOptions = {},
): LearningPath {
  return buildLearningPath(INSTRUMENT_PATHS[instrument].steps, opts);
}

/** True when this instrument has a §3 progression of its own. */
export function hasInstrumentPath(instrument: string): instrument is InstrumentPathId {
  return instrument in INSTRUMENT_PATHS;
}

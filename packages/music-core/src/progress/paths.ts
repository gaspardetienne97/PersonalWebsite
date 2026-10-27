// Learning paths (catalog 5.8): the five paths in one shape, on the new routes, with status
// from independent evidence only. `guided-accepted` is gone: every drill has a Check mode now.
import {
  isMasteryEligible,
  type Instrument,
  type Modality,
  type RunRecord,
  type ScoringEvent,
} from "../types";
import pathData from "../data/learning-paths.json";
import earData from "../data/ear-training.json";
import { EAR_ADDED_STEPS, EAR_TABLE_STEPS } from "../content/ear";
import jazzData from "../data/jazz.json";
import { SKILL_GRAPH, withDescendants, type SkillGraph } from "./graph";
import { dayKey } from "./rewards";
import {
  levelPath,
  shelfKey,
  songDays,
  type PathLevel,
  type RawLevelPath,
  type ShelfSong,
} from "./levels";
import guitarLevels from "../data/paths/guitar.json";
import ukuleleLevels from "../data/paths/ukulele.json";
import pianoLevels from "../data/paths/piano.json";
import jazzLevels from "../data/paths/jazz.json";
import aerophoneLevels from "../data/paths/aerophone.json";
import padsLevels from "../data/paths/pads.json";
import earLevels from "../data/paths/ear-theory.json";
import readingLevels from "../data/paths/reading.json";

export type PathId =
  | "ear"
  | "jazz"
  | "guitar"
  | "ukulele"
  | "piano"
  | "aerophone"
  | "mpc"
  | "reading"
  | "studio"
  | "theory";

export interface PathLink {
  label: string;
  href: string;
}

export interface PathStep {
  id: string;
  order: number;
  title: string;
  summary: string;
  detail?: string;
  /** new: waits for a drill or setting the app lacks (`needs`). */
  kind: "drill" | "reference" | "review" | "new";
  href: string;
  links: PathLink[];
  skillIds: string[];
  exerciseIds?: string[];
  modalities?: Modality[];
  minAttempts: number;
  minSessions: number;
  /** Distinct days with evidence, so a pass is confirmed cold on another day. */
  minDays: number;
  /** Mean credit of the recent attempts for done; the paths' usual 0.66 when missing. */
  threshold?: number;
  /** Only runs at or above this tempo count (the run's `bpm` param). */
  minBpm?: number;
  /** Only runs at least this hard count, so a step can ask for a harder setup. */
  minDifficulty?: number;
  requires: string[];
  /** Pinned to these instruments; evidence from another instrument does not count. */
  instruments?: Instrument[];
  /** Content applicability: melodic lines are pitched, voicings polyphonic. */
  content?: "pitched" | "polyphonic";
  /** Run params a run must carry for its attempts to count (a phrase, a pattern). */
  match?: Record<string, string>;
  /** One evidence row per value of a run param, each to pass (shapes A, D and E). */
  each?: { param: string; values: string[] };
  /** Levelled paths: the level, strand and what a new step waits for. */
  level?: string;
  strand?: string;
  needs?: string;
}

export interface LearningPath {
  id: PathId;
  title: string;
  subtitle: string;
  steps: PathStep[];
  benchmark?: string;
  levels?: PathLevel[];
}

export const DONE_THRESHOLD = pathData.doneThreshold;

// ---------------------------------------------------------------------------
// Old hrefs onto the new routes. Query parameters (the setup) are kept.

export const NEW_ROUTES = [
  "/music/ear/",
  "/music/reading",
  "/music/rhythm",
  "/music/scales",
  "/music/fretboard",
  "/music/chords",
  "/music/two-hand",
  "/music/pedal",
  "/music/comping",
  "/music/pads",
  "/music/aerophone",
  "/music/voicings",
  "/music/licks",
  "/music/phrases",
  "/music/chord-scales",
  "/music/jam",
  "/music/library",
  "/music/listening",
  "/music/circle",
] as const;

const PATH_MAP: Record<string, string> = {
  "/music/learn/reading": "/music/reading",
  "/music/learn/rhythm": "/music/rhythm",
  "/music/learn/aerophone": "/music/aerophone",
  "/music/learn/jazz": "/music/library?tab=reference",
  "/music/play/scales": "/music/scales",
  "/music/play/spider": "/music/fretboard",
  "/music/play/chord-perfect": "/music/chords",
  "/music/play/two-hand": "/music/two-hand",
  "/music/play/mpc": "/music/pads",
  "/music/play/voicings": "/music/voicings",
  "/music/play/licks": "/music/licks",
  "/music/play/chord-scales": "/music/chord-scales",
  "/music/jam": "/music/jam",
  "/music/library": "/music/library",
  "/music/listening": "/music/listening",
  "/music/circle": "/music/circle",
  "/music/scales": "/music/scales",
  "/music/voicings": "/music/voicings",
  "/music/pedal": "/music/pedal",
};

export function rewriteHref(href: string): string {
  const [path, query = ""] = href.split("?");
  const target = path.startsWith("/music/learn/ear/")
    ? path.replace("/music/learn/ear/", "/music/ear/")
    : PATH_MAP[path];
  if (!target) throw new Error(`No new route for ${href}`);
  const [newPath, newQuery = ""] = target.split("?");
  const q = new URLSearchParams(newQuery);
  for (const [k, v] of new URLSearchParams(query)) q.set(k, v);
  const qs = q.toString();
  return qs ? `${newPath}?${qs}` : newPath;
}

// ---------------------------------------------------------------------------
// Normalisation

interface RawStep {
  id: string;
  order: number;
  title: string;
  summary: string;
  detail?: string;
  kind?: string;
  href: string;
  links?: PathLink[];
  skillIds?: string[];
  skillId?: string;
  exerciseIds?: string[];
  modalities?: string[];
  minAttempts?: number;
  minSessions?: number;
  minDays?: number;
  threshold?: number;
  minBpm?: number;
  minDifficulty?: number;
  requires?: string[];
  applies?: string | { only?: string[] };
}

/** P-I4 and P-A1 open the comping route (catalog weakness 3) instead of the two-hand stand-in. */
const COMPING = (pattern: string) => `/music/comping?pattern=${pattern}&instrument=piano&bpm=90`;
const REFERENCE = (section: string) => `/music/library?tab=reference&section=${section}`;
const OVERRIDES: Record<string, Partial<PathStep>> = {
  "chord-symbols": { href: REFERENCE("vocabulary") },
  extensions: { href: REFERENCE("vocabulary") },
  "shell-voicings": { href: REFERENCE("voicings") },
  "P-I4": { kind: "drill", href: COMPING("blue-third-c7") },
  "P-A1": {
    kind: "drill",
    href: COMPING("blue-third-f7"),
    links: [{ label: "G7", href: COMPING("blue-third-g7") }],
  },
};

function normaliseStep(raw: RawStep): PathStep {
  const applies = raw.applies;
  const step: PathStep = {
    id: raw.id,
    order: raw.order,
    title: raw.title,
    summary: raw.summary,
    detail: raw.detail,
    kind: raw.kind === "reference" || raw.kind === "review" ? raw.kind : "drill",
    href: rewriteHref(raw.href),
    links: (raw.links ?? []).map((l) => ({ label: l.label, href: rewriteHref(l.href) })),
    skillIds: raw.skillIds ?? (raw.skillId ? [raw.skillId] : []),
    exerciseIds: raw.exerciseIds,
    modalities: raw.modalities as Modality[] | undefined,
    minAttempts: raw.minAttempts ?? 1,
    minSessions: raw.minSessions ?? 1,
    minDays: raw.minDays ?? 2,
    threshold: raw.threshold,
    minBpm: raw.minBpm,
    minDifficulty: raw.minDifficulty,
    requires: raw.requires ?? [],
    instruments: typeof applies === "object" ? (applies.only as Instrument[]) : undefined,
    content: applies === "pitched" || applies === "polyphonic" ? applies : undefined,
  };
  const merged = { ...step, ...OVERRIDES[raw.id] };
  return ADDED_LINKS[raw.id]
    ? {
        ...merged,
        links: [
          ...merged.links,
          ...ADDED_LINKS[raw.id].map((l) => ({ ...l, href: rewriteHref(l.href) })),
        ],
      }
    : merged;
}

// ---------------------------------------------------------------------------
// What the aural-skills research adds to the instrument paths: ear steps where a
// skill is about to be needed, and ear links beside the steps they support.

const PADS = (q: string) => `/music/play/mpc?${q}`;
const EAR = (drill: string, q: string) => `/music/learn/ear/${drill}?answer=choice&${q}`;
const ADDED_LINKS: Record<string, PathLink[]> = {
  "G-B1": [
    { label: "Major or minor by ear", href: EAR("chord-qualities", "qualities=major,minor") },
  ],
  "G-I3": [
    {
      label: "Pentatonics and blues by ear",
      href: EAR("scales", "scales=major-pentatonic,minor-pentatonic,blues"),
    },
  ],
  "G-A2": [
    {
      label: "Play a heard phrase back",
      href: "/music/learn/ear/melody-dictation?answer=play-back&level=major-pentachord",
    },
  ],
  "M-I3": [
    { label: "Funky Drummer", href: PADS("mode=groove&groove=funky-drummer&bpm=80") },
    { label: "Boom bap with ghosts", href: PADS("mode=groove&groove=ghost-boom-bap&bpm=80") },
  ],
  "P-I1": [{ label: "Inversions by ear", href: EAR("inversions", "inversions=root,first,second") }],
  "P-B3": [{ label: "Key signatures", href: "/music/circle?mode=signature&band=two&clefs=both" }],
  "P-I3": [
    { label: "Scales round the circle", href: "/music/library?tab=reference&section=circle" },
  ],
  "G-B3": [{ label: "The chords of a key", href: "/music/circle?mode=chords&band=two" }],
  "P-I2": [
    { label: "Follow the bass", href: EAR("bass-lines", "bassLevel=roots-primary") },
    { label: "I, IV, V progressions by ear", href: EAR("progressions", "functions=I,IV,V") },
  ],
  "P-I4": [
    { label: "The blues scale by ear", href: EAR("scales", "scales=major,minor-pentatonic,blues") },
    {
      label: "Sevenths by ear",
      href: EAR("chord-qualities", "qualities=major-7,dominant-7,minor-7"),
    },
  ],
  "chord-symbols": [
    {
      label: "Seventh chords by ear",
      href: EAR(
        "chord-qualities",
        "qualities=major-7,dominant-7,minor-7,half-diminished-7,diminished-7",
      ),
    },
  ],
  "chord-scales": [
    { label: "Modes by ear", href: EAR("scales", "scales=mixolydian,dorian,lydian,locrian") },
  ],
  "rootless-voicings": [
    {
      label: "ii-V-I moves counter-clockwise",
      href: "/music/library?tab=reference&section=circle",
    },
    {
      label: "ii7, V7, Imaj7 by ear",
      href: EAR("progressions", "functions=I,ii,V&chordSize=sevenths"),
    },
    {
      label: "iiø7, V7, i by ear",
      href: EAR("progressions", "functions=I,ii,V&chordSize=sevenths&keyMode=minor"),
    },
  ],
  improv: [
    {
      label: "Sing a phrase back",
      href: "/music/learn/ear/melody-dictation?answer=voice&level=major-pentachord",
    },
  ],
};

const ECHO = (level: string) => `/music/learn/rhythm?mode=echo&earLevel=${level}`;
const ADDED_STEPS: Partial<Record<PathId, RawStep[]>> = {
  mpc: [
    // Finger drumming, from the research (docs/research/finger-drumming.md).
    {
      id: "M-T1",
      order: 1.7,
      title: "Hold the tempo",
      summary: "Basic rock for four bars with the click, then eight bars on your own.",
      detail: "Three runs over two days within 3 BPM of the tempo, averaging 80% or higher.",
      href: PADS("mode=steady&steady=basic-rock&bpm=80"),
      exerciseIds: ["technique.mpc.steadiness"],
      skillIds: ["technique.mpc.steadiness"],
      minAttempts: 3,
      minSessions: 2,
      threshold: 0.8,
    },
    {
      id: "M-T2",
      order: 2.6,
      title: "Two-finger rolls",
      summary:
        "Index and middle alternating on one pad: sixteenths, then thirty-seconds and triplets for trap hats.",
      detail: "Three runs averaging 80% or higher.",
      href: PADS("mode=rudiment&pattern=finger-roll&hits=32&bpm=90"),
      links: [
        { label: "Thirty-seconds", href: PADS("mode=rudiment&pattern=roll-32&hits=32&bpm=70") },
        { label: "Triplets, 1/16T", href: PADS("mode=rudiment&pattern=roll-16t&hits=32&bpm=80") },
      ],
      exerciseIds: ["technique.mpc.single-strokes"],
      skillIds: ["technique.mpc.rolls"],
      minAttempts: 3,
      threshold: 0.8,
    },
    {
      id: "M-T3",
      order: 5.5,
      title: "Accents and ghosts",
      summary:
        "A sixteenth stream with the beat loud and the rest soft; then the accent moving through.",
      detail: "Three runs averaging 80% or higher, on velocity-sensitive pads (Full Level off).",
      href: PADS("mode=rudiment&pattern=accents-ghosts&hits=32&bpm=80"),
      links: [
        {
          label: "Moving accent",
          href: PADS("mode=rudiment&pattern=moving-accent&sub=4&hits=16&bpm=80"),
        },
      ],
      exerciseIds: ["technique.mpc.single-strokes"],
      skillIds: ["technique.mpc.accents"],
      minAttempts: 3,
      threshold: 0.8,
    },
    {
      id: "M-T4",
      order: 6.5,
      title: "Four kicks under one hat",
      summary: "The hats never change while the kick takes a new pattern every bar.",
      detail: "Three runs averaging 85% or higher.",
      href: PADS("mode=groove&groove=independence&bpm=75"),
      exerciseIds: ["technique.mpc.groove"],
      skillIds: ["technique.mpc.independence"],
      minAttempts: 3,
      threshold: 0.85,
    },
    {
      id: "M-T5",
      order: 7.5,
      title: "Swing by hand",
      summary: "Boom bap with the off-sixteenths late: 56%, then 62%, then the Dilla feel.",
      detail: "Three runs averaging 85% or higher; the results say the swing you played.",
      href: PADS("mode=groove&groove=swing-56&bpm=80"),
      links: [
        { label: "Swing 62%", href: PADS("mode=groove&groove=swing-62&bpm=80") },
        { label: "Dilla feel", href: PADS("mode=groove&groove=dilla&bpm=78") },
      ],
      exerciseIds: ["technique.mpc.groove"],
      skillIds: ["technique.mpc.swing"],
      minAttempts: 3,
      threshold: 0.85,
    },
    {
      id: "M-T6",
      order: 8.2,
      title: "House, trap and drum and bass",
      summary: "Four on the floor at 124, trap at 140 with its rolls, two-step at 172.",
      detail: "Three runs averaging 85% or higher.",
      href: PADS("mode=groove&groove=house&bpm=110"),
      links: [
        { label: "Trap", href: PADS("mode=groove&groove=trap-32&bpm=120") },
        { label: "Drum and bass", href: PADS("mode=groove&groove=dnb&bpm=140") },
      ],
      exerciseIds: ["technique.mpc.groove"],
      skillIds: ["technique.mpc.dance"],
      minAttempts: 3,
      threshold: 0.85,
    },
    {
      id: "M-T7",
      order: 8.4,
      title: "The breaks",
      summary: "The Amen break, all four bars, then Apache.",
      detail: "Three runs averaging 85% or higher.",
      href: PADS("mode=groove&groove=amen&bpm=110"),
      links: [{ label: "Apache", href: PADS("mode=groove&groove=apache&bpm=95") }],
      exerciseIds: ["technique.mpc.groove"],
      skillIds: ["technique.mpc.breaks"],
      minAttempts: 3,
      threshold: 0.85,
    },
    {
      id: "M-E1",
      order: 1.5,
      title: "Echo a bar on the pads",
      summary: "Hear a bar of quarters and eighths over the click, then play it back on a pad.",
      detail: "Five unaided echoes averaging 75% or higher.",
      href: ECHO("quarters-eighths"),
      exerciseIds: ["rhythm.echo"],
      skillIds: ["ear.rhythm-echo"],
      minAttempts: 5,
      threshold: 0.75,
    },
    {
      id: "M-E2",
      order: 2.5,
      title: "Echo sixteenths",
      summary: "Two bars with sixteenths in them: hear them, play them back.",
      detail: "Five unaided echoes at the sixteenths level or harder, averaging 75% or higher.",
      href: ECHO("sixteenths"),
      exerciseIds: ["rhythm.echo"],
      skillIds: ["ear.rhythm-echo"],
      minAttempts: 5,
      threshold: 0.75,
      minDifficulty: 0.67,
    },
    {
      id: "M-E3",
      order: 4.5,
      title: "Write a groove down",
      summary: "Hear a drum groove, then put its kick, snare and hats on the grid.",
      detail: "Five unaided groove dictations averaging 75% or higher.",
      href: "/music/learn/rhythm?mode=groove&grooveLevel=rock",
      links: [
        {
          label: "Kicks off the beat",
          href: "/music/learn/rhythm?mode=groove&grooveLevel=offbeats",
        },
        {
          label: "Sixteenths and ghost notes",
          href: "/music/learn/rhythm?mode=groove&grooveLevel=sixteenths",
        },
      ],
      exerciseIds: ["rhythm.groove-dictation"],
      skillIds: ["ear.groove-dictation"],
      minAttempts: 5,
      threshold: 0.75,
    },
    {
      id: "M-S1",
      order: 8.5,
      title: "Hear the kit in the mix",
      summary: "A drum loop with one band boosted: find it. The Studio ears path goes further.",
      detail: "Twenty unaided answers on five bands or more, averaging 70% or higher.",
      href: "/music/listening?exercise=peak&bands=5&material=drums",
      links: [
        { label: "How many dB louder", href: "/music/listening?exercise=level&material=drums" },
        { label: "How compressed", href: "/music/listening?exercise=compression&material=drums" },
        { label: "Delay time", href: "/music/listening?exercise=delay&material=drums" },
      ],
      exerciseIds: ["studio.peak"],
      skillIds: ["studio.eq-peak"],
      minAttempts: 20,
      threshold: 0.7,
      minDifficulty: 0.45,
    },
  ],
  guitar: [
    {
      id: "G-E1",
      order: 3.5,
      title: "Echo a strum rhythm",
      summary: "Hear two bars with dotted quarters and rests, then strum them back.",
      detail: "Five unaided echoes at the dotted level or harder, averaging 75% or higher.",
      href: ECHO("dotted"),
      exerciseIds: ["rhythm.echo"],
      skillIds: ["ear.rhythm-echo"],
      minAttempts: 5,
      threshold: 0.75,
      minDifficulty: 0.51,
    },
  ],
  piano: [
    {
      id: "P-E1",
      order: 8.5,
      title: "Spot the wrong note",
      summary:
        "Follow a written melody by ear and find the note played wrong, before sight-reading one.",
      detail: "Twenty unaided answers averaging 66% or higher.",
      href: "/music/learn/ear/wrong-note?level=major-diatonic",
      exerciseIds: ["ear.error-detection"],
      skillIds: ["ear.error-detection"],
      minAttempts: 20,
    },
    // The graded syllabi's other technique (ABRSM, RCM): chords through their
    // inversions from the first grades, arpeggios soon after.
    {
      id: "P-T1",
      order: 3.5,
      title: "Broken chords through the inversions",
      summary:
        "C major broken through root position, first and second inversion and back, one hand.",
      detail: "Three runs averaging 66% or higher.",
      href: "/music/scales?pattern=broken&chord=major&tonic=60&span=one-octave&motion=up-down&hands=right&perBeat=1&grade=&bpm=60",
      exerciseIds: ["technique.scale"],
      skillIds: ["technique.chord-inversions"],
      minAttempts: 3,
    },
    {
      id: "P-T3",
      order: 5.5,
      title: "Cadences in every key",
      summary:
        "I IV I V7 I with the root in the left hand, the right hand moving the shortest way, through all twelve keys.",
      detail: "Sixty chords (all twelve keys) averaging 80% or higher.",
      href: "/music/voicings?variant=cadence&key=0&keys=12",
      exerciseIds: ["voicing-drill"],
      skillIds: ["harmony.keyboard-cadences"],
      minAttempts: 60,
      threshold: 0.8,
    },
    {
      id: "P-T4",
      order: 6.7,
      title: "Legato pedal",
      summary:
        "I vi IV V twice: lift the sustain pedal just after each chord and press it straight back.",
      detail: "Three runs averaging 75% or higher (a sustain pedal plugged into the keyboard).",
      href: "/music/pedal?progression=I-vi-IV-V&key=0&rounds=2&bpm=60",
      exerciseIds: ["technique.pedal"],
      skillIds: ["technique.pedal"],
      minAttempts: 3,
      threshold: 0.75,
    },
    {
      id: "P-T2",
      order: 6.5,
      title: "Arpeggios, two octaves",
      summary: "The C major arpeggio over two octaves, up and down, each hand alone.",
      detail: "Three runs averaging 66% or higher.",
      href: "/music/scales?pattern=arpeggio&chord=major&tonic=60&span=two-octave&motion=up-down&hands=right&perBeat=1&grade=&bpm=72",
      exerciseIds: ["technique.scale"],
      skillIds: ["technique.arpeggios"],
      minAttempts: 3,
    },
  ],
};

// Studio ears: its own path (timbre and frequency memory, not pitch), in the
// research's order: 3 bands on noise, 5 then 9, loops, cuts, smaller gains,
// then boost or cut, level and pan, then compression and delay. Thresholds stay under the ~78% trained
// students reach on 9 bands of music (Marui and Kamekawa 2018).
// The circle of fifths, in the research's order (Open Music Theory, Levine,
// LearnMusicTheory.net): the order of sharps and flats, keys by how many
// accidentals both ways, signatures on the staff, relative minors, a key's
// chords, the circle from memory, then the circle on the instrument.
// Fluency is right and fast (recall, not working it out): 95% over 20
// prompts on two days.
const CIRCLE = (q: string) => `/music/circle?${q}`;
const THEORY_STEPS: RawStep[] = [
  {
    id: "T-1",
    order: 1,
    title: "The order of sharps and flats",
    summary:
      "F C G D A E B for sharps (Father Charles Goes Down And Ends Battle), backwards for flats.",
    detail: "Twenty prompts over two days, 95% right within 2 seconds.",
    href: CIRCLE("mode=order"),
    exerciseIds: ["theory.circle.order"],
    skillIds: ["theory.circle.order"],
    minAttempts: 20,
    minSessions: 2,
    threshold: 0.95,
  },
  {
    id: "T-2",
    order: 2,
    title: "Keys up to two sharps or flats",
    summary: "C, G, F, D and Bb: from the key to its count, and from the count to the key.",
    detail: "Twenty prompts over two days, 95% right within 2 seconds.",
    href: CIRCLE("mode=count&band=two"),
    links: [{ label: "Start with C, G and F", href: CIRCLE("mode=count&band=near") }],
    exerciseIds: ["theory.circle.count"],
    skillIds: ["theory.circle.count"],
    minAttempts: 20,
    minSessions: 2,
    threshold: 0.95,
    minDifficulty: 0.35,
  },
  {
    id: "T-3",
    order: 3,
    title: "Every key, both ways",
    summary: "Up to four, then all fifteen with the enharmonic keys, sharps and flats mixed.",
    detail: "Twenty prompts on all fifteen keys over two days, 95% right within 2 seconds.",
    href: CIRCLE("mode=count&band=all"),
    links: [{ label: "Up to four", href: CIRCLE("mode=count&band=four") }],
    exerciseIds: ["theory.circle.count"],
    skillIds: ["theory.circle.count"],
    minAttempts: 20,
    minSessions: 2,
    threshold: 0.95,
    minDifficulty: 0.75,
  },
  {
    id: "T-4",
    order: 4,
    title: "Read signatures on the staff",
    summary: "Name the key from its signature, treble clef first, then bass.",
    detail: "Twenty prompts on keys up to four over two days, 95% right within 3 seconds.",
    href: CIRCLE("mode=signature&band=four&clefs=treble"),
    links: [{ label: "Bass and treble", href: CIRCLE("mode=signature&band=all&clefs=both") }],
    exerciseIds: ["theory.circle.signature"],
    skillIds: ["theory.circle.signature"],
    minAttempts: 20,
    minSessions: 2,
    threshold: 0.95,
    minDifficulty: 0.55,
  },
  {
    id: "T-5",
    order: 5,
    title: "Neighbours and relative minors",
    summary:
      "One more sharp, one more flat, the relative minor a minor third down, and the key across.",
    detail: "Twenty prompts on keys up to four, 95% right within 2.5 seconds.",
    href: CIRCLE("mode=neighbours&band=four"),
    links: [{ label: "Minor keys' signatures", href: CIRCLE("mode=count&band=four&minor=both") }],
    exerciseIds: ["theory.circle.neighbours"],
    skillIds: ["theory.circle.neighbours"],
    minAttempts: 20,
    threshold: 0.95,
    minDifficulty: 0.55,
  },
  {
    id: "T-6",
    order: 6,
    title: "A key's chords",
    summary:
      "Read them off the wedge: IV, I and V outside, ii, vi and iii inside, vii° at the centre.",
    detail: "Twenty prompts on keys up to four, 95% right within 5 seconds.",
    href: CIRCLE("mode=chords&band=four"),
    exerciseIds: ["theory.circle.chords"],
    skillIds: ["theory.circle.chords"],
    minAttempts: 20,
    threshold: 0.95,
    minDifficulty: 0.55,
  },
  {
    id: "T-7",
    order: 7,
    title: "The circle from memory",
    summary: "A blank wheel: put each key in its place.",
    detail: "Twenty prompts on all fifteen keys, 95% right within 3 seconds.",
    href: CIRCLE("mode=wheel&band=all"),
    exerciseIds: ["theory.circle.wheel"],
    skillIds: ["theory.circle.wheel"],
    minAttempts: 20,
    threshold: 0.95,
    minDifficulty: 0.75,
  },
  {
    id: "T-8",
    order: 8,
    title: "Round the circle on your instrument",
    summary:
      "Scales clockwise from C (C G D A E share a fingering on piano); ii-V-I counter-clockwise, the way the changes move; chord changes by fourths on guitar.",
    kind: "reference",
    href: "/music/library?tab=reference&section=circle",
    links: [
      {
        label: "Scales",
        href: "/music/play/scales?scale=major&tonic=G4&instrument=piano&bpm=72&motion=up&span=one-octave&hands=both",
      },
      {
        label: "ii-V-I voicings",
        href: "/music/play/voicings?variant=major&instrument=piano&key=0&mode=check",
      },
      {
        label: "Chord changes",
        href: "/music/play/chord-perfect?mode=changes&instrument=guitar&tuning=guitar.standard&shape=guitar.c-major&to=guitar.f-major&timed=1&bpm=60&clock=4",
      },
    ],
  },
];

const L = (q: string) => `/music/listening?${q}`;
const STUDIO_STEPS: RawStep[] = [
  {
    id: "S-1",
    order: 1,
    title: "Three bands on pink noise",
    summary: "250 Hz, 1 kHz or 4 kHz, boosted 12 dB. Flip Flat and Changed as often as you like.",
    detail: "Ten unaided answers at 90% or higher.",
    href: L("exercise=peak&bands=3&gain=12&material=noise"),
    exerciseIds: ["studio.peak"],
    skillIds: ["studio.eq-peak"],
    minAttempts: 10,
    threshold: 0.9,
  },
  {
    id: "S-2",
    order: 2,
    title: "Five bands, then nine",
    summary: "More bands, still 12 dB on noise. Nine is every octave from 63 Hz to 16 kHz.",
    detail: "Twenty unaided answers on five bands or more, at 80% or higher.",
    href: L("exercise=peak&bands=5&gain=12&material=noise"),
    links: [{ label: "All nine octaves", href: L("exercise=peak&bands=9&gain=12&material=noise") }],
    exerciseIds: ["studio.peak"],
    skillIds: ["studio.eq-peak"],
    minAttempts: 20,
    threshold: 0.8,
    minDifficulty: 0.4,
  },
  {
    id: "S-3",
    order: 3,
    title: "Nine bands on loops",
    summary:
      "The drum loop, then the band loop. Music is harder than noise; an octave off counts half.",
    detail: "Twenty unaided answers on nine bands over a loop, at 70% or higher.",
    href: L("exercise=peak&bands=9&gain=12&material=drums"),
    links: [{ label: "The band loop", href: L("exercise=peak&bands=9&gain=12&material=music") }],
    exerciseIds: ["studio.peak"],
    skillIds: ["studio.eq-peak"],
    minAttempts: 20,
    threshold: 0.7,
    minDifficulty: 0.65,
  },
  {
    id: "S-4",
    order: 4,
    title: "Find the cut",
    summary: "A band cut by 12 dB: harder than a boost, since you listen for what is missing.",
    detail: "Twenty unaided answers on nine bands, at 70% or higher.",
    href: L("exercise=cut&bands=9&gain=12&material=noise"),
    links: [{ label: "On the band loop", href: L("exercise=cut&bands=9&gain=12&material=music") }],
    exerciseIds: ["studio.cut"],
    skillIds: ["studio.eq-cut"],
    minAttempts: 20,
    threshold: 0.7,
    minDifficulty: 0.6,
  },
  {
    id: "S-5",
    order: 5,
    title: "Smaller boosts",
    summary: "6 dB, then 3 dB: closer to the moves made in a real mix.",
    detail: "Twenty unaided answers on nine bands at 6 dB or less, at 70% or higher.",
    href: L("exercise=peak&bands=9&gain=6&material=drums"),
    links: [{ label: "3 dB", href: L("exercise=peak&bands=9&gain=3&material=drums") }],
    exerciseIds: ["studio.peak"],
    skillIds: ["studio.eq-peak"],
    minAttempts: 20,
    threshold: 0.7,
    minDifficulty: 0.75,
  },
  {
    id: "S-6",
    order: 6,
    title: "Boost or cut, level and pan",
    summary:
      "Boost or cut at matched loudness, how many dB louder, and where it sits in the stereo field.",
    detail: "Ten unaided answers each, at 80% or higher.",
    href: L("exercise=boost-or-cut&gain=6&material=music"),
    links: [
      { label: "How many dB", href: L("exercise=level&levels=6,3,2&material=music") },
      { label: "Pan position", href: L("exercise=pan&pans=5&material=music") },
    ],
    exerciseIds: ["studio.boost-or-cut", "studio.level", "studio.pan"],
    skillIds: ["studio.boost-or-cut", "studio.level", "studio.pan"],
    minAttempts: 10,
    threshold: 0.8,
  },
  {
    id: "S-7",
    order: 7,
    title: "Compression and delay",
    summary:
      "How hard a drum loop is squashed (at matched loudness), and how long its echo is in note values.",
    detail: "Ten unaided answers each, at 75% or higher.",
    href: L("exercise=compression&material=drums"),
    links: [
      { label: "Delay time", href: L("exercise=delay&material=drums") },
      { label: "With dotted 1/8", href: L("exercise=delay&delays=4&material=music") },
    ],
    exerciseIds: ["studio.compression", "studio.delay"],
    skillIds: ["studio.compression", "studio.delay"],
    minAttempts: 10,
    threshold: 0.75,
  },
];

const path = (id: PathId, title: string, subtitle: string, steps: RawStep[]): LearningPath => ({
  id,
  title,
  subtitle,
  // Sorted, then numbered 1, 2, 3 (steps the app adds sit between the table's).
  steps: steps
    .map(normaliseStep)
    .sort((a, b) => a.order - b.order)
    .map((s, i) => ({ ...s, order: i + 1 })),
});

const { guitar, piano, mpc } = pathData.paths;
const ear = earData.learningPathDefinition;

/** The path each instrument follows (the Paths tab's default and Today's focus block). */
export const PATH_FOR_INSTRUMENT: Record<Instrument, PathId> = {
  piano: "piano",
  guitar: "guitar",
  ukulele: "ukulele",
  mpc: "mpc",
  aerophone: "aerophone",
  voice: "ear",
};

/** Round-2 paths (data/paths/*.json); a path whose file has no levels yet keeps its old steps. */
const levelled = (raw: unknown, old?: LearningPath): LearningPath => {
  const r = raw as RawLevelPath;
  return r.levels.length || !old ? levelPath(r) : old;
};

const OLD = {
  ear: path("ear", ear.title, ear.subtitle, [
    ...(EAR_TABLE_STEPS as RawStep[]),
    ...(EAR_ADDED_STEPS as RawStep[]),
  ]),
  jazz: path(
    "jazz",
    "Jazz Path",
    "Ten lessons from intervals to a Real Book, built on the ii-V-I.",
    jazzData.JAZZ_CURRICULUM as RawStep[],
  ),
  guitar: path("guitar", guitar.title, guitar.subtitle, [
    ...(guitar.steps as RawStep[]),
    ...ADDED_STEPS.guitar!,
  ]),
  piano: path("piano", piano.title, piano.subtitle, [
    ...(piano.steps as RawStep[]),
    ...ADDED_STEPS.piano!,
  ]),
  mpc: path("mpc", mpc.title, mpc.subtitle, [...(mpc.steps as RawStep[]), ...ADDED_STEPS.mpc!]),
};

export const LEARNING_PATHS: Record<PathId, LearningPath> = {
  guitar: levelled(guitarLevels, OLD.guitar),
  ukulele: levelled(ukuleleLevels),
  piano: levelled(pianoLevels, OLD.piano),
  jazz: levelled(jazzLevels, OLD.jazz),
  aerophone: levelled(aerophoneLevels),
  mpc: levelled(padsLevels, OLD.mpc),
  ear: levelled(earLevels, OLD.ear),
  reading: levelled(readingLevels),
  theory: path(
    "theory",
    "Circle of Fifths Path",
    "Key signatures and the circle, until they come from memory: right and fast, then round the circle on your instrument.",
    THEORY_STEPS,
  ),
  studio: path(
    "studio",
    "Studio Ears Path",
    "Hear EQ, level and pan the way a producer does: noise first, then loops, smaller moves last.",
    STUDIO_STEPS,
  ),
};

// ---------------------------------------------------------------------------
// Status

/** review: not passed itself, but a later step that needs it is done (tested out). */
export type StepStatus =
  | "todo"
  | "not-assessed"
  | "in-progress"
  | "done"
  | "review"
  | "locked"
  | "next";

export interface SkillEvidence {
  skillId: string;
  attempts: number;
  sessions: number;
  days: number;
  /** Mean credit of the recent attempts, the ones a pass is judged on. */
  mean: number;
  done: boolean;
}

export interface StepProgress {
  step: PathStep;
  status: StepStatus;
  evidence: SkillEvidence[];
  /** Open, and the recent attempts already pass: at most one attempt short, or only sessions or days missing. */
  almost: boolean;
}

export interface LevelProgress {
  level: PathLevel;
  /** Graded steps done or tested out, out of graded steps. */
  done: number;
  total: number;
  /** Each shelf song with its days of passing performances. */
  songs: { song: ShelfSong; key: string; days: number; played: boolean }[];
  played: number;
  passed: boolean;
}

export interface PathProgress {
  path: LearningPath;
  steps: StepProgress[];
  levels?: LevelProgress[];
  /** The first level not passed. */
  currentLevel?: string;
  /** Steps with skills that are done or tested out, out of steps with skills. */
  done: number;
  total: number;
  continueHref?: string;
}

/** Attempts a pass is judged on: the latest few, so old misses stop counting once you improve. */
export const recentWindow = (step: PathStep) => Math.max(step.minAttempts, 3);

const meetsMean = (step: PathStep, mean: number) => mean >= (step.threshold ?? DONE_THRESHOLD);

/** A step with evidence to judge: named skills, or a levelled step's drill. */
export const isGraded = (step: PathStep) =>
  step.skillIds.length > 0 || (step.level !== undefined && !!step.exerciseIds?.length);

function stepEvidence(
  step: PathStep,
  events: ScoringEvent[],
  graph: SkillGraph,
  runOf: Map<string, RunRecord>,
): SkillEvidence[] {
  const bpm = (e: ScoringEvent) => Number(runOf.get(e.runId ?? "")?.params.bpm ?? 0) || 0;
  const param = (e: ScoringEvent, k: string) => String(runOf.get(e.runId ?? "")?.params[k] ?? "");
  const matches = (e: ScoringEvent) =>
    !step.match || Object.entries(step.match).every(([k, v]) => param(e, k) === v);
  const eligible = events.filter(
    (e) =>
      isMasteryEligible(e) &&
      (!step.modalities || step.modalities.includes(e.modality)) &&
      (!step.exerciseIds || step.exerciseIds.includes(e.exerciseId)) &&
      (!step.instruments || !e.instrument || step.instruments.includes(e.instrument)) &&
      e.difficulty >= (step.minDifficulty ?? 0) - 1e-9 &&
      (step.minBpm === undefined || bpm(e) >= step.minBpm - 1e-9) &&
      matches(e),
  );
  // A levelled step without named skills is judged on its drill as a whole, or per `each` value.
  const keys = step.each
    ? step.each.values.map((v) => `${step.each!.param}=${v}`)
    : step.skillIds.length
      ? step.skillIds
      : isGraded(step)
        ? ["drill"]
        : [];
  return keys.map((skillId) => {
    const ev = step.each
      ? eligible.filter((e) => `${step.each!.param}=${param(e, step.each!.param)}` === skillId)
      : skillId === "drill"
        ? eligible
        : eligible.filter((e) =>
            e.skillIds.some((id) => withDescendants(skillId, graph).includes(id)),
          );
    const recent = [...ev].sort((a, b) => a.at - b.at).slice(-recentWindow(step));
    const attempts = ev.length;
    const sessions = new Set(ev.map((e) => e.sessionId)).size;
    const days = new Set(ev.map((e) => dayKey(e.at))).size;
    const mean = recent.length
      ? recent.reduce((sum, e) => sum + e.partialCredit, 0) / recent.length
      : 0;
    return {
      skillId,
      attempts,
      sessions,
      days,
      mean,
      done:
        attempts >= step.minAttempts &&
        sessions >= step.minSessions &&
        days >= step.minDays &&
        meetsMean(step, mean),
    };
  });
}

/**
 * done: every skill has minAttempts independent attempts over minSessions sessions and minDays
 * days, and the latest attempts (recentWindow) average at least the threshold; a step with a
 * tempo counts only runs at that tempo or faster (`runs` supplies each run's bpm). A step that a
 * done step needs, directly or further back, is "review". Steps without skills are "todo" and
 * never lock or block anything. "next" is the lowest-order open, unlocked step.
 */
export function pathProgress(
  path: LearningPath,
  events: ScoringEvent[],
  graph: SkillGraph = SKILL_GRAPH,
  runs: RunRecord[] = [],
): PathProgress {
  const runOf = new Map(runs.map((r) => [r.id, r]));
  const base = new Map<string, { status: StepStatus; evidence: SkillEvidence[] }>();
  for (const step of path.steps) {
    const evidence = stepEvidence(step, events, graph, runOf);
    const status: StepStatus = !isGraded(step)
      ? "todo"
      : evidence.every((e) => e.done)
        ? "done"
        : evidence.some((e) => e.attempts > 0)
          ? "in-progress"
          : "not-assessed";
    base.set(step.id, { status, evidence });
  }
  const open = (s?: StepStatus) => s === "not-assessed" || s === "in-progress";
  const byId = new Map(path.steps.map((s) => [s.id, s]));
  const testedOut = (id: string, seen = new Set<string>()): void => {
    for (const r of byId.get(id)?.requires ?? []) {
      if (seen.has(r)) continue;
      seen.add(r);
      const b = base.get(r);
      if (b && open(b.status)) b.status = "review";
      testedOut(r, seen);
    }
  };
  for (const step of path.steps) if (base.get(step.id)!.status === "done") testedOut(step.id);
  let nextFound = false;
  const steps = path.steps.map((step): StepProgress => {
    const { status, evidence } = base.get(step.id)!;
    const almost =
      open(status) &&
      evidence.every(
        (e) => e.attempts > 0 && e.attempts >= step.minAttempts - 1 && meetsMean(step, e.mean),
      );
    if (!open(status)) return { step, status, evidence, almost };
    if (step.requires.some((r) => open(base.get(r)?.status)))
      return { step, status: "locked", evidence, almost };
    if (nextFound) return { step, status, evidence, almost };
    nextFound = true;
    return { step, status: "next", evidence, almost };
  });
  const graded = steps.filter((s) => isGraded(s.step));
  const passedStep = (s: StepProgress) => s.status === "done" || s.status === "review";
  const plays = path.levels ? songDays(path, runs) : new Map<string, number>();
  const levels = path.levels?.map((level): LevelProgress => {
    const mine = graded.filter((s) => s.step.level === level.id);
    const songs = level.shelf.map((song) => {
      const key = shelfKey(path.id, song);
      const days = plays.get(key) ?? 0;
      return { song, key, days, played: days >= 2 };
    });
    const played = songs.filter((x) => x.played).length;
    const done = mine.filter(passedStep).length;
    return {
      level,
      done,
      total: mine.length,
      songs,
      played,
      passed: done === mine.length && played >= Math.min(level.pick, songs.length),
    };
  });
  return {
    path,
    steps,
    levels,
    currentLevel: levels?.find((l) => !l.passed)?.level.id,
    done: graded.filter(passedStep).length,
    total: graded.length,
    continueHref: steps.find((s) => s.status === "next")?.step.href,
  };
}

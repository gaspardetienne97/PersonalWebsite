// Canonical catalog of practice drills + hub entries, shared by the Practice /
// Library / Create hubs and (later) the ⌘K command palette. One source of truth
// so a drill is defined once and surfaced in many containers.
import BookOpen from "lucide-svelte/icons/book-open";
import Disc from "lucide-svelte/icons/disc";
import Drum from "lucide-svelte/icons/drum";
import Dumbbell from "lucide-svelte/icons/dumbbell";
import Ear from "lucide-svelte/icons/ear";
import FlaskConical from "lucide-svelte/icons/flask-conical";
import Grid3x3 from "lucide-svelte/icons/grid-3x3";
import Guitar from "lucide-svelte/icons/guitar";
import Hand from "lucide-svelte/icons/hand";
import Library from "lucide-svelte/icons/library";
import ListMusic from "lucide-svelte/icons/list-music";
import Music from "lucide-svelte/icons/music";
import Piano from "lucide-svelte/icons/piano";
import SlidersHorizontal from "lucide-svelte/icons/sliders-horizontal";
import Upload from "lucide-svelte/icons/upload";
import WandSparkles from "lucide-svelte/icons/wand-sparkles";
import Wind from "lucide-svelte/icons/wind";
import type { Component } from "svelte";

import { EAR_TRAINING_DRILLS, earTrainingDrillHref } from "@repo/music-core/engines/ear-training";

export type DrillSkill = "Ear" | "Reading" | "Rhythm" | "Harmony" | "Technique" | "Play";

// Card cover-band hue keys — one per /music theme token family registered in
// app.css (skill-* and instr-*). Typed so a typo at a call site is a check
// error instead of a silently blank gradient band.
export type Hue =
  | "ear"
  | "rhythm"
  | "harmony"
  | "reading"
  | "technique"
  | "piano"
  | "guitar"
  | "ukulele"
  | "aerophone"
  | "mpc"
  | "voice";

export const DRILL_SKILLS: DrillSkill[] = [
  "Ear",
  "Reading",
  "Rhythm",
  "Harmony",
  "Technique",
  "Play",
];

export interface CatalogItem {
  href: string;
  title: string;
  description: string;
  meta: string;
  action: string;
  icon: Component;
}

export interface DrillItem extends CatalogItem {
  skill: DrillSkill;
  /** Instruments this drill targets (for the instrument filter + hue). Empty = any. */
  instruments: string[];
  /** Cross-cutting style/genre tags (e.g. "jazz") for the Drills filter. */
  tags?: string[];
}

/** Every practice drill, surfaced in Practice ▸ Drills (filterable by skill + instrument). */
export const DRILLS: DrillItem[] = [
  // Every ear drill is its own card; the Ear Training Path (PATHS) orders them.
  ...EAR_TRAINING_DRILLS.map(
    (drill): DrillItem => ({
      href: earTrainingDrillHref(drill.slug),
      title: drill.title,
      description: drill.description,
      skill: "Ear",
      instruments: [],
      meta: "Listening",
      action: `Start ${drill.title.toLowerCase()}`,
      icon: Ear,
    }),
  ),
  {
    href: "/music/learn/reading",
    title: "Note Reading",
    description: "Read staff notation and connect it to piano keys, strings, and frets.",
    skill: "Reading",
    instruments: ["piano", "guitar", "ukulele"],
    meta: "Notation",
    action: "Open reading trainer",
    icon: BookOpen,
  },
  {
    href: "/music/learn/rhythm",
    title: "Rhythm Trainer",
    description:
      "Lock quarter-note pulse to the metronome and review ahead/behind timing feedback.",
    skill: "Rhythm",
    instruments: [],
    meta: "Timing",
    action: "Start rhythm practice",
    icon: Drum,
  },
  {
    href: "/music/play/scales",
    title: "Scales & Technique",
    description:
      "Play any scale — major, the modes, or jazz (altered, bebop, diminished) — evenly at a tempo target; clean runs unlock the next rung.",
    skill: "Technique",
    instruments: ["piano"],
    tags: ["jazz"],
    meta: "Technique",
    action: "Practice scales",
    icon: Dumbbell,
  },
  {
    href: "/music/play/spider",
    title: "Spider Drill",
    description:
      "The 1-2-3-4 chromatic fretting-hand pattern on one string, graded for clean, even notes.",
    skill: "Technique",
    instruments: ["guitar", "ukulele"],
    meta: "Technique",
    action: "Start spider drill",
    icon: SlidersHorizontal,
  },
  {
    href: "/music/play/two-hand",
    title: "Two-Hand Independence",
    description:
      "Left hand holds a steady pulse while the right runs a scale line — each hand graded.",
    skill: "Technique",
    instruments: ["piano"],
    meta: "Technique",
    action: "Start coordination drill",
    icon: Hand,
  },
  {
    href: "/music/play/mpc",
    title: "MPC Rudiments",
    description:
      "Alternating single-stroke roll between two pads, graded on order, timing, and velocity.",
    skill: "Technique",
    instruments: ["mpc"],
    meta: "Technique",
    action: "Start rudiments",
    icon: Drum,
  },
  {
    href: "/music/learn/aerophone",
    title: "Aerophone Technique",
    description:
      "Breath long-tones, dynamic swells, articulation, and fingerings with CC2 feedback.",
    skill: "Technique",
    instruments: ["aerophone"],
    meta: "Wind",
    action: "Open fingerings",
    icon: Wind,
  },
  {
    href: "/music/learn/aerophone?mode=articulation",
    title: "Articulation",
    description: "Tongue a note staccato vs legato, graded on note durations and the breath curve.",
    skill: "Technique",
    instruments: ["aerophone"],
    meta: "Wind",
    action: "Start articulation",
    icon: Wind,
  },
  {
    href: "/music/play/chord-perfect",
    title: "Chord-Perfect",
    description:
      "Fret a chord and sound each string low→high; only perfect if every string is clean.",
    skill: "Harmony",
    instruments: ["guitar", "ukulele"],
    meta: "Harmony",
    action: "Start chord drill",
    icon: Guitar,
  },
  {
    href: "/music/play/chord-progression",
    title: "Chord Progression",
    description: "Strum a known progression in time while the mic follows and grades each change.",
    skill: "Harmony",
    instruments: ["guitar", "ukulele"],
    meta: "Harmony",
    action: "Start progression",
    icon: Guitar,
  },
  {
    href: "/music/play/voicings",
    title: "ii-V-I Voicings",
    description: "Play jazz voicings across all 12 keys — rootless, minor, and altered variants.",
    skill: "Harmony",
    instruments: ["piano"],
    tags: ["jazz"],
    meta: "Harmony",
    action: "Start voicing drill",
    icon: Piano,
  },
  {
    href: "/music/play/licks",
    title: "Jazz Licks",
    description:
      "Hear a transcribed ii-V-I line, then play it back — graded note-by-note against the phrase.",
    skill: "Play",
    instruments: ["piano"],
    tags: ["jazz"],
    meta: "Vocabulary",
    action: "Start licks drill",
    icon: Music,
  },
  {
    href: "/music/play/chord-scales",
    title: "Chord-Scale Drill",
    description:
      "As a ii-V-I moves, play the go-to scale for each chord — Dorian, Mixolydian, Ionian — graded note-by-note.",
    skill: "Harmony",
    instruments: ["piano"],
    tags: ["jazz"],
    meta: "Harmony",
    action: "Start chord-scale drill",
    icon: Music,
  },
  {
    href: "/music/play",
    title: "Free Play",
    description:
      "Record everything you play over an optional backing track, with synchronized audio takes.",
    skill: "Play",
    instruments: [],
    meta: "Capture",
    action: "Open the lab",
    icon: FlaskConical,
  },
  {
    href: "/music/jam",
    title: "Jam / Improv",
    description:
      "Solo over a ii-V-I, minor ii-V-i, blues, or modal vamp with chord/scale target tones lit up — a swing backing by default.",
    skill: "Play",
    instruments: [],
    tags: ["jazz"],
    meta: "Improv",
    action: "Start jamming",
    icon: WandSparkles,
  },
];

/** Guided curricula — Practice ▸ Paths. */
export const PATHS: CatalogItem[] = [
  {
    href: "/music/learn/ear",
    title: "Ear Training Path",
    description:
      "Six steps: anchor the tonic, map the degrees, sing or play them back, transfer into melodies, add chromatic colour, then attach harmony and interval labels. Each step opens one ear drill with its setup.",
    meta: "Listening",
    action: "Open ear path",
    icon: Ear,
  },
  {
    href: "/music/learn/path",
    title: "Jazz Path",
    description:
      "A guided, in-order path: intervals → chords → scales → voicings → the graded ii-V-I drill → improv. Tracked by your real skill progress.",
    meta: "Guided",
    action: "Open the path",
    icon: Music,
  },
];

/** Repertoire + reference — the Library hub. */
export const LIBRARY_ITEMS: CatalogItem[] = [
  {
    href: "/music/library?tab=songs",
    title: "Songs",
    description: "Your saved repertoire. Open a song to practice it with the score follower.",
    meta: "Repertoire",
    action: "Browse songs",
    icon: ListMusic,
  },
  {
    href: "/music/library?tab=reference",
    title: "Chord & Scale Reference",
    description: "Explore and hear chords and scales across piano, guitar, ukulele, and aerophone.",
    meta: "Reference",
    action: "Open reference",
    icon: Library,
  },
  {
    href: "/music/learn/jazz",
    title: "Jazz Piano Guide",
    description:
      "Jazz reference: chord symbols, chord-scale theory, rootless ii-V-I voicings, 29 licks, and standards.",
    meta: "Reference",
    action: "Open the guide",
    icon: Piano,
  },
  {
    href: "/music/library?tab=import",
    title: "Import",
    description: "Bring in MIDI or MusicXML files locally and save them to your repertoire.",
    meta: "Import",
    action: "Import a file",
    icon: Upload,
  },
  {
    href: "/music/library?tab=import&mode=transcribe",
    title: "Transcribe",
    description: "Turn an audio file into a playable score with in-browser Basic Pitch.",
    meta: "Audio → MIDI",
    action: "Transcribe audio",
    icon: Music,
  },
];

/** Creation tools — the Create hub. */
export const CREATE_ITEMS: CatalogItem[] = [
  {
    href: "/music/create?mode=beat",
    title: "Studio",
    description: "A 16-step drum sequencer with sample-kit loading and MPC kit export.",
    meta: "Beats",
    action: "Open the sequencer",
    icon: Grid3x3,
  },
  {
    href: "/music/create?mode=piano-roll",
    title: "Piano Roll",
    description: "A multitrack note editor — sketch parts, then play or export MIDI/WAV.",
    meta: "Melodic",
    action: "Open piano roll",
    icon: Piano,
  },
  {
    href: "/music/create?mode=recorder",
    title: "Recording",
    description: "Capture MIDI and audio takes, compare them, and export.",
    meta: "Capture",
    action: "Open recorder",
    icon: Disc,
  },
];

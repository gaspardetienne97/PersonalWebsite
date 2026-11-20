// The finger-drumming repertoire: grooves in six levels, from the research
// (Melodics' structure, Ethan Hein's transcriptions, Roger Linn on swing;
// docs/research/finger-drumming.md, local). Patterns are step grids, never
// recordings. Each level has a timing tier (perfect and good windows that
// tighten as the levels rise), each groove a start and a target tempo for the
// tempo ladder, and the fingers to play it with.

import { GROOVES } from "./winds-pads";
import { gridGroove } from "./pads-grid";
import type { GrooveDef } from "../data";
import { m } from "@repo/i18n/messages.js";

export type GrooveTopic =
  | "basics"
  | "hiphop"
  | "ghosts"
  | "independence"
  | "fills"
  | "swing"
  | "dance"
  | "breaks"
  | "latin"
  | "phrases"
  | "shuffle"
  | "meter";

export interface RepertoireGroove {
  groove: GrooveDef;
  level: number;
  style: string;
  topic: GrooveTopic;
  bpm: { start: number; target: number };
  /** MPC swing, 50 straight to 75. */
  swing?: number;
  /** What makes it what it is. */
  feel: string;
  /** Hands and fingers to start with. */
  fingers: string;
}

/** Timing windows per tier (ms): a proposal from the research (pro drummers sit 1 to 10 ms off a click). */
export const TIERS = {
  beginner: { perfect: 35, good: 70 },
  intermediate: { perfect: 25, good: 50 },
  advanced: { perfect: 15, good: 35 },
} as const;
export type Tier = keyof typeof TIERS;

export const PAD_LEVELS: { level: number; title: string; tier: Tier; summary: string }[] = [
  {
    level: 1,
    title: m.music_rep_padrep_level1_title(),
    tier: "beginner",
    summary: m.music_rep_padrep_level1_summary(),
  },
  {
    level: 2,
    title: m.music_rep_padrep_level2_title(),
    tier: "beginner",
    summary: m.music_rep_padrep_level2_summary(),
  },
  {
    level: 3,
    title: m.music_rep_padrep_level3_title(),
    tier: "intermediate",
    summary: m.music_rep_padrep_level3_summary(),
  },
  {
    level: 4,
    title: m.music_rep_padrep_level4_title(),
    tier: "intermediate",
    summary: m.music_rep_padrep_level4_summary(),
  },
  {
    level: 5,
    title: m.music_rep_padrep_level5_title(),
    tier: "advanced",
    summary: m.music_rep_padrep_level5_summary(),
  },
  {
    level: 6,
    title: m.music_rep_padrep_level6_title(),
    tier: "advanced",
    summary: m.music_rep_padrep_level6_summary(),
  },
  {
    level: 7,
    title: m.music_rep_padrep_level7_title(),
    tier: "advanced",
    summary: m.music_rep_padrep_level7_summary(),
  },
  {
    level: 8,
    title: m.music_rep_padrep_level8_title(),
    tier: "advanced",
    summary: m.music_rep_padrep_level8_summary(),
  },
];

/**
 * A style's name to show. `style` stays English: it picks the backing band
 * (src/lib/music/drills/pads/backing.ts), so translate only where it is displayed.
 */
const STYLE_LABELS: Record<string, () => string> = {
  "Rock break": m.music_rep_padrep_style_rock_break,
  "Funk break": m.music_rep_padrep_style_funk_break,
  Independence: m.music_rep_padrep_style_independence,
  "Body percussion": m.music_rep_padrep_style_body_percussion,
  "Rudiment phrase": m.music_rep_padrep_style_rudiment_phrase,
  "Tag ending": m.music_rep_padrep_style_tag_ending,
  "Linear phrase": m.music_rep_padrep_style_linear_phrase,
  "Dance build": m.music_rep_padrep_style_dance_build,
  "Linear funk": m.music_rep_padrep_style_linear_funk,
  "Odd meter": m.music_rep_padrep_style_odd_meter,
  Kompa: m.music_rep_padrep_style_kompa,
};
export const padStyleLabel = (style: string): string => STYLE_LABELS[style]?.() ?? style;

const SPLIT = m.music_rep_padrep_fingers_split();
const EIGHTHS = "x.x.x.x.x.x.x.x.";
const BACKBEAT = "....X.......X...";
const table = (id: string) => GROOVES.find((g) => g.value === id)!;
const SHUFFLE_HATS = "x.xx.xx.xx.x";

/**
 * A linear groove from one line, no two voices at once: K kick, H hat,
 * S snare accent, s ghost snare, "." rest.
 */
function linear(value: string, label: string, line: string): GrooveDef {
  const lane = (c: string, as = "x") => line.replace(/./g, (x) => (x === c ? as : "."));
  const snare = [...line].map((x) => (x === "S" ? "X" : x === "s" ? "g" : ".")).join("");
  return gridGroove(value, label, { kick: lane("K"), snare, hats: lane("H") });
}

/** A groove whose snare sits early by `ms` at the target tempo (the Dilla push). */
function pushSnare(g: GrooveDef, ms: number, bpm: number): GrooveDef {
  const beats = ms / (60000 / bpm);
  return {
    ...g,
    targets: g.targets.map((t) => (t.voice === "snare" ? { ...t, beat: t.beat - beats } : t)),
  };
}

/** Extra hits at finer values than sixteenths (trap rolls): `per` notes a beat from `from` for `count`. */
function roll(g: GrooveDef, voice: "hats", from: number, per: number, count: number): GrooveDef {
  const extra = Array.from({ length: count }, (_, i) => ({
    voice,
    beat: from + i / per,
    accent: i === 0 ? ("accent" as const) : ("normal" as const),
  }));
  const kept = g.targets.filter(
    (t) => !(t.voice === voice && t.beat >= from - 1e-6 && t.beat < from + count / per - 1e-6),
  );
  return { ...g, targets: [...kept, ...extra].sort((a, b) => a.beat - b.beat) };
}

export const PAD_REPERTOIRE: RepertoireGroove[] = [
  // Level 1
  {
    groove: table("backbeat"),
    level: 1,
    style: "Backbeat",
    topic: "basics",
    bpm: { start: 70, target: 90 },
    feel: m.music_rep_padrep_backbeat_feel(),
    fingers: m.music_rep_padrep_backbeat_fingers(),
  },
  {
    groove: table("eighth-hats"),
    level: 1,
    style: "Rock",
    topic: "basics",
    bpm: { start: 70, target: 90 },
    feel: m.music_rep_padrep_eighth_hats_feel(),
    fingers: SPLIT,
  },
  {
    groove: gridGroove("basic-rock", m.music_rep_padrep_basic_rock_label(), {
      kick: "X.......x.......",
      snare: BACKBEAT,
      hats: EIGHTHS,
    }),
    level: 1,
    style: "Rock",
    topic: "basics",
    bpm: { start: 80, target: 110 },
    feel: m.music_rep_padrep_basic_rock_feel(),
    fingers: SPLIT,
  },
  {
    groove: gridGroove("boom-bap-a", m.music_rep_padrep_boom_bap_a_label(), {
      kick: "X.....x.........",
      snare: BACKBEAT,
      hats: EIGHTHS,
    }),
    level: 1,
    style: "Boom bap",
    topic: "basics",
    bpm: { start: 75, target: 90 },
    feel: m.music_rep_padrep_boom_bap_a_feel(),
    fingers: SPLIT,
  },
  {
    groove: gridGroove("four-on-floor", m.music_rep_padrep_four_on_floor_label(), {
      kick: "X...x...X...x...",
      perc: "....x.......x...",
    }),
    level: 1,
    style: "House",
    topic: "basics",
    bpm: { start: 90, target: 120 },
    feel: m.music_rep_padrep_four_on_floor_feel(),
    fingers: m.music_rep_padrep_fingers_kick_clap(),
  },
  {
    groove: table("syncopated"),
    level: 1,
    style: "Funk",
    topic: "basics",
    bpm: { start: 70, target: 90 },
    feel: m.music_rep_padrep_syncopated_feel(),
    fingers: SPLIT,
  },
  // Level 2
  {
    groove: table("boom-bap-2bar"),
    level: 2,
    style: "Boom bap",
    topic: "hiphop",
    bpm: { start: 75, target: 90 },
    feel: m.music_rep_padrep_boom_bap_2bar_feel(),
    fingers: SPLIT,
  },
  {
    groove: gridGroove("boom-bap-b", "Boom bap", {
      kick: "X......x..x..x.x",
      snare: BACKBEAT,
      hats: EIGHTHS,
    }),
    level: 2,
    style: "Boom bap",
    topic: "hiphop",
    bpm: { start: 80, target: 92 },
    feel: m.music_rep_padrep_boom_bap_b_feel(),
    fingers: SPLIT,
  },
  {
    groove: gridGroove("impeach", "Impeach the President", {
      kick: "X......xx.....x.",
      snare: BACKBEAT,
      hats: "x.x.x.xxx...x.x.",
      openhat: "..........x.....",
    }),
    level: 2,
    style: "Breakbeat",
    topic: "hiphop",
    bpm: { start: 80, target: 95 },
    feel: m.music_rep_padrep_impeach_feel(),
    fingers: SPLIT,
  },
  {
    groove: gridGroove("levee", "When the Levee Breaks", {
      kick: "XX.....x..xx....",
      snare: BACKBEAT,
      hats: EIGHTHS,
    }),
    level: 2,
    style: "Rock break",
    topic: "hiphop",
    bpm: { start: 62, target: 72 },
    feel: m.music_rep_padrep_levee_feel(),
    fingers: SPLIT,
  },
  // Level 3
  {
    groove: gridGroove("funky-drummer", "Funky Drummer", {
      kick: "X.x...x...x..x..",
      snare: "....X..g.g.gX..g",
      hats: "xxxxxxx.xxxxx.xx",
      openhat: ".......x.....x..",
    }),
    level: 3,
    style: "Funk break",
    topic: "ghosts",
    bpm: { start: 80, target: 100 },
    feel: m.music_rep_padrep_funky_drummer_feel(),
    fingers: m.music_rep_padrep_funky_drummer_fingers(),
  },
  {
    groove: gridGroove("dembow", "Dembow", { kick: "X...x...X...x...", snare: "...x..x....x..x." }),
    level: 3,
    style: "Reggaeton",
    topic: "ghosts",
    bpm: { start: 85, target: 98 },
    feel: m.music_rep_padrep_dembow_feel(),
    fingers: m.music_rep_padrep_fingers_kick_snare(),
  },
  {
    groove: gridGroove("ghost-boom-bap", m.music_rep_padrep_ghost_boom_bap_label(), {
      kick: "X......x..x.....",
      snare: "....X..g.g..X..g",
      hats: EIGHTHS,
    }),
    level: 3,
    style: "Boom bap",
    topic: "ghosts",
    bpm: { start: 80, target: 92 },
    feel: m.music_rep_padrep_ghost_boom_bap_feel(),
    fingers: SPLIT,
  },
  {
    // Ethan Hein's transcription (notation and waveform), 2026; the sixteenths are a tambourine on the record.
    groove: gridGroove(
      "think",
      "Think (Lyn Collins)",
      { kick: "X...............", snare: "....X..g..g.X...", hats: "xxxxxxxxxxxxxxxx" },
      { swing: 54 },
    ),
    level: 3,
    style: "Funk break",
    topic: "ghosts",
    swing: 54,
    bpm: { start: 95, target: 113 },
    feel: m.music_rep_padrep_think_feel(),
    fingers: m.music_rep_padrep_fingers_sixteenths_ghosts(),
  },
  {
    groove: gridGroove("funk-sixteenths", m.music_rep_padrep_funk_sixteenths_label(), {
      kick: "X..x......x.....",
      snare: "....X..g....X..g",
      hats: "xxxxxxxxxxxxxxxx",
    }),
    level: 3,
    style: "Funk",
    topic: "ghosts",
    bpm: { start: 80, target: 96 },
    feel: m.music_rep_padrep_funk_sixteenths_feel(),
    fingers: m.music_rep_padrep_fingers_sixteenths_ghosts(),
  },
  // Level 4
  {
    groove: gridGroove("independence", m.music_rep_padrep_independence_label(), {
      kick: "X.......x.......|X......x..x.....|X..x....x.x.....|X.x....x..x..x..",
      snare: `${BACKBEAT}|${BACKBEAT}|${BACKBEAT}|${BACKBEAT}`,
      hats: `${EIGHTHS}|${EIGHTHS}|${EIGHTHS}|${EIGHTHS}`,
    }),
    level: 4,
    style: "Independence",
    topic: "independence",
    bpm: { start: 75, target: 95 },
    feel: m.music_rep_padrep_independence_feel(),
    fingers: SPLIT,
  },
  {
    groove: gridGroove(
      "fill-one-beat",
      m.music_rep_padrep_fill_one_beat_label(),
      {
        kick: "X.......x.......|X.......x.......|X.......x.......|X.......x.......",
        snare: `${BACKBEAT}|${BACKBEAT}|${BACKBEAT}|....X.......xxxx`,
        hats: `${EIGHTHS}|${EIGHTHS}|${EIGHTHS}|x.x.x.x.x.x.....`,
      },
      { sections: ["groove", "groove", "groove", "fill"] },
    ),
    level: 4,
    style: "Fill",
    topic: "fills",
    bpm: { start: 75, target: 100 },
    feel: m.music_rep_padrep_fill_one_beat_feel(),
    fingers: m.music_rep_padrep_fill_one_beat_fingers(),
  },
  {
    groove: gridGroove(
      "fill-two-beats",
      m.music_rep_padrep_fill_two_beats_label(),
      {
        kick: "X.......x.......|X.......x.......|X.......x.......|X.......X.......",
        snare: `${BACKBEAT}|${BACKBEAT}|${BACKBEAT}|....X...xx......`,
        hats: `${EIGHTHS}|${EIGHTHS}|${EIGHTHS}|x.x.x.x.........`,
        "tom-high": "................|................|................|..........xx....",
        "tom-mid": "................|................|................|............xx..",
        "tom-low": "................|................|................|..............xx",
      },
      { sections: ["groove", "groove", "groove", "fill"] },
    ),
    level: 4,
    style: "Fill",
    topic: "fills",
    bpm: { start: 70, target: 95 },
    feel: m.music_rep_padrep_fill_two_beats_feel(),
    fingers: m.music_rep_padrep_fill_two_beats_fingers(),
  },
  {
    groove: table("turnaround-fill"),
    level: 4,
    style: "Fill",
    topic: "fills",
    bpm: { start: 75, target: 88 },
    feel: m.music_rep_padrep_turnaround_fill_feel(),
    fingers: SPLIT,
  },
  {
    groove: gridGroove(
      "swing-56",
      "Boom bap, swing 56%",
      { kick: "X......x..x.....", snare: BACKBEAT, hats: "xxxxxxxxxxxxxxxx" },
      { swing: 56 },
    ),
    level: 4,
    style: "Swing",
    topic: "swing",
    swing: 56,
    bpm: { start: 80, target: 90 },
    feel: m.music_rep_padrep_swing_56_feel(),
    fingers: m.music_rep_padrep_swing_56_fingers(),
  },
  {
    groove: gridGroove(
      "swing-62",
      "Boom bap, swing 62%",
      { kick: "X......x..x.....", snare: BACKBEAT, hats: "xxxxxxxxxxxxxxxx" },
      { swing: 62 },
    ),
    level: 4,
    style: "Swing",
    topic: "swing",
    swing: 62,
    bpm: { start: 80, target: 90 },
    feel: m.music_rep_padrep_swing_62_feel(),
    fingers: m.music_rep_padrep_swing_62_fingers(),
  },
  {
    groove: pushSnare(
      gridGroove(
        "dilla",
        m.music_rep_padrep_dilla_label(),
        { kick: "X......x..x.....", snare: BACKBEAT, hats: "xxxxxxxxxxxxxxxx" },
        { swing: 60 },
      ),
      20,
      88,
    ),
    level: 4,
    style: "Swing",
    topic: "swing",
    swing: 60,
    bpm: { start: 78, target: 88 },
    feel: m.music_rep_padrep_dilla_feel(),
    fingers: SPLIT,
  },
  // Level 5
  {
    groove: gridGroove("house", "House", {
      kick: "X...x...X...x...",
      perc: "....x.......x...",
      hats: "x...x...x...x...",
      openhat: "..x...x...x...x.",
    }),
    level: 5,
    style: "House",
    topic: "dance",
    bpm: { start: 110, target: 124 },
    feel: m.music_rep_padrep_house_feel(),
    fingers: m.music_rep_padrep_house_fingers(),
  },
  {
    groove: roll(
      gridGroove("trap-32", m.music_rep_padrep_trap_32_label(), {
        kick: "X......x..x.....",
        perc: "........X.......",
        hats: EIGHTHS,
      }),
      "hats",
      3,
      8,
      8,
    ),
    level: 5,
    style: "Trap",
    topic: "dance",
    bpm: { start: 120, target: 140 },
    feel: m.music_rep_padrep_trap_32_feel(),
    fingers: m.music_rep_padrep_trap_32_fingers(),
  },
  {
    groove: roll(
      gridGroove("trap-triplet", m.music_rep_padrep_trap_triplet_label(), {
        kick: "X......x..x.....",
        perc: "........X.......",
        hats: EIGHTHS,
      }),
      "hats",
      3,
      6,
      6,
    ),
    level: 5,
    style: "Trap",
    topic: "dance",
    bpm: { start: 120, target: 140 },
    feel: m.music_rep_padrep_trap_triplet_feel(),
    fingers: m.music_rep_padrep_trap_triplet_fingers(),
  },
  {
    groove: gridGroove("dnb", "Drum and bass two-step", {
      kick: "X.........x.....",
      snare: BACKBEAT,
      hats: EIGHTHS,
    }),
    level: 5,
    style: "Drum and bass",
    topic: "dance",
    bpm: { start: 140, target: 172 },
    feel: m.music_rep_padrep_dnb_feel(),
    fingers: SPLIT,
  },
  {
    // One common version (BeatCraft's); afrobeats has no single canonical pattern.
    groove: gridGroove(
      "afrobeats",
      "Afrobeats",
      {
        kick: "X.....x...x.....",
        perc: "....x.......x...",
        rim: "...x..x....x..x.",
        hats: "XxxxXxxxXxxxXxxx",
        "tom-high": "..x..x..x....x..",
      },
      { swing: 56 },
    ),
    level: 5,
    style: "Afrobeats",
    topic: "dance",
    swing: 56,
    bpm: { start: 95, target: 106 },
    feel: m.music_rep_padrep_afrobeats_feel(),
    fingers: m.music_rep_padrep_afrobeats_fingers(),
  },
  // Level 6
  {
    groove: gridGroove("amen", "Amen break", {
      kick: "X.x.......xx....|X.x.......xx....|X.x.......x.....|..xx......x.....",
      snare: "....X..g.g..X..g|....X..g.g..X..g|....X..g.g....X.|.x..X..g.g....X.",
      ride: `${EIGHTHS}|${EIGHTHS}|${EIGHTHS}|${EIGHTHS}`,
      crash: "................|................|................|..........X.....",
    }),
    level: 6,
    style: "Breakbeat",
    topic: "breaks",
    bpm: { start: 110, target: 138 },
    feel: m.music_rep_padrep_amen_feel(),
    fingers: m.music_rep_padrep_amen_fingers(),
  },
  {
    // Tony Allen's own "first pattern" of afrobeat, as he demonstrated it (Joe the Drummer's notation).
    groove: gridGroove("tony-allen", "Afrobeat (Tony Allen)", {
      kick: "XX......xx......",
      snare: "...x.xx.....xxx.",
      hats: "x.xxx.xxx.xxx.xx",
      pedalhat: "..x...x...x...x.",
    }),
    level: 6,
    style: "Afrobeat",
    topic: "independence",
    bpm: { start: 85, target: 110 },
    feel: m.music_rep_padrep_tony_allen_feel(),
    fingers: m.music_rep_padrep_tony_allen_fingers(),
  },
  {
    groove: gridGroove("apache", "Apache break", {
      kick: "X.........x.....",
      snare: "....X....x..X..x",
      hats: EIGHTHS,
    }),
    level: 6,
    style: "Breakbeat",
    topic: "breaks",
    bpm: { start: 95, target: 112 },
    feel: m.music_rep_padrep_apache_feel(),
    fingers: SPLIT,
  },
  // Latin, Caribbean and Brazilian (MusicRadar, Modern Drummer, DRUM!, Native Instruments,
  // Caceres, Ferrari and Palombini 2014 for the tamborzão; see docs/research/finger-drumming.md).
  {
    groove: gridGroove("reggaeton", "Reggaeton", {
      kick: "X...x...X...x...",
      snare: "...x..x....x..x.",
      hats: "x...x...x...x...",
      "tom-low": "x.......x.......",
    }),
    level: 2,
    style: "Reggaeton",
    topic: "latin",
    bpm: { start: 80, target: 95 },
    feel: m.music_rep_padrep_reggaeton_feel(),
    fingers: m.music_rep_padrep_reggaeton_fingers(),
  },
  {
    groove: gridGroove("dancehall", "Dancehall", {
      kick: "X..x....X..x....",
      snare: "......X.......X.",
      hats: EIGHTHS,
    }),
    level: 2,
    style: "Dancehall",
    topic: "latin",
    bpm: { start: 85, target: 95 },
    feel: m.music_rep_padrep_dancehall_feel(),
    fingers: SPLIT,
  },
  {
    groove: gridGroove("steppers", "Reggae steppers", {
      kick: "X...x...X...x...",
      rim: "........x.......",
      hats: EIGHTHS,
    }),
    level: 2,
    style: "Reggae",
    topic: "latin",
    bpm: { start: 65, target: 80 },
    feel: m.music_rep_padrep_steppers_feel(),
    fingers: m.music_rep_padrep_fingers_kick_rim_hats(),
  },
  {
    groove: gridGroove("cumbia", "Cumbia", {
      kick: "X...x...X...x...",
      rim: "....x.......x...",
      hats: "x.xxx.xxx.xxx.xx",
    }),
    level: 2,
    style: "Cumbia",
    topic: "latin",
    bpm: { start: 70, target: 88 },
    feel: m.music_rep_padrep_cumbia_feel(),
    fingers: m.music_rep_padrep_cumbia_fingers(),
  },
  {
    groove: gridGroove("one-drop", "Reggae one drop", {
      kick: "........X.......",
      rim: "........x.......",
      hats: "..x.x.x.x.x.x...",
      openhat: "..............x.",
    }),
    level: 3,
    style: "Reggae",
    topic: "latin",
    bpm: { start: 65, target: 80 },
    feel: m.music_rep_padrep_one_drop_feel(),
    fingers: m.music_rep_padrep_fingers_kick_rim_hats(),
  },
  {
    groove: gridGroove("tamborzao", m.music_rep_padrep_tamborzao_label(), {
      kick: "X.....x.........",
      "tom-mid": "x.......x.......",
      "tom-low": "............x...",
      "tom-high": "...x..x.........",
    }),
    level: 3,
    style: "Baile funk",
    topic: "latin",
    bpm: { start: 110, target: 130 },
    feel: m.music_rep_padrep_tamborzao_feel(),
    fingers: m.music_rep_padrep_tamborzao_fingers(),
  },
  {
    groove: gridGroove("bossa-nova", "Bossa nova", {
      kick: "X.....g.X.....g.|X.....g.X.....g.",
      hats: `${EIGHTHS}|${EIGHTHS}`,
      pedalhat: "....x.......x...|....x.......x...",
      rim: "x.....x.....x...|....x.....x.....",
    }),
    level: 4,
    style: "Bossa nova",
    topic: "latin",
    bpm: { start: 100, target: 120 },
    feel: m.music_rep_padrep_bossa_nova_feel(),
    fingers: m.music_rep_padrep_bossa_nova_fingers(),
  },
  {
    groove: gridGroove("soca", "Soca", {
      kick: "X...x...X...x...",
      snare: "...x..x....x..x.",
      hats: "xx..xx..xx..xx..",
      openhat: "..x...x...x...x.",
    }),
    level: 4,
    style: "Soca",
    topic: "latin",
    bpm: { start: 105, target: 125 },
    feel: m.music_rep_padrep_soca_feel(),
    fingers: m.music_rep_padrep_soca_fingers(),
  },
  {
    groove: gridGroove("zouk", "Zouk", {
      kick: "X.......x.....x.",
      snare: "....X.......X...",
      hats: "XgXgXgXgXgXgXgXg",
      rim: "x...x.x...x.x...",
    }),
    level: 4,
    style: "Zouk",
    topic: "latin",
    bpm: { start: 100, target: 125 },
    feel: m.music_rep_padrep_zouk_feel(),
    fingers: m.music_rep_padrep_zouk_fingers(),
  },
  {
    groove: gridGroove("kompa", m.music_rep_padrep_provisional({ title: padStyleLabel("Kompa") }), {
      cowbell: "X..XX...X.X.X...|X..XX...X.X.X...",
      hats: "x.xx.x..x.xx.x..|x.xx.x..x.xx.x..",
      openhat: "......x.......x.|......x.......x.",
      "tom-low": "............x...|............x...",
    }),
    level: 4,
    style: "Kompa",
    topic: "latin",
    bpm: { start: 90, target: 110 },
    feel: m.music_rep_padrep_kompa_feel(),
    fingers: m.music_rep_padrep_kompa_fingers(),
  },
  {
    groove: gridGroove("funk-150", m.music_rep_padrep_funk_150_label(), {
      kick: "X.....x...x.....",
      "tom-mid": "x.......x.......",
      "tom-low": "............x...",
      "tom-high": "...x..x.........",
    }),
    level: 5,
    style: "Baile funk",
    topic: "latin",
    bpm: { start: 130, target: 150 },
    feel: m.music_rep_padrep_funk_150_feel(),
    fingers: m.music_rep_padrep_funk_150_fingers(),
  },
  {
    groove: gridGroove("samba", "Samba", {
      kick: "x..Xx..xx..Xx..x",
      hats: "xxx.xxx.xxx.xxx.",
      pedalhat: "..x...x...x...x.",
    }),
    level: 5,
    style: "Samba",
    topic: "latin",
    bpm: { start: 90, target: 110 },
    feel: m.music_rep_padrep_samba_feel(),
    fingers: m.music_rep_padrep_samba_fingers(),
  },
  // Short phrases (docs/research/phrases.md, local): one- and two-bar cells
  // drummers know by name, plus a tag ending and a build. Generic rhythms, no
  // recordings.
  {
    groove: gridGroove("son-clave", m.music_rep_padrep_son_clave_label(), {
      rim: "x..x..x...x.x...",
    }),
    level: 1,
    style: "Clave",
    topic: "phrases",
    bpm: { start: 80, target: 105 },
    feel: m.music_rep_padrep_son_clave_feel(),
    fingers: m.music_rep_padrep_son_clave_fingers(),
  },
  {
    groove: gridGroove("rumba-clave", m.music_rep_padrep_rumba_clave_label(), {
      rim: "x..x...x..x.x...",
    }),
    level: 1,
    style: "Clave",
    topic: "phrases",
    bpm: { start: 80, target: 105 },
    feel: m.music_rep_padrep_rumba_clave_feel(),
    fingers: m.music_rep_padrep_rumba_clave_fingers(),
  },
  {
    groove: gridGroove("stomp-clap", m.music_rep_padrep_stomp_clap_label(), {
      kick: "x.x.....x.x.....",
      perc: "....x.......x...",
    }),
    level: 1,
    style: "Body percussion",
    topic: "phrases",
    bpm: { start: 72, target: 84 },
    feel: m.music_rep_padrep_stomp_clap_feel(),
    fingers: m.music_rep_padrep_fingers_kick_clap(),
  },
  {
    groove: gridGroove("tresillo-backbeat", m.music_rep_padrep_tresillo_backbeat_label(), {
      kick: "x..x..x.x..x..x.",
      snare: "....x.......x...",
    }),
    level: 2,
    style: "Tresillo",
    topic: "phrases",
    bpm: { start: 85, target: 100 },
    feel: m.music_rep_padrep_tresillo_backbeat_feel(),
    fingers: m.music_rep_padrep_fingers_kick_snare(),
  },
  {
    groove: gridGroove("paradiddle-split", m.music_rep_padrep_paradiddle_split_label(), {
      snare: "x.xx.x..x.xx.x..",
      hats: ".x..x.xx.x..x.xx",
    }),
    level: 2,
    style: "Rudiment phrase",
    topic: "phrases",
    bpm: { start: 70, target: 90 },
    feel: m.music_rep_padrep_paradiddle_split_feel(),
    fingers: m.music_rep_padrep_paradiddle_split_fingers(),
  },
  {
    groove: gridGroove("one-beat-fill", m.music_rep_padrep_one_beat_fill_label(), {
      kick: "x.......x.......|x...............",
      snare: "....x.......xxxx|................",
      hats: "x.x.x.x.x.x.....|................",
      crash: "................|x...............",
    }),
    level: 2,
    style: "Fill",
    topic: "phrases",
    bpm: { start: 85, target: 105 },
    feel: m.music_rep_padrep_one_beat_fill_feel(),
    fingers: m.music_rep_padrep_one_beat_fill_fingers(),
  },
  {
    groove: gridGroove("shave-tag", m.music_rep_padrep_shave_tag_label(), {
      snare: "x...............|................",
      "tom-high": "....x.x.....x...|................",
      "tom-mid": "........x.......|................",
      "tom-low": "................|....x...........",
      kick: "................|........x.......",
      crash: "................|........x.......",
    }),
    level: 2,
    style: "Tag ending",
    topic: "phrases",
    bpm: { start: 100, target: 120 },
    feel: m.music_rep_padrep_shave_tag_feel(),
    fingers: m.music_rep_padrep_shave_tag_fingers(),
  },
  {
    groove: gridGroove("linear-3-over-4", m.music_rep_padrep_linear_3_over_4_label(), {
      hats: "x..x..x..x..x..x",
      snare: ".x..x..x..x..x..",
      kick: "..x..x..x..x..x.",
    }),
    level: 3,
    style: "Linear phrase",
    topic: "phrases",
    bpm: { start: 75, target: 95 },
    feel: m.music_rep_padrep_linear_3_over_4_feel(),
    fingers: m.music_rep_padrep_linear_3_over_4_fingers(),
  },
  {
    groove: gridGroove("snare-build", m.music_rep_padrep_snare_build_label(), {
      snare: "x...x...x...x...|x.x.x.x.x.x.x.x.|xxxxxxxxxxxxxxxx|xxxxxxxxxxxxxxxx|................",
      kick: "x...x...x...x...|x...x...x...x...|x...x...x...x...|x...x...x...x...|x...............",
      crash: "................|................|................|................|x...............",
    }),
    level: 3,
    style: "Dance build",
    topic: "phrases",
    bpm: { start: 110, target: 126 },
    feel: m.music_rep_padrep_snare_build_feel(),
    fingers: m.music_rep_padrep_snare_build_fingers(),
  },
  // New for the path (pads.md, levels 2, 5, 9 and 10): generic patterns, the
  // named records' grooves as they are commonly taught.
  {
    groove: gridGroove("rock-open-hat", m.music_rep_padrep_rock_open_hat_label(), {
      kick: "X.......x.......",
      snare: BACKBEAT,
      hats: "x.x.x.x.x.x.x...",
      openhat: "..............x.",
    }),
    level: 1,
    style: "Rock",
    topic: "basics",
    bpm: { start: 80, target: 100 },
    feel: m.music_rep_padrep_rock_open_hat_feel(),
    fingers: m.music_rep_padrep_rock_open_hat_fingers(),
  },
  {
    groove: gridGroove("disco", "Disco", {
      kick: "X...x...X...x...",
      snare: BACKBEAT,
      hats: "xx.xxx.xxx.xxx.x",
      openhat: "..x...x...x...x.",
    }),
    level: 5,
    style: "House",
    topic: "dance",
    bpm: { start: 100, target: 120 },
    feel: m.music_rep_padrep_disco_feel(),
    fingers: m.music_rep_padrep_disco_fingers(),
  },
  {
    groove: gridGroove("cold-sweat", m.music_rep_padrep_provisional({ title: "Cold Sweat" }), {
      kick: "X.........x.x...",
      snare: "....X..g.g.X..g.",
      hats: EIGHTHS,
    }),
    level: 6,
    style: "Funk break",
    topic: "ghosts",
    bpm: { start: 95, target: 112 },
    feel: m.music_rep_padrep_cold_sweat_feel(),
    fingers: m.music_rep_padrep_cold_sweat_fingers(),
  },
  {
    groove: gridGroove("songo", m.music_rep_padrep_provisional({ title: "Songo" }), {
      cowbell: "X...x...X...x...",
      kick: "......x.....x...",
      snare: "..g..g.X..g...g.",
      "tom-low": "............x.x.",
    }),
    level: 5,
    style: "Songo",
    topic: "latin",
    bpm: { start: 85, target: 100 },
    feel: m.music_rep_padrep_songo_feel(),
    fingers: m.music_rep_padrep_songo_fingers(),
  },
  // Linear grooves from Stick Control's first page: the right hand on the hats,
  // the left on the snare, the kick taking some strokes; never two at once.
  {
    groove: linear("linear-singles", m.music_rep_padrep_linear_singles_label(), "KsHsSsHsKsHsSsHs"),
    level: 6,
    style: "Linear funk",
    topic: "independence",
    bpm: { start: 70, target: 90 },
    feel: m.music_rep_padrep_linear_singles_feel(),
    fingers: m.music_rep_padrep_linear_singles_fingers(),
  },
  {
    groove: linear("linear-doubles", m.music_rep_padrep_linear_doubles_label(), "KHssSHssHHKsSHss"),
    level: 6,
    style: "Linear funk",
    topic: "independence",
    bpm: { start: 70, target: 90 },
    feel: m.music_rep_padrep_linear_doubles_feel(),
    fingers: m.music_rep_padrep_linear_doubles_fingers(),
  },
  {
    groove: linear(
      "linear-paradiddle",
      m.music_rep_padrep_linear_paradiddle_label(),
      "KsHHSHssKsHHSHss",
    ),
    level: 6,
    style: "Linear funk",
    topic: "independence",
    bpm: { start: 70, target: 90 },
    feel: m.music_rep_padrep_linear_paradiddle_feel(),
    fingers: m.music_rep_padrep_linear_paradiddle_fingers(),
  },
  {
    groove: linear(
      "linear-inverted",
      m.music_rep_padrep_linear_inverted_label(),
      "KssHSHHsHsKHSHHs",
    ),
    level: 6,
    style: "Linear funk",
    topic: "independence",
    bpm: { start: 70, target: 90 },
    feel: m.music_rep_padrep_linear_inverted_feel(),
    fingers: m.music_rep_padrep_linear_inverted_fingers(),
  },
  // Level 7: the triplet grid, three steps a beat (twelve a bar); a shuffle
  // plays the first and third of each triplet. Half-time shuffles put the
  // backbeat on 3. Tempos are the records' where they are known.
  {
    groove: gridGroove("blues-shuffle", m.music_rep_padrep_blues_shuffle_label(), {
      kick: "X.....x.....",
      snare: "...X.....X..",
      hats: SHUFFLE_HATS,
    }),
    level: 7,
    style: "Shuffle",
    topic: "shuffle",
    bpm: { start: 90, target: 120 },
    feel: m.music_rep_padrep_blues_shuffle_feel(),
    fingers: SPLIT,
  },
  {
    groove: gridGroove("swing-ride", m.music_rep_padrep_swing_ride_label(), {
      ride: "x..x.xx..x.x",
      pedalhat: "...x.....x..",
      kick: "g..g..g..g..",
    }),
    level: 7,
    style: "Swing",
    topic: "shuffle",
    bpm: { start: 100, target: 140 },
    feel: m.music_rep_padrep_swing_ride_feel(),
    fingers: m.music_rep_padrep_swing_ride_fingers(),
  },
  {
    groove: gridGroove(
      "slow-blues",
      m.music_rep_padrep_slow_blues_label(),
      { kick: "X.....x.....", snare: "...X.....X..", hats: "xxxxxxxxxxxx" },
      { meter: "12/8" },
    ),
    level: 7,
    style: "Shuffle",
    topic: "shuffle",
    bpm: { start: 50, target: 60 },
    feel: m.music_rep_padrep_slow_blues_feel(),
    fingers: SPLIT,
  },
  {
    groove: gridGroove("shuffle-ghosts", m.music_rep_padrep_shuffle_ghosts_label(), {
      kick: "X.....x.....",
      snare: "..gX....gX..",
      hats: SHUFFLE_HATS,
    }),
    level: 7,
    style: "Shuffle",
    topic: "shuffle",
    bpm: { start: 80, target: 100 },
    feel: m.music_rep_padrep_shuffle_ghosts_feel(),
    fingers: m.music_rep_padrep_fingers_hats_ghosts(),
  },
  {
    groove: gridGroove("purdie", "Purdie shuffle", {
      kick: "X....x.....x",
      snare: ".g..g.X...g.",
      hats: SHUFFLE_HATS,
    }),
    level: 7,
    style: "Shuffle",
    topic: "shuffle",
    bpm: { start: 72, target: 92 },
    feel: m.music_rep_padrep_purdie_feel(),
    fingers: m.music_rep_padrep_fingers_hats_ghosts(),
  },
  {
    groove: gridGroove(
      "rosanna",
      m.music_rep_padrep_provisional({ title: m.music_rep_padrep_rosanna_title() }),
      {
        kick: "X....x..x..x|X....x..x...",
        snare: ".g..g.X...g.|.g..g.X..g.g",
        hats: `${SHUFFLE_HATS}|${SHUFFLE_HATS}`,
      },
    ),
    level: 7,
    style: "Shuffle",
    topic: "shuffle",
    bpm: { start: 70, target: 86 },
    feel: m.music_rep_padrep_rosanna_feel(),
    fingers: m.music_rep_padrep_fingers_hats_ghosts(),
  },
  {
    groove: gridGroove(
      "fool-in-the-rain",
      m.music_rep_padrep_provisional({ title: "Fool in the Rain" }),
      {
        kick: "X.........x.......x.....",
        snare: "..g...g.g...X.....g.g.g.",
        hats: "x...x.x...x.x...x.x...x.",
      },
    ),
    level: 7,
    style: "Shuffle",
    topic: "shuffle",
    bpm: { start: 100, target: 130 },
    feel: m.music_rep_padrep_fool_in_the_rain_feel(),
    fingers: m.music_rep_padrep_fingers_hats_ghosts(),
  },
  // Level 8: odd meters. 5/4 and 7/4 click quarters; 7/8 clicks its seven eighths.
  {
    groove: gridGroove(
      "five-four",
      m.music_rep_padrep_rock_in_meter({ meter: "5/4" }),
      {
        kick: "X.....x.....X.......",
        snare: "........X.......X...",
        hats: "x.x.x.x.x.x.x.x.x.x.",
      },
      { beats: 5 },
    ),
    level: 8,
    style: "Odd meter",
    topic: "meter",
    bpm: { start: 120, target: 172 },
    feel: m.music_rep_padrep_five_four_feel(),
    fingers: SPLIT,
  },
  {
    groove: gridGroove(
      "seven-four",
      m.music_rep_padrep_rock_in_meter({ meter: "7/4" }),
      {
        kick: "X.......x.......x.......x...",
        snare: "....X.......X.......X.......",
        hats: "x.x.x.x.x.x.x.x.x.x.x.x.x.x.",
      },
      { beats: 7 },
    ),
    level: 8,
    style: "Odd meter",
    topic: "meter",
    bpm: { start: 90, target: 120 },
    feel: m.music_rep_padrep_seven_four_feel(),
    fingers: SPLIT,
  },
  {
    groove: gridGroove(
      "seven-eight",
      m.music_rep_padrep_rock_in_meter({ meter: "7/8" }),
      {
        kick: "X.......x.....",
        snare: "....X.....X...",
        hats: "x.x.x.x.x.x.x.",
      },
      { beats: 7 },
    ),
    level: 8,
    style: "Odd meter",
    topic: "meter",
    bpm: { start: 90, target: 120 },
    feel: m.music_rep_padrep_seven_eight_feel(),
    fingers: SPLIT,
  },
];

export const repertoireFor = (id: string) => PAD_REPERTOIRE.find((r) => r.groove.value === id);
export const topicSkill = (topic: GrooveTopic) => `technique.mpc.${topic}`;
export const TOPICS: GrooveTopic[] = [
  "basics",
  "hiphop",
  "ghosts",
  "independence",
  "fills",
  "swing",
  "dance",
  "breaks",
  "latin",
  "phrases",
  "shuffle",
  "meter",
];

/** The closest two hits on one pad get, in ms: a roll's spacing, or a sixteenth. */
export function closestGapMs(
  targets: readonly { voice: string; beat: number }[],
  beatMs: number,
): number {
  let gap = 0.25;
  for (const [i, t] of targets.entries())
    for (const u of targets.slice(i + 1))
      if (u.voice === t.voice && Math.abs(u.beat - t.beat) > 1e-6)
        gap = Math.min(gap, Math.abs(u.beat - t.beat));
  return gap * beatMs;
}

/**
 * Perfect and good counts against a tier; good is capped at 40% of the
 * closest spacing on one pad, so a hit can never claim the next note.
 */
export function gradeTier(
  perTarget: readonly (number | null)[],
  tier: Tier,
  gapMs: number,
): { perfect: number; good: number; pass: boolean; perfectMs: number; goodMs: number } {
  const w = TIERS[tier];
  const goodMs = Math.min(w.good, 0.4 * gapMs);
  const perfectMs = Math.min(w.perfect, goodMs);
  const n = perTarget.length || 1;
  const perfect = perTarget.filter((e) => e !== null && Math.abs(e) <= perfectMs).length / n;
  const good = perTarget.filter((e) => e !== null && Math.abs(e) <= goodMs).length / n;
  // The research's proposal: 90% good and 70% perfect.
  return { perfect, good, pass: good >= 0.9 && perfect >= 0.7, perfectMs, goodMs };
}

/**
 * The swing played, as an MPC percentage: where the off-sixteenths landed
 * inside their eighths. Null when no off-sixteenth was hit.
 */
export function measuredSwing(
  targets: readonly { beat: number }[],
  perTarget: readonly (number | null)[],
  beatMs: number,
): number | null {
  const ratios = targets.flatMap((t, i) => {
    const e = perTarget[i];
    const inEighth = (t.beat % 0.5) / 0.5; // 0.5 straight, about 0.66 swung
    if (e === null || inEighth < 0.3) return [];
    return [inEighth + e / (beatMs / 2)];
  });
  return ratios.length
    ? Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100)
    : null;
}

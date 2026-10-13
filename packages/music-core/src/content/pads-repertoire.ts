// The finger-drumming repertoire: grooves in six levels, from the research
// (Melodics' structure, Ethan Hein's transcriptions, Roger Linn on swing;
// docs/research/finger-drumming.md, local). Patterns are step grids, never
// recordings. Each level has a timing tier (perfect and good windows that
// tighten as the levels rise), each groove a start and a target tempo for the
// tempo ladder, and the fingers to play it with.

import { GROOVES } from "./winds-pads";
import { gridGroove } from "./pads-grid";
import type { GrooveDef } from "../data";

export type GrooveTopic =
  | "basics"
  | "hiphop"
  | "ghosts"
  | "independence"
  | "fills"
  | "swing"
  | "dance"
  | "breaks"
  | "latin";

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
    title: "First grooves",
    tier: "beginner",
    summary: "Kick, snare and eighth hats, split hands.",
  },
  {
    level: 2,
    title: "Boom bap and the first breaks",
    tier: "beginner",
    summary: "Two-bar hip-hop beats with the kick moving.",
  },
  {
    level: 3,
    title: "Ghost notes",
    tier: "intermediate",
    summary: "Soft snares between the backbeats; sixteenth hats.",
  },
  {
    level: 4,
    title: "Independence, fills and swing",
    tier: "intermediate",
    summary: "Hats steady while the kick changes; fills; MPC swing.",
  },
  {
    level: 5,
    title: "Dance and trap",
    tier: "advanced",
    summary: "House, trap rolls, drum and bass.",
  },
  {
    level: 6,
    title: "The breaks",
    tier: "advanced",
    summary: "The Amen and Apache breaks, bar by bar.",
  },
];

const SPLIT =
  "Right hand on the hats (index and middle alternating); left index on kick and snare.";
const EIGHTHS = "x.x.x.x.x.x.x.x.";
const BACKBEAT = "....X.......X...";
const table = (id: string) => GROOVES.find((g) => g.value === id)!;

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
    feel: "Kick on 1 and 3, snare on 2 and 4.",
    fingers: "Left index on kick, right index on snare.",
  },
  {
    groove: table("eighth-hats"),
    level: 1,
    style: "Rock",
    topic: "basics",
    bpm: { start: 70, target: 90 },
    feel: "The backbeat with eighth hats over it.",
    fingers: SPLIT,
  },
  {
    groove: gridGroove("basic-rock", "Basic rock", {
      kick: "X.......x.......",
      snare: BACKBEAT,
      hats: EIGHTHS,
    }),
    level: 1,
    style: "Rock",
    topic: "basics",
    bpm: { start: 80, target: 110 },
    feel: "The beat under a thousand songs (Billie Jean sits on it at about 117).",
    fingers: SPLIT,
  },
  {
    groove: gridGroove("boom-bap-a", "Boom bap, first steps", {
      kick: "X.....x.........",
      snare: BACKBEAT,
      hats: EIGHTHS,
    }),
    level: 1,
    style: "Boom bap",
    topic: "basics",
    bpm: { start: 75, target: 90 },
    feel: "The kick's second hit lands on the & of 2: the first push.",
    fingers: SPLIT,
  },
  {
    groove: gridGroove("four-on-floor", "Four on the floor", {
      kick: "X...x...X...x...",
      perc: "....x.......x...",
    }),
    level: 1,
    style: "House",
    topic: "basics",
    bpm: { start: 90, target: 120 },
    feel: "A kick on every beat, the clap on 2 and 4.",
    fingers: "Left index on the kick, right index on the clap.",
  },
  {
    groove: table("syncopated"),
    level: 1,
    style: "Funk",
    topic: "basics",
    bpm: { start: 70, target: 90 },
    feel: "A kick off the beat.",
    fingers: SPLIT,
  },
  // Level 2
  {
    groove: table("boom-bap-2bar"),
    level: 2,
    style: "Boom bap",
    topic: "hiphop",
    bpm: { start: 75, target: 90 },
    feel: "Two bars; the second answers the first.",
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
    feel: "The generic hip-hop kick: four hits after the backbeat on 2.",
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
    feel: "Two kicks together on the & of 2 and 3; an open hat after.",
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
    feel: "Slow and heavy; the kick on the a of 2 is the surprise.",
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
    feel: "Sixteenth hats, ghosted snares around the backbeats, open hats on the a of 2 and 4.",
    fingers:
      "Right index and middle alternate the hats; left index the snare and its ghosts, left middle the kick.",
  },
  {
    groove: gridGroove("dembow", "Dembow", { kick: "X...x...X...x...", snare: "...x..x....x..x." }),
    level: 3,
    style: "Reggaeton",
    topic: "ghosts",
    bpm: { start: 85, target: 98 },
    feel: "Four on the floor with the snare on the a of 1, the & of 2, and again.",
    fingers: "Left index on the kick, right index on the snare.",
  },
  {
    groove: gridGroove("ghost-boom-bap", "Boom bap with ghosts", {
      kick: "X......x..x.....",
      snare: "....X..g.g..X..g",
      hats: EIGHTHS,
    }),
    level: 3,
    style: "Boom bap",
    topic: "ghosts",
    bpm: { start: 80, target: 92 },
    feel: "Ghosts on the a of 2, the e of 3 and the a of 4: soft, under 40% of the backbeat.",
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
    feel: 'The "Yeah! Woo!" break: one kick, the snare on 2 and 4 with ghosts on the a of 2 and the & of 3, and sixteenths (a tambourine on the record) a little behind the beat.',
    fingers:
      "Right index and middle alternate the sixteenths on the hats; left index the snare and ghosts, left middle the kick.",
  },
  {
    groove: gridGroove("funk-sixteenths", "Funk sixteenths", {
      kick: "X..x......x.....",
      snare: "....X..g....X..g",
      hats: "xxxxxxxxxxxxxxxx",
    }),
    level: 3,
    style: "Funk",
    topic: "ghosts",
    bpm: { start: 80, target: 96 },
    feel: "Sixteenth hats over a kick on 1, the a of 1 and the & of 3; ghosts on the a of 2 and the a of 4.",
    fingers:
      "Right index and middle alternate the sixteenths on the hats; left index the snare and ghosts, left middle the kick.",
  },
  // Level 4
  {
    groove: gridGroove("independence", "Four kicks under one hat", {
      kick: "X.......x.......|X......x..x.....|X..x....x.x.....|X.x....x..x..x..",
      snare: `${BACKBEAT}|${BACKBEAT}|${BACKBEAT}|${BACKBEAT}`,
      hats: `${EIGHTHS}|${EIGHTHS}|${EIGHTHS}|${EIGHTHS}`,
    }),
    level: 4,
    style: "Independence",
    topic: "independence",
    bpm: { start: 75, target: 95 },
    feel: "The hats never change; the kick takes a new pattern every bar.",
    fingers: SPLIT,
  },
  {
    groove: gridGroove(
      "fill-one-beat",
      "Groove with a one-beat fill",
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
    feel: "Three bars of rock, then four sixteenth snares on beat 4 and back to 1.",
    fingers: "Fill: alternate both index fingers on the snare.",
  },
  {
    groove: gridGroove(
      "fill-two-beats",
      "Groove with a two-beat fill",
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
    feel: "Sixteenths down the kit: snare, high, mid and low tom, then the downbeat.",
    fingers: "Alternate hands, right leading, across the pads from left to right.",
  },
  {
    groove: table("turnaround-fill"),
    level: 4,
    style: "Fill",
    topic: "fills",
    bpm: { start: 75, target: 88 },
    feel: "Three bars and a fill that turns the phrase around.",
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
    feel: "Every second sixteenth a little late: loose, not yet a shuffle.",
    fingers: "Right index and middle alternate the hats, the middle a touch late.",
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
    feel: "Nearer the triplet: the hip-hop lilt.",
    fingers: "Right index and middle alternate the hats; feel the late one, don't count it.",
  },
  {
    groove: pushSnare(
      gridGroove(
        "dilla",
        "Dilla feel",
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
    feel: "Swung hats over a straight kick, and the snare pushed about 20 ms early: two feels at once.",
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
    feel: "Closed hat on the beat, open hat on every &; the kick never stops.",
    fingers: "Left index on the kick, left middle the clap, right index and middle the two hats.",
  },
  {
    groove: roll(
      gridGroove("trap-32", "Trap, 1/32 roll", {
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
    feel: "Half time: the clap on 3. The last beat of hats rolls in thirty-seconds.",
    fingers:
      "The roll: right index and middle as a two-finger roll on one pad (or hold Note Repeat at 1/32).",
  },
  {
    groove: roll(
      gridGroove("trap-triplet", "Trap, triplet roll", {
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
    feel: "The same beat, the roll in sixteenth triplets (1/16T).",
    fingers: "Two-finger roll, six to the beat.",
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
    feel: "Kick on 1 and the & of 3, snare on 2 and 4, fast.",
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
    feel: "Kick on 1 with pushes on the & of 2 and 3; the rim answers on the a of 1 and the & of 2 (the 3-3-2), a clap on 2 and 4, shaker sixteenths. One common version: producers vary it.",
    fingers:
      "Right hand the shaker (hats) sixteenths; left index kick, left middle rim; the clap and conga (high tom) where they fall.",
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
    feel: "Four bars: the third delays the last snare, the fourth rearranges everything and crashes.",
    fingers: "Right index on the ride; left index the snare and ghosts, left middle the kick.",
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
    feel: "Fela's drummer: kicks in pairs, a snare line of its own, the hand on the hats and the foot on the pedal hat all independent. Tempo approximate.",
    fingers:
      "Right index and middle the hats, left index the snare, left middle the kick, left ring the pedal hat. Learn it in Wait mode first.",
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
    feel: "The snare answers itself on the & of 3 and the a of 4 (tempo approximate).",
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
    feel: "The dembow: a kick on every beat, the snare's 3+3+2 over it, a deep tom on 1 and 3.",
    fingers:
      "Left index the kick, right index the snare, left middle the tom, right middle the hat.",
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
    feel: "The 3+3+2 split between kick (1 and the a of 1, 3 and the a of 3) and snare (the & of 2 and 4).",
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
    feel: "A kick on every beat under the cross-stick on 3: the marching reggae beat.",
    fingers: "Left index the kick, left middle the rim, right hand the hats.",
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
    feel: "The guacharaca on the hats (one on the beat, two on the & and a), the llamador on 2 and 4. Players put the kick on every beat, on 2 and 4, or a tumbao: this one keeps it on the beat.",
    fingers: "Right index and middle the guacharaca; left index kick, left middle rim.",
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
    feel: "Nothing on 1: kick and cross-stick drop together on 3 of a half-time bar, an open hat leading into the next. Often played with a shuffle.",
    fingers: "Left index the kick, left middle the rim, right hand the hats.",
  },
  {
    groove: gridGroove("tamborzao", "Brazilian funk (tamborzão)", {
      kick: "X.....x.........",
      "tom-mid": "x.......x.......",
      "tom-low": "............x...",
      "tom-high": "...x..x.........",
    }),
    level: 3,
    style: "Baile funk",
    topic: "latin",
    bpm: { start: 110, target: 130 },
    feel: '"Tum pa-pá pum pá": a tresillo of drum skins (1, the a of 1, the & of 2) answered on 3 and 4, no hats, no snare. DJ Luciano Oliveira\'s own reduction.',
    fingers:
      "Left index the kick and rack tom, right index and middle the conga (high tom), left middle the floor tom.",
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
    feel: "The surdo on the kick (soft pushes before 1 and 3), and the bossa clave on the cross-stick over two bars.",
    fingers:
      "Right hand the hats; left index the kick, left middle the rim; the pedal hat with a spare finger on 2 and 4.",
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
    feel: "Four on the floor with the 3+3+2 snare and an open hat sizzling on every &. (Teachers vary the hats: this is Boston Drum Lessons' version.)",
    fingers:
      "Right index and middle the hats, opening on the &; left index kick, left middle snare.",
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
    feel: "Sixteenth hats, loud and soft; the tibwa's cinquillo on the rim; snare only on 2 and 4.",
    fingers:
      "Right index and middle the hats (index loud, middle soft); left index kick, left middle snare, left ring rim.",
  },
  {
    groove: gridGroove("kompa", "Kompa (provisional)", {
      cowbell: "X..XX...X.X.X...|X..XX...X.X.X...",
      hats: "x.xx.x..x.xx.x..|x.xx.x..x.xx.x..",
      openhat: "......x.......x.|......x.......x.",
      "tom-low": "............x...|............x...",
    }),
    level: 4,
    style: "Kompa",
    topic: "latin",
    bpm: { start: 90, target: 110 },
    feel: "The cowbell is the metronome of kompa, the gong (a muffled floor tom) on 4. Provisional: one band player's notation; tempo not documented.",
    fingers: "Right index the cowbell, right middle the hats; left index the floor tom.",
  },
  {
    groove: gridGroove("funk-150", "Brazilian funk, 150 BPM", {
      kick: "X.....x...x.....",
      "tom-mid": "x.......x.......",
      "tom-low": "............x...",
      "tom-high": "...x..x.........",
    }),
    level: 5,
    style: "Baile funk",
    topic: "latin",
    bpm: { start: 130, target: 150 },
    feel: "The tamborzão sped up to 150 (2016 on), with DJ Sany Pitbull's extra kick on the & of 3.",
    fingers: "As the tamborzão, lighter on the fingers.",
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
    feel: "The surdo on the kick (the first and last sixteenth of each beat), a busy hat line and the pedal hat on every &. Tempo approximate.",
    fingers: "Left index and middle the kick figure, right hand the hats, left ring the pedal hat.",
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

// Studio ears: technical ear training for producers. A loop (pink noise, a
// drum groove, a small band) is heard flat and changed; name the change.
// Parameters follow the research (Kaniwa et al. 2011, Marui and Kamekawa
// 2018, EarQuiz, SoundGym): octave bands, +12 then +6 then +3 dB, Q 1.41,
// pink noise before music, cuts after boosts.

import { pick, type Rand } from "./random";
import { m } from "@repo/i18n/messages.js";

export type StudioExercise =
  | "peak"
  | "cut"
  | "boost-or-cut"
  | "level"
  | "pan"
  | "compression"
  | "delay";
export type StudioMaterial = "noise" | "drums" | "music";

/** Octave centres in Hz: 3, 5 or 9 of them. */
export const BAND_SETS = {
  "3": [250, 1000, 4000],
  "5": [125, 500, 1000, 4000, 8000],
  "9": [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],
} as const;
export type BandSet = keyof typeof BAND_SETS;
/** One octave wide: Q 1.41. */
export const OCTAVE_Q = 1.41;
export const GAINS = [12, 6, 3] as const;
/** Level steps in dB, largest first (DB King style). */
export const LEVEL_STEPS = [6, 3, 2, 1] as const;
/** Pan positions, -1 hard left to 1 hard right: 3 of them, or 5. */
export const PAN_SETS = { "3": [-1, 0, 1], "5": [-1, -0.5, 0, 0.5, 1] } as const;
/** How hard Changed is compressed (none: Changed is Flat). */
export const COMP_LEVELS = ["none", "light", "heavy"] as const;
export type CompLevel = (typeof COMP_LEVELS)[number];
/** The loops run at 90 BPM: delay times as note values there, in ms. */
export const LOOP_BPM = 90;
const BEAT_MS = 60000 / LOOP_BPM;
export const DELAY_SETS = {
  "3": [BEAT_MS / 4, BEAT_MS / 2, BEAT_MS],
  "4": [BEAT_MS / 4, BEAT_MS / 2, (BEAT_MS * 3) / 4, BEAT_MS],
} as const;
/** "1/8, 333 ms" */
export const delayLabel = (ms: number) => {
  const beats = ms / BEAT_MS;
  const name = (
    [
      [0.25, () => "1/16"],
      [0.5, () => "1/8"],
      [0.75, () => m.music_content_studio_delay_dotted_eighth()],
      [1, () => "1/4"],
    ] as const
  ).find(([b]) => Math.abs(b - beats) < 0.01)?.[1]();
  return name
    ? m.music_content_studio_delay_named({ name, ms: Math.round(ms) })
    : `${Math.round(ms)} ms`;
};
export const compLabel = (c: string) =>
  c === "none"
    ? m.music_content_studio_comp_none()
    : c === "light"
      ? m.music_content_studio_comp_light()
      : m.music_content_studio_comp_heavy();

/** The exercises; `title` and `ask` are getters, so they read the current language. */
export const STUDIO_EXERCISES: readonly {
  readonly id: StudioExercise;
  readonly title: string;
  readonly ask: string;
  readonly skillId: string;
}[] = [
  {
    id: "peak",
    get title() {
      return m.music_content_studio_peak_title();
    },
    get ask() {
      return m.music_content_studio_peak_ask();
    },
    skillId: "studio.eq-peak",
  },
  {
    id: "cut",
    get title() {
      return m.music_content_studio_cut_title();
    },
    get ask() {
      return m.music_content_studio_cut_ask();
    },
    skillId: "studio.eq-cut",
  },
  {
    id: "boost-or-cut",
    get title() {
      return m.music_content_studio_boc_title();
    },
    get ask() {
      return m.music_content_studio_boc_ask();
    },
    skillId: "studio.boost-or-cut",
  },
  {
    id: "level",
    get title() {
      return m.music_content_studio_level_title();
    },
    get ask() {
      return m.music_content_studio_level_ask();
    },
    skillId: "studio.level",
  },
  {
    id: "pan",
    get title() {
      return m.music_content_studio_pan_title();
    },
    get ask() {
      return m.music_content_studio_pan_ask();
    },
    skillId: "studio.pan",
  },
  {
    id: "compression",
    get title() {
      return m.music_content_studio_compression_title();
    },
    get ask() {
      return m.music_content_studio_compression_ask();
    },
    skillId: "studio.compression",
  },
  {
    id: "delay",
    get title() {
      return m.music_content_studio_delay_title();
    },
    get ask() {
      return m.music_content_studio_delay_ask();
    },
    skillId: "studio.delay",
  },
];

export const bandLabel = (hz: number) => (hz >= 1000 ? `${hz / 1000} kHz` : `${hz} Hz`);
export const panLabel = (p: number) =>
  p === 0
    ? m.music_content_studio_pan_centre()
    : Math.abs(p) === 1
      ? p < 0
        ? m.music_content_studio_pan_hard_left()
        : m.music_content_studio_pan_hard_right()
      : p < 0
        ? m.music_content_studio_pan_half_left()
        : m.music_content_studio_pan_half_right();

export interface StudioChange {
  eq?: { freq: number; gainDb: number; q: number };
  pan?: number;
  levelDb?: number;
  comp?: "light" | "heavy";
  delayMs?: number;
}
export interface StudioPrompt {
  id: string;
  exercise: StudioExercise;
  change: StudioChange;
  answer: string;
  choices: string[];
  skillIds: string[];
}
export interface StudioSetup {
  exercise: StudioExercise;
  bands: BandSet;
  gainDb: number;
  levels: number[];
  pans: "3" | "5";
  delays?: "3" | "4";
}

/**
 * One prompt. Bands are drawn by weight (`weightOf`, 1 when missing) so the
 * ones missed are asked more, as in Kaniwa's adaptive course.
 */
export function studioPrompt(
  rand: Rand,
  setup: StudioSetup,
  weightOf: (answer: string) => number = () => 1,
): StudioPrompt {
  const skillId = STUDIO_EXERCISES.find((e) => e.id === setup.exercise)!.skillId;
  const weighted = (items: readonly string[]) => {
    let r = rand() * items.reduce((t, x) => t + weightOf(x), 0);
    for (const x of items) if ((r -= weightOf(x)) <= 0) return x;
    return items[items.length - 1];
  };
  const bands = BAND_SETS[setup.bands].map(String);
  const base = { exercise: setup.exercise, skillIds: ["studio.ears", skillId] };
  switch (setup.exercise) {
    case "peak":
    case "cut": {
      const freq = Number(weighted(bands));
      const gainDb = setup.exercise === "peak" ? setup.gainDb : -setup.gainDb;
      return {
        ...base,
        id: `studio-${setup.exercise}-${freq}-${gainDb}`,
        change: { eq: { freq, gainDb, q: OCTAVE_Q } },
        answer: String(freq),
        choices: bands,
      };
    }
    case "boost-or-cut": {
      const freq = Number(pick(rand, bands));
      const boost = weighted(["boost", "cut"]) === "boost";
      const gainDb = boost ? setup.gainDb : -setup.gainDb;
      return {
        ...base,
        id: `studio-boost-or-cut-${freq}-${gainDb}`,
        change: { eq: { freq, gainDb, q: OCTAVE_Q } },
        answer: boost ? "boost" : "cut",
        choices: ["boost", "cut"],
      };
    }
    case "level": {
      const steps = setup.levels.map(String);
      const db = Number(weighted(steps));
      return {
        ...base,
        id: `studio-level-${db}`,
        change: { levelDb: db },
        answer: String(db),
        choices: steps,
      };
    }
    case "compression": {
      const c = weighted(COMP_LEVELS) as CompLevel;
      return {
        ...base,
        id: `studio-compression-${c}`,
        change: c === "none" ? {} : { comp: c },
        answer: c,
        choices: [...COMP_LEVELS],
      };
    }
    case "delay": {
      const times = DELAY_SETS[setup.delays ?? "3"].map((ms) => String(Math.round(ms)));
      const ms = Number(weighted(times));
      return {
        ...base,
        id: `studio-delay-${ms}`,
        change: { delayMs: ms },
        answer: String(ms),
        choices: times,
      };
    }
    case "pan": {
      // Centre is an answer too: Changed then sounds where Flat does.
      const spots = PAN_SETS[setup.pans].map(String);
      const p = Number(weighted(spots));
      return {
        ...base,
        id: `studio-pan-${p}`,
        change: { pan: p },
        answer: String(p),
        choices: PAN_SETS[setup.pans].map(String),
      };
    }
  }
}

/** Right, or one octave (or one pan step, or one level step) off: half credit, a near miss. */
export function gradeStudio(
  p: StudioPrompt,
  answered: string,
): { score: number; correct: boolean; near: boolean } {
  if (answered === p.answer) return { score: 1, correct: true, near: false };
  const i = p.choices.indexOf(p.answer);
  const j = p.choices.indexOf(answered);
  // Neighbours only count where the choices are a scale (bands an octave apart, pans, dB).
  const scaled =
    p.exercise === "pan" ||
    p.exercise === "level" ||
    p.exercise === "compression" ||
    p.exercise === "delay" ||
    ((p.exercise === "peak" || p.exercise === "cut") &&
      p.choices.every((c, k) => !k || Number(c) / Number(p.choices[k - 1]) < 2.5));
  const near = scaled && j >= 0 && Math.abs(i - j) === 1;
  return { score: near ? 0.5 : 0, correct: false, near };
}

/** The bell's gain in dB at `hz`: a log-frequency Gaussian, close enough to draw (half an octave wide at Q 1.41). */
export function bellDb(hz: number, eq: { freq: number; gainDb: number; q: number }): number {
  const octaves = Math.log2(hz / eq.freq);
  const spread = (0.5 * OCTAVE_Q) / eq.q;
  return eq.gainDb * Math.exp(-(octaves * octaves) / (2 * spread * spread));
}

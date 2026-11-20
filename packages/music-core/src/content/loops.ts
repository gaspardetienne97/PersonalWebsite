// Chord loops by ear: a song's loop, or a named loop with a borrowed, secondary,
// modal or jazz colour, played as a groove in a key set first. Chords are Roman
// numerals against the major scale of the tonic ("bVII", "iv", "V7/V", "bII7"),
// so a minor key reads i, bIII, bVI, bVII as most pop and rock charts write it.

import { parseChordSymbol } from "../theory/chords";
import { clamp, noteName, pc } from "../theory/notes";
import type { EarPrompt, PlaybackEvent } from "./ear";
import { SONG_PROGRESSIONS } from "./jam";
import { randInt, type Rand } from "./random";
import { m } from "@repo/i18n/messages.js";

export type LoopSet =
  | "songs"
  | "pop"
  | "rock"
  | "minor"
  | "borrowed"
  | "secondary"
  | "modal"
  | "turnarounds"
  | "tritone";

export const LOOP_SETS: { id: LoopSet; label: string; hint: string }[] = [
  {
    id: "songs",
    label: m.music_content_loops_songs_label(),
    hint: m.music_content_loops_songs_hint(),
  },
  { id: "pop", label: m.music_content_loops_pop_label(), hint: m.music_content_loops_pop_hint() },
  {
    id: "rock",
    label: m.music_content_loops_rock_label(),
    hint: m.music_content_loops_rock_hint(),
  },
  {
    id: "minor",
    label: m.music_content_loops_minor_label(),
    hint: m.music_content_loops_minor_hint(),
  },
  {
    id: "borrowed",
    label: m.music_content_loops_borrowed_label(),
    hint: m.music_content_loops_borrowed_hint(),
  },
  {
    id: "secondary",
    label: m.music_content_loops_secondary_label(),
    hint: m.music_content_loops_secondary_hint(),
  },
  {
    id: "modal",
    label: m.music_content_loops_modal_label(),
    hint: m.music_content_loops_modal_hint(),
  },
  {
    id: "turnarounds",
    label: m.music_content_loops_turnarounds_label(),
    hint: m.music_content_loops_turnarounds_hint(),
  },
  {
    id: "tritone",
    label: m.music_content_loops_tritone_label(),
    hint: m.music_content_loops_tritone_hint(),
  },
];

export interface ChordLoop {
  id: string;
  name: string;
  set: LoopSet;
  /** One numeral per chord, in order. */
  numerals: string[];
  /** Bars per chord (1 each when missing). */
  bars?: number[];
  /** The key is minor: it is set with i, iv, V, i. */
  minor?: boolean;
  bpm?: number;
  /** Songs that use the loop (a chord loop is a fact, not a melody). */
  songs?: string;
}

// ---------------------------------------------------------------------------
// Numerals

const DEGREES: Record<string, number> = { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 };
const NUMERAL = /^([b#]?)(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(°|ø|\+)?(maj7|7)?(?:\/(.+))?$/;

/** The numeral's root above the tonic and its chord's intervals above the root; null when it is not one. */
export function parseNumeral(numeral: string): { root: number; intervals: number[] } | null {
  const m = NUMERAL.exec(numeral);
  if (!m) return null;
  const [, acc, deg, mark, seventh, of] = m;
  const upper = deg === deg.toUpperCase();
  let root = DEGREES[deg.toUpperCase()] + (acc === "b" ? -1 : acc === "#" ? 1 : 0);
  if (of) {
    const target = parseNumeral(of);
    if (!target) return null;
    root += target.root;
  }
  const triad =
    mark === "°" || mark === "ø"
      ? [0, 3, 6]
      : mark === "+"
        ? [0, 4, 8]
        : upper
          ? [0, 4, 7]
          : [0, 3, 7];
  const top = !seventh ? [] : seventh === "maj7" ? [11] : mark === "°" ? [9] : [10];
  return { root: pc(root), intervals: [...triad, ...top] };
}

/** "♭VII", "V7/V": the numeral as shown. */
export const numeralLabel = (numeral: string) => numeral.replace(/^b/, "♭").replace(/^#/, "♯");

/** `n` mapped into the octave starting at `from`. */
const into = (n: number, from: number) => from + ((((n - from) % 12) + 12) % 12);

/** The chord in the key whose tonic pitch class is `keyPc`: root in the bass (G2 to F#3), the rest close from middle C. */
export function numeralChord(keyPc: number, numeral: string): number[] {
  const n = parseNumeral(numeral);
  if (!n) return [];
  const tones = n.intervals.map((i) => keyPc + n.root + i);
  return [into(tones[0], 43), ...tones.map((t) => into(t, 60)).sort((a, b) => a - b)];
}

/** "Bb7": the numeral's chord symbol in a key. */
export function numeralSymbol(keyPc: number, numeral: string): string {
  const n = parseNumeral(numeral);
  if (!n) return numeral;
  const key = n.intervals.join();
  const suffix =
    {
      "0,4,7": "",
      "0,3,7": "m",
      "0,3,6": "°",
      "0,4,8": "+",
      "0,4,7,10": "7",
      "0,4,7,11": "maj7",
      "0,3,7,10": "m7",
      "0,3,6,10": "ø7",
      "0,3,6,9": "°7",
      "0,3,7,11": "m(maj7)",
    }[key] ?? "";
  return `${noteName(48 + pc(keyPc + n.root), "flat", false)}${suffix}`;
}

const NAMES = ["I", "bII", "II", "bIII", "III", "IV", "#IV", "V", "bVI", "VI", "bVII", "VII"];
/** A chord symbol as a numeral in the key: "Am" in C is "vi", "Bb" in C is "bVII". */
export function symbolNumeral(symbol: string, keyPc: number): string {
  const c = parseChordSymbol(symbol);
  if (!c) return "?";
  const name = NAMES[pc(c.rootPc - keyPc)];
  const iv = c.intervals;
  const minor = iv.includes(3) && !iv.includes(4);
  const dim = minor && iv.includes(6) && !iv.includes(7);
  const base = minor ? name.toLowerCase() : name;
  const seventh = iv.includes(10) ? "7" : iv.includes(11) ? "maj7" : "";
  return `${base}${dim ? "°" : ""}${seventh}`;
}

const pcKey = (ms: readonly number[]) => [...new Set(ms.map(pc))].sort((a, b) => a - b).join();
/** Which of `palette` these notes make in the key, in any octave or inversion. */
export const numeralOfNotes = (
  keyPc: number,
  midis: readonly number[],
  palette: readonly string[],
) => palette.find((t) => pcKey(numeralChord(keyPc, t)) === pcKey(midis));

// ---------------------------------------------------------------------------
// Loops

const loop = (
  set: LoopSet,
  id: string,
  numerals: string,
  extra: Partial<ChordLoop> = {},
): ChordLoop => ({
  id,
  set,
  name: numerals.split(" ").map(numeralLabel).join("-"),
  numerals: numerals.split(" "),
  ...extra,
});

/** Songs from Jam, as numerals in the key the Jam data gives. */
const SONG_LOOPS: ChordLoop[] = SONG_PROGRESSIONS.map((p) => ({
  id: p.id,
  set: "songs",
  name: `${p.name} (${p.song!.artist})`,
  numerals: p.chords.map((ch) => symbolNumeral(ch.symbol, p.keyPc)),
  bars: p.chords.map((ch) => ch.bars),
  minor: p.key.endsWith("minor"),
  bpm: p.bpm,
}));

export const CHORD_LOOPS: ChordLoop[] = [
  ...SONG_LOOPS,
  loop("pop", "pop-axis", "I V vi IV", { songs: "Let It Be, No Woman, No Cry" }),
  loop("pop", "doo-wop", "I vi IV V", { songs: "Stand by Me, Heart and Soul" }),
  loop("pop", "pop-minor-start", "vi IV I V"),
  loop("pop", "twist", "I IV V IV", { songs: "Twist and Shout, La Bamba" }),
  loop("pop", "pop-iv-vi", "I IV vi V"),
  loop("rock", "rock-bvii-iv", "I bVII IV", { songs: "Sweet Home Alabama, Gloria" }),
  loop("rock", "rock-bvii-iv-i", "I bVII IV I", {
    songs: m.music_content_loops_song_hey_jude_coda(),
  }),
  loop("rock", "aeolian-shuttle", "i bVII bVI bVII", {
    minor: true,
    songs: "All Along the Watchtower",
  }),
  loop("rock", "andalusian", "i bVII bVI V", { minor: true, songs: "Hit the Road Jack" }),
  loop("rock", "creep", "I III IV iv", { songs: "Creep" }),
  loop("minor", "andalusian", "i bVII bVI V", { minor: true }),
  loop("minor", "i-iv-v", "i iv v i", { minor: true }),
  loop("minor", "i-bvi-biii-bvii", "i bVI bIII bVII", { minor: true, songs: "Zombie" }),
  loop("minor", "i-iv-major-v", "i iv V i", { minor: true }),
  loop("minor", "i-bvi-bvii", "i bVI bVII i", { minor: true }),
  loop("borrowed", "minor-plagal", "I IV iv I"),
  loop("borrowed", "mario", "I bVI bVII I"),
  loop("borrowed", "biii-iv", "I bIII IV I"),
  loop("borrowed", "bvii-iv", "I bVII IV I"),
  loop("borrowed", "bvi-iv", "I vi bVI I"),
  loop("secondary", "v-of-v", "I V7/V V I"),
  loop("secondary", "v-of-vi", "I V7/vi vi IV"),
  loop("secondary", "v-of-ii", "I V7/ii ii V"),
  loop("secondary", "v-of-iv", "I V7/IV IV I"),
  loop("secondary", "v-of-v-from-vi", "I vi V7/V V"),
  loop("modal", "dorian", "i IV", { minor: true, bars: [2, 2], songs: "Oye Como Va" }),
  loop("modal", "mixolydian", "I bVII", { bars: [2, 2] }),
  loop("modal", "lydian", "I II", { bars: [2, 2] }),
  loop("modal", "phrygian", "i bII", { minor: true, bars: [2, 2] }),
  loop("modal", "aeolian", "i bVI bVII i", { minor: true }),
  loop("turnarounds", "i-vi-ii-v", "Imaj7 vi7 ii7 V7"),
  loop("turnarounds", "iii-vi-ii-v", "iii7 VI7 ii7 V7"),
  loop("turnarounds", "i-vi7-ii-v", "Imaj7 VI7 ii7 V7"),
  loop("turnarounds", "ii-v-i", "ii7 V7 Imaj7", { bars: [1, 1, 2] }),
  loop("turnarounds", "backdoor", "iv7 bVII7 Imaj7", { bars: [1, 1, 2] }),
  loop("turnarounds", "passing-diminished", "Imaj7 #i°7 ii7 V7"),
  loop("tritone", "ii-v-i", "ii7 V7 Imaj7", { bars: [1, 1, 2] }),
  loop("tritone", "ii-subv-i", "ii7 bII7 Imaj7", { bars: [1, 1, 2] }),
  loop("tritone", "turnaround", "Imaj7 vi7 ii7 V7"),
  loop("tritone", "turnaround-sub", "Imaj7 vi7 ii7 bII7"),
].map((l) => ({ ...l, id: l.set === "songs" ? l.id : `${l.set}.${l.id}` }));

export const loopsIn = (set: string) => CHORD_LOOPS.filter((l) => l.set === set);

/** Every numeral a set uses, by root then major before minor: the answer buttons. */
export function loopPalette(set: string): string[] {
  const all = [...new Set(loopsIn(set).flatMap((l) => l.numerals))];
  const rank = (t: string) => {
    const n = parseNumeral(t);
    return n ? n.root * 10 + (t.includes("/") ? 5 : 0) + (/^[b#]?[iv]/.test(t) ? 1 : 0) : 999;
  };
  return all.sort((a, b) => rank(a) - rank(b));
}

export type LoopPrompt = EarPrompt & { keyPc: number; minor: boolean; beat: number };

/** At least 4 bars are heard: a shorter loop plays twice. */
export const loopRepeats = (bars: number) => (bars < 4 ? 2 : 1);

/**
 * One loop in a key: one playback event per chord (its bars long), at the
 * loop's tempo held between 84 and 120 so every chord has time to sound.
 * The key cadence comes from the drill, once per key, not from the prompt.
 */
export function loopPrompt(
  rand: Rand,
  opts: { loop: ChordLoop; difficulty: number; keyPc?: number; choices?: string[] },
): LoopPrompt {
  const l = opts.loop;
  const keyPc = opts.keyPc ?? randInt(rand, 0, 11);
  const beat = 60 / clamp(l.bpm ?? 100, 84, 120);
  const bar = 4 * beat;
  let at = 0;
  const playback: PlaybackEvent[] = l.numerals.map((t, i) => {
    const bars = l.bars?.[i] ?? 1;
    const ev = { midi: numeralChord(keyPc, t), time: at * bar, duration: bars * bar - 0.05 };
    at += bars;
    return ev;
  });
  const note = noteName(48 + keyPc, "flat", false);
  const key = l.minor
    ? m.music_content_loops_key_minor({ note })
    : m.music_content_loops_key_major({ note });
  const chords = l.numerals.map((t) => numeralSymbol(keyPc, t)).join(", ");
  return {
    id: `loop-${l.id}-${keyPc}`,
    drill: "loop",
    skillIds: ["ear.loops", `ear.loops.${l.set}`],
    playback,
    answer: l.numerals.join(" "),
    choices: opts.choices ?? loopPalette(l.set),
    difficulty: opts.difficulty,
    caption: l.songs
      ? m.music_content_loops_caption_songs({ name: l.name, songs: l.songs, key, chords })
      : m.music_content_loops_caption({ name: l.name, key, chords }),
    keyPc,
    minor: !!l.minor,
    beat,
  };
}

export interface GrooveNote {
  midi: number;
  time: number;
  duration: number;
  velocity: number;
  voice?: "drum";
}

/**
 * The loop as a band would play it: chords on 1 and 3, the root in the bass on
 * 1 and 3, and a straight rock beat, `loopRepeats` times through.
 */
export function loopGroove(p: Pick<LoopPrompt, "playback" | "beat">): GrooveNote[] {
  const bar = 4 * p.beat;
  const pass = Math.max(...p.playback.map((e) => e.time + e.duration)) + 0.05;
  const repeats = loopRepeats(Math.round(pass / bar));
  const out: GrooveNote[] = [];
  for (let r = 0; r < repeats; r++)
    for (const e of p.playback) {
      const bars = Math.max(1, Math.round((e.duration + 0.05) / bar));
      const [bass, ...upper] = e.midi;
      for (let b = 0; b < bars; b++) {
        const t0 = r * pass + e.time + b * bar;
        for (const at of [0, 2]) {
          const t = t0 + at * p.beat;
          for (const m of upper)
            out.push({ midi: m, time: t, duration: 1.9 * p.beat, velocity: 0.5 });
          out.push({ midi: bass, time: t, duration: 1.9 * p.beat, velocity: 0.65 });
        }
        const hit = (midi: number, at: number, velocity: number) =>
          out.push({ midi, time: t0 + at * p.beat, duration: 0.1, velocity, voice: "drum" });
        for (let e8 = 0; e8 < 8; e8++) hit(42, e8 / 2, e8 % 2 ? 0.25 : 0.35);
        hit(36, 0, 0.6);
        hit(36, 2.5, 0.45);
        hit(38, 1, 0.5);
        hit(38, 3, 0.5);
      }
    }
  return out.sort((a, b) => a.time - b.time);
}

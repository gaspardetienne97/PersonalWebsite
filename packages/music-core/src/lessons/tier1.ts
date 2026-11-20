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
import { GROOVE_VOICES } from "../content/winds-pads";
import { fillGroove } from "../content/pad-skills";
import { parseChordSymbol } from "../theory/chords";
import { isBlackKey, noteName, pc } from "../theory/notes";
import type { Lesson, LessonFigure, LessonSound, LessonStep } from "./types";
import { m } from "@repo/i18n/messages.js";
import { formatList, formatNumber } from "@repo/i18n/format";

/**
 * The keys figure; `span` is every note the screen's steps will show, so the keyboard keeps its size
 * from step to step. It starts and ends on a white key, which Piano draws whole.
 */
export const keys = (
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
  m.music_cards_tier1_interval_0,
  m.music_cards_tier1_interval_1,
  m.music_cards_tier1_interval_2,
  m.music_cards_tier1_interval_3,
  m.music_cards_tier1_interval_4,
  m.music_cards_tier1_interval_5,
  m.music_cards_tier1_interval_6,
  m.music_cards_tier1_interval_7,
  m.music_cards_tier1_interval_8,
  m.music_cards_tier1_interval_9,
  m.music_cards_tier1_interval_10,
  m.music_cards_tier1_interval_11,
  m.music_cards_tier1_interval_12,
  m.music_cards_tier1_interval_13,
  m.music_cards_tier1_interval_14,
  m.music_cards_tier1_interval_15,
  m.music_cards_tier1_interval_16,
  m.music_cards_tier1_interval_17,
];
const gap = (semis: number) =>
  INTERVALS[semis]?.() ?? m.music_cards_half_steps({ count: semis });

/** What the drill's type says in words, true of every chord the type gives. */
const IDEAS: Record<JazzVoicingId, () => string> = {
  sevenths: m.music_cards_tier1_idea_sevenths,
  "so-what": m.music_cards_tier1_idea_so_what,
  quartal: m.music_cards_tier1_idea_quartal,
  sus: m.music_cards_tier1_idea_sus,
  "two-hand": m.music_cards_tier1_idea_two_hand,
  close: m.music_cards_tier1_idea_close,
  drop2: m.music_cards_tier1_idea_drop2,
  locked: m.music_cards_tier1_idea_locked,
  garland: m.music_cards_tier1_idea_garland,
  evans: m.music_cards_tier1_idea_evans,
  monk: m.music_cards_tier1_idea_monk,
  upper: m.music_cards_tier1_idea_upper,
  "quartal-tune": m.music_cards_tier1_idea_quartal_tune,
  "slash-tune": m.music_cards_tier1_idea_slash_tune,
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
  const marks = (ms: number[]) => keys(Object.fromEntries(ms.map((x) => [x, name(x)])), notes);
  const steps: LessonStep[] = notes.map((x, i) => {
    const left = c.left.includes(x);
    return {
      text:
        i === 0
          ? (left ? m.music_cards_tier1_stack_start_left : m.music_cards_tier1_stack_start_right)({
              note: name(x),
            })
          : (left ? m.music_cards_tier1_stack_add_left : m.music_cards_tier1_stack_add_right)({
              note: name(x),
              interval: gap(x - notes[i - 1]),
              below: name(notes[i - 1]),
            }),
      figure: marks(notes.slice(0, i + 1)),
    };
  });
  return {
    id: lessonId,
    title: type.label,
    screens: [
      {
        title: type.label,
        text: IDEAS[id](),
        figure: marks(notes),
        sound: chords(
          ...[c, all[all.indexOf(c) + 1]].filter(Boolean).map((x) => [...x.left, ...x.right]),
        ),
      },
      {
        title: m.music_cards_tier1_stacked_title(),
        text: (id === "monk"
          ? m.music_cards_tier1_stacked_text_monk
          : m.music_cards_tier1_stacked_text)({ symbol: c.symbol }),
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
const countList = (beats: number[]) => formatList(beats.map(count));

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
    title: m.music_cards_tier1_groove_title(),
    screens: [
      {
        title: m.music_cards_tier1_groove_kick_title(),
        text: m.music_cards_tier1_groove_kick_text(),
        sound: drums(g, ["kick"]),
        figure: grid(g, ["kick"]),
      },
      {
        title: m.music_cards_tier1_groove_snare_title(),
        text: m.music_cards_tier1_groove_snare_text(),
        sound: drums(g, ["snare"]),
        figure: grid(g, ["snare"]),
      },
      {
        title: m.music_cards_tier1_groove_hat_title(),
        text: m.music_cards_tier1_groove_hat_text(),
        sound: drums(g, ["hat"]),
        figure: grid(g, ["hat"]),
      },
      {
        title: m.music_cards_tier1_groove_all_title(),
        text: m.music_cards_tier1_groove_all_text(),
        figure: grid(g, []),
        steps: [
          {
            text: m.music_cards_tier1_groove_hat_step({ counts: countList(g.hat) }),
            sound: drums(g, ["hat"]),
            figure: grid(g, ["hat"]),
          },
          {
            text: m.music_cards_tier1_groove_snare_step({ counts: countList(g.snare) }),
            sound: drums(g, ["hat", "snare"]),
            figure: grid(g, ["hat", "snare"]),
          },
          {
            text: m.music_cards_tier1_groove_kick_step({ counts: countList(g.kick) }),
            sound: drums(g, ["hat", "snare", "kick"]),
            figure: grid(g, ["hat", "snare", "kick"]),
          },
        ],
      },
      {
        title: m.music_cards_tier1_groove_grid_title(),
        text: m.music_cards_tier1_groove_grid_text({
          levels: levels.join(m.music_cards_tier1_then()),
        }),
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
    text: m.music_cards_tier1_home_step({
      symbol: functionSymbol(0, ["I", "IV", "V", "I"][i]),
      numeral: ["I", "IV", "V", "I"][i],
      text,
    }),
    figure: keys(names(triad(["I", "IV", "V", "I"][i])), TRIAD_SPAN),
    sound: { notes: [{ midi: cadence[i].midi, at: 0, dur: 1.6 }] },
  });
  const run = scaleRun(C, "major", "ascending");
  const home = noteName(C, "flat", false);
  /** The scale's first `n` notes by degree, the top 1 named home. */
  const scaleKeys = (n: number) =>
    keys(
      Object.fromEntries(
        run.slice(0, n).map((x, i) => [x, i === 7 ? m.music_cards_tier1_home_label() : String(i + 1)]),
      ),
      run,
    );
  const scaleSound = (n: number): LessonSound => ({
    notes: run
      .slice(0, n)
      .map((x, i) => ({ midi: [x], at: i * 0.4, dur: i === n - 1 ? 1.2 : 0.38 })),
  });
  return {
    id: "by-ear.home",
    title: m.music_cards_tier1_home_title(),
    screens: [
      {
        title: m.music_cards_tier1_home_one_title(),
        text: m.music_cards_tier1_home_one_text({ note: home }),
        figure: keys({ [C]: m.music_cards_tier1_home_label() }, [C - 5, C + 7]),
        sound: { notes: [{ midi: [C - 12], at: 0, dur: 4 }] },
      },
      {
        title: m.music_cards_tier1_home_resolve_title(),
        text: m.music_cards_tier1_home_resolve_text(),
        figure: scaleKeys(7),
        options: [
          { label: m.music_cards_tier1_unresolved(), sound: scaleSound(7), figure: scaleKeys(7) },
          { label: m.music_cards_tier1_resolved(), sound: scaleSound(8), figure: scaleKeys(8) },
        ],
      },
      {
        title: m.music_cards_tier1_home_cadence_title(),
        text: m.music_cards_tier1_home_cadence_text(),
        figure: keys(names(triad("I")), TRIAD_SPAN),
        sound: { notes: cadence.map((e, i) => ({ midi: e.midi, at: i * 0.9, dur: 0.8 })) },
        steps: [
          step(0, m.music_cards_tier1_home_step_1()),
          step(1, m.music_cards_tier1_home_step_2()),
          step(2, m.music_cards_tier1_home_step_3()),
          step(3, m.music_cards_tier1_home_step_4()),
        ],
      },
      {
        title: m.music_cards_tier1_home_recording_title(),
        text: m.music_cards_tier1_home_recording_text(),
      },
      {
        title: m.music_cards_tier1_home_checked_title(),
        text: m.music_cards_tier1_home_checked_text(),
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
/** What a tone does in the chord, as a sentence with its name. */
const ROLES: Record<string, (i: { name: string }) => string> = {
  R: m.music_cards_tier1_role_R,
  "3": m.music_cards_tier1_role_3,
  b3: m.music_cards_tier1_role_b3,
  "5": m.music_cards_tier1_role_5,
  b5: m.music_cards_tier1_role_b5,
  b7: m.music_cards_tier1_role_b7,
  "7": m.music_cards_tier1_role_7,
  "6": m.music_cards_tier1_role_6,
};

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
  const names = formatList(tones.map((t) => t.name));
  return {
    id: "call-response.chord-tones",
    title: m.music_cards_tier1_tones_title(),
    screens: [
      {
        title: m.music_cards_tier1_tones_chord_title(),
        text: m.music_cards_tier1_tones_chord_text({ chord, names }),
        figure: upTo(tones.length),
        sound: {
          notes: [
            ...tones.map((t, i) => ({ midi: [t.midi], at: i * 0.4, dur: 0.4 })),
            { midi: tones.map((t) => t.midi), at: tones.length * 0.4 + 0.2, dur: 1.6 },
          ],
        },
      },
      {
        title: m.music_cards_tier1_tones_each_title(),
        text: m.music_cards_tier1_tones_each_text(),
        steps: tones.map((t, i) => ({
          text: (ROLES[t.label] ?? m.music_cards_tier1_role_other)({ name: t.name }),
          figure: upTo(i + 1),
          sound: { notes: [{ midi: [t.midi], at: 0, dur: 1 }] },
        })),
      },
      {
        title: m.music_cards_tier1_tones_land_title(),
        text: m.music_cards_tier1_tones_land_text(),
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
  return Number.isInteger(r)
    ? formatNumber(r)
    : formatNumber(r, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
};

export function biteVibratoLesson(): Lesson {
  const going = VIBRATO_SETS.find((v) => v.bpm === 80)!;
  const slowest = VIBRATO_SETS[0];
  return {
    id: "aerophone.vibrato",
    title: m.music_cards_tier1_vibrato_title(),
    screens: [
      {
        title: m.music_cards_tier1_vibrato_bite_title(),
        text: m.music_cards_tier1_vibrato_bite_text(),
        // A held G to pulse on: the fingering stays put, only the bite moves.
        figure: { kind: "aerophone", midi: 67 },
      },
      {
        title: m.music_cards_tier1_vibrato_pulses_title(),
        text: m.music_cards_tier1_vibrato_pulses_text({
          slowPulses: slowest.pulses,
          slowBpm: slowest.bpm,
          slowRate: rateText(slowest),
          topPulses: going.pulses,
          topBpm: going.bpm,
          topRate: rateText(going),
        }),
        options: VIBRATO_SETS.map((v) => ({
          label: m.music_cards_tier1_vibrato_option({ pulses: v.pulses, bpm: v.bpm }),
          sound: pulses(vibratoRate(v), 2),
        })),
      },
      {
        title: m.music_cards_tier1_vibrato_hear_title(),
        text: m.music_cards_tier1_vibrato_hear_text(),
      },
      {
        title: m.music_cards_tier1_vibrato_checks_title(),
        text: m.music_cards_tier1_vibrato_checks_text({
          seconds: VIBRATO.seconds,
          tolerance: Math.round(VIBRATO.rateTolerance * 100),
          evenness: Math.round(VIBRATO.evenness * 100),
        }),
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
  const groove = bar(0);
  // The fill keeps the groove's hats under it, so it has more hits than a groove bar.
  return { groove, fill: { ...bar(3), hat: groove.hat } };
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
  const CRASH = GROOVE_VOICES.find((v) => v.id === "crash")!.midi;
  const KICK = GROOVE_LANES.find((l) => l.id === "kick")!.midi;
  return {
    id: "pads.improvise",
    title: m.music_cards_tier1_pads_title(),
    screens: [
      {
        title: m.music_cards_tier1_pads_band_title(),
        text: m.music_cards_tier1_pads_band_text(),
        figure: padGrid([groove]),
      },
      {
        title: m.music_cards_tier1_pads_vary_title(),
        text: m.music_cards_tier1_pads_vary_text(),
        figure: padGrid([groove]),
        options: [
          {
            label: m.music_cards_tier1_pads_plain(),
            sound: padSound([groove, groove]),
            figure: padGrid([groove]),
          },
          {
            label: m.music_cards_tier1_pads_varied(),
            sound: padSound([groove, varied]),
            figure: padGrid([varied]),
          },
        ],
      },
      {
        title: m.music_cards_tier1_pads_fill_title(),
        text: m.music_cards_tier1_pads_fill_text(),
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
        title: m.music_cards_tier1_pads_space_title(),
        text: m.music_cards_tier1_pads_space_text(),
        figure: padGrid([bare]),
        sound: padSound([bare, bare]),
      },
    ],
  };
}

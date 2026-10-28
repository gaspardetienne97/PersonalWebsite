import { describe, expect, it } from "vitest";
import { CHORD_SHAPES, SCALE_DATA, SKILL_IDS, TWO_HAND } from "../data";
import { LEARNING_PATHS } from "../progress/paths";
import { tuningById } from "../theory/fretboard";
import { CATALOG, exerciseIdFor, rhythmExerciseId } from "./catalog";
import {
  cadencePrompt,
  CHORD_FUNCTIONS,
  chordFunctionPrompt,
  functionToken,
  chordQualityPrompt,
  EAR_DRILLS,
  intervalPrompt,
  melodyDictationPrompt,
  progressionPrompt,
  EAR_SCALES,
  EAR_INVERSIONS,
  inversionPrompt,
  BASS_LEVELS,
  bassLinePrompt,
  finePitchPrompt,
  errorDetectPrompt,
  scalePrompt,
  SCALE_DEGREE_LEVELS,
  scaleDegreePrompt,
} from "./ear";
import {
  CHORD_SCALE_CHANGES,
  chordScaleTargets,
  LICK_CATEGORIES,
  lickSkills,
  twoHandSkills,
  voicingTargets,
  voiceLeadingTargets,
} from "./piano";
import { rng } from "./random";
import { flashcardPrompt, sightReadingScore, sightReadingSkills } from "./reading";
import { RHYTHM_PATTERNS, rhythmSkills } from "./rhythm";
import { chordShapeSkills, intervalRecallPrompt, RECALL_INTERVALS, scaleSkills } from "./technique";
import {
  AEROPHONE_MODES,
  aerophoneSkills,
  GROOVES,
  grooveSkills,
  RUDIMENTS,
  rudimentSkills,
} from "./winds-pads";
import { CADENCES_AND_QUALITIES } from "../data";
import { INTERVALS } from "../theory/intervals";

const ROUTES = [
  "/music/ear/intervals",
  "/music/ear/interval-compare",
  "/music/ear/chord-qualities",
  "/music/ear/cadences",
  "/music/ear/chord-functions",
  "/music/ear/progressions",
  "/music/ear/song-loops",
  "/music/ear/scales",
  "/music/ear/inversions",
  "/music/ear/bass-lines",
  "/music/ear/fine-pitch",
  "/music/ear/wrong-note",
  "/music/ear/scale-degrees",
  "/music/ear/melody-dictation",
  "/music/ear/repertoire-transfer",
  "/music/ear/mixed",
  "/music/reading",
  "/music/rhythm",
  "/music/scales",
  "/music/two-hand",
  "/music/pedal",
  "/music/comping",
  "/music/accompany",
  "/music/voicings",
  "/music/licks",
  "/music/phrases",
  "/music/chord-scales",
  "/music/fretboard",
  "/music/chords",
  "/music/strum",
  "/music/pads",
  "/music/aerophone",
  "/music/circle",
  "/music/listening",
  "/music/by-ear",
  "/music/call-response",
  "/music/ear/feel",
  "/music/lab",
  "/music/jam",
  "/music/library?tab=songs",
];

describe("drill catalog", () => {
  it("has one entry per activity on the architecture routes", () => {
    expect(CATALOG.map((e) => e.route)).toEqual(ROUTES);
    expect(new Set(CATALOG.map((e) => e.id)).size).toBe(CATALOG.length);
    for (const e of CATALOG) {
      expect(e.blurb, e.id).toMatch(/^[A-Z].*\.$/);
      expect(e.blurb).not.toMatch(/[–—]/);
      expect(e.instruments.length).toBeGreaterThan(0);
      expect(e.exerciseId).toBeTruthy();
      for (const m of e.modes) expect(m.exerciseId, `${e.id}/${m.id}`).toBeTruthy();
    }
    expect(CATALOG.find((e) => e.id === "fretboard")!.modes.map((m) => m.id)).toEqual([
      "spider",
      "positions",
      "note-finder",
      "interval-recall",
      "legato",
      "bends",
      "harmonics",
    ]);
    expect(CATALOG.find((e) => e.id === "chords")!.modes).toHaveLength(5);
    expect(CATALOG.find((e) => e.id === "aerophone")!.modes).toHaveLength(13);
    expect(CATALOG.find((e) => e.id === "pads")!.modes.map((m) => m.id)).toEqual([
      "rudiment",
      "groove",
      "steady",
      "dynamics",
      "fills",
      "echo",
      "ostinato",
      "orchestrate",
      "improvise",
      "chop",
      "repeat",
      "song",
    ]);
  });

  it("uses ear.* exercise ids and every exercise id the learning paths name", () => {
    const ids = new Set(
      CATALOG.flatMap((e) => [e.exerciseId, ...e.modes.map((m) => m.exerciseId)]),
    );
    for (const e of CATALOG.filter((x) => x.id.startsWith("ear-")))
      expect(e.exerciseId).toMatch(/^ear\./);
    const pathIds = Object.values(LEARNING_PATHS).flatMap((p) =>
      p.steps.flatMap((s) => s.exerciseIds ?? []),
    );
    for (const id of pathIds) {
      // Phrases record one exercise per instrument, fretted drills a ukulele variant, Song Studio
      // its own, and Create (not a drill) a loop built live on the pads.
      const covered =
        ids.has(id) ||
        id === "technique.mpc.live-loop" ||
        ids.has(id.replace(/^technique\.ukulele\./, "technique.guitar.")) ||
        RHYTHM_PATTERNS.some((p) => rhythmExerciseId(p.id) === id) ||
        /^repertoire\.phrases\.(piano|guitar|ukulele|aerophone)$/.test(id) ||
        id === "song.studio";
      expect(covered, id).toBe(true);
    }
    expect(exerciseIdFor("technique.guitar.chord-perfect", "ukulele")).toBe(
      "technique.ukulele.chord-perfect",
    );
  });
});

describe("skill ids", () => {
  it("only emits ids that exist in the seed graph", () => {
    const r = rng(1);
    const std = tuningById("guitar.standard")!;
    const emitted = [
      ...CATALOG.flatMap((e) => [...e.skillIds, ...e.modes.flatMap((m) => m.skillIds)]),
      ...EAR_DRILLS.flatMap((d) => d.skillIds),
      ...Object.values(LEARNING_PATHS).flatMap((p) => p.steps.flatMap((s) => s.skillIds)),
      ...INTERVALS.flatMap((i) => intervalPrompt(r, { difficulty: 0.5, token: i.token }).skillIds),
      ...CADENCES_AND_QUALITIES.chordQualities.flatMap(
        (q) => chordQualityPrompt(r, { difficulty: 1, token: q.token }).skillIds,
      ),
      ...CADENCES_AND_QUALITIES.cadences.flatMap(
        (c) => cadencePrompt(r, { difficulty: 0.5, token: c.token }).skillIds,
      ),
      ...CHORD_FUNCTIONS.flatMap((f) =>
        [{}, { minor: true }, { seventh: true }, { minor: true, seventh: true }].flatMap((k) => [
          ...chordFunctionPrompt(r, { difficulty: 0.5, token: functionToken(f.token, k) }).skillIds,
          ...progressionPrompt(r, { difficulty: 0.9, token: functionToken(f.token, k) }).skillIds,
        ]),
      ),
      ...finePitchPrompt(r, { difficulty: 0.5, cents: 25 }).skillIds,
      ...errorDetectPrompt(r, { difficulty: 0.5, level: "major-diatonic" }).skillIds,
      ...BASS_LEVELS.flatMap((l) => bassLinePrompt(r, { difficulty: 0.5, level: l.id }).skillIds),
      ...EAR_INVERSIONS.flatMap(
        (x) => inversionPrompt(r, { difficulty: 0.9, token: x.token }).skillIds,
      ),
      ...EAR_SCALES.flatMap((x) => scalePrompt(r, { difficulty: 0.5, token: x.token }).skillIds),
      ...SCALE_DEGREE_LEVELS.flatMap((l) =>
        l.degrees.flatMap((d) => [
          ...scaleDegreePrompt(r, { difficulty: 0.5, level: l.id, degree: d }).skillIds,
          ...melodyDictationPrompt(r, { difficulty: 0.9, level: l.id, degree: d }).skillIds,
        ]),
      ),
      ...(["major", "minor", "altered"] as const).flatMap((v) =>
        voicingTargets({ variant: v }).flatMap((t) => t.skillIds),
      ),
      ...voiceLeadingTargets().flatMap((t) => t.skillIds),
      ...(Object.keys(CHORD_SCALE_CHANGES) as ("major" | "minor")[]).flatMap((c) =>
        chordScaleTargets(c).flatMap((t) => t.skillIds),
      ),
      ...LICK_CATEGORIES.flatMap(lickSkills),
      ...TWO_HAND.options.flatMap((o) => twoHandSkills(o.id)),
      ...RHYTHM_PATTERNS.flatMap((p) => rhythmSkills(p.id)),
      ...rhythmSkills("pulse"),
      ...(
        Object.keys(SCALE_DATA.semitonesByKind) as (keyof typeof SCALE_DATA.semitonesByKind)[]
      ).flatMap((k) => scaleSkills(k)),
      ...scaleSkills("major", "arpeggio"),
      ...scaleSkills("major", "blocked"),
      ...(["guitar", "ukulele"] as const).flatMap((i) =>
        (["build", "pick", "strum", "changes"] as const).flatMap((m) => chordShapeSkills(i, m)),
      ),
      ...RECALL_INTERVALS.flatMap(
        (i) => intervalRecallPrompt(r, { tuning: std, region: 0, semitones: i.semitones }).skillIds,
      ),
      ...AEROPHONE_MODES.flatMap((m) => aerophoneSkills(m.id)),
      ...RUDIMENTS.flatMap((p) => rudimentSkills(p.id)),
      ...GROOVES.flatMap((g) => grooveSkills(g.value)),
      ...(["treble", "bass"] as const).flatMap((clef) => [
        ...flashcardPrompt(r, {
          kind: "note",
          clefs: [clef],
          key: "C major",
          range: [43, 84],
          difficulty: 0.5,
        }).skillIds,
        ...flashcardPrompt(r, {
          kind: "chord",
          clefs: [clef],
          key: "C major",
          range: [43, 84],
          difficulty: 0.5,
        }).skillIds,
      ]),
      ...sightReadingSkills(
        sightReadingScore(r, {
          level: "level-3",
          instrument: "piano",
          clefs: ["treble", "bass"],
          measures: 2,
          meter: "compound",
          bpm: 90,
        }),
      ),
    ];
    const unknown = [...new Set(emitted)].filter((id) => !SKILL_IDS.has(id));
    expect(unknown).toEqual([]);
    expect(CHORD_SHAPES.length).toBe(31);
  });
});

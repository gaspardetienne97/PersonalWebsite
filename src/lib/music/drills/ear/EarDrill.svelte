<script lang="ts">
  // One ear drill page for all seven routes. A run is 10 prompts; each prompt is
  // heard, answered (choice, play-back, voice, pocket recall) and, in Practice,
  // judged in place with a Continue step. Listen along is never a run.
  import { onDestroy, untrack } from "svelte";
  import { m } from "@repo/i18n/messages.js";
  import { formatList } from "@repo/i18n/format";
  import { page } from "$app/state";
  import type { Assistance, InputSource, Label, Metric, NoteEvent } from "@repo/music-core";
  import { noteName, pc } from "@repo/music-core";
  import { CADENCES_AND_QUALITIES } from "@repo/music-core/data/index";
  import {
    CHORD_FUNCTIONS,
    EAR_DEFAULT_CONFIG,
    EAR_SCALES,
    EAR_INVERSIONS,
    inversionVoicing,
    BASS_LEVELS,
    CENT_STEPS,
    finePitchPrompt,
    errorDetectPrompt,
    staircase,
    scalePlayback,
    type ScaleDirection,
    EAR_DRILLS,
    EAR_INTERVALS,
    functionChord,
    functionLabel,
    functionOfNotes,
    functionToken,
    parseFunction,
    functionPlayback,
    KEY_CHANGES,
    KEY_CHANGE_NUMERALS,
    keyChangeCaption,
    keyChangeLabel,
    keyChangePlayback,
    keyCadence,
    chordResolution,
    promptKey,
    stepHome,
    SCALE_DEGREE_LEVELS,
    SCALE_DEGREES,
    phrasesFromScore,
    rankPhrases,
    repertoirePlan,
    repertoirePrompt,
    type EarPrompt,
    type RankedPhrase,
  } from "@repo/music-core/content/ear";
  import { catalogEntry } from "@repo/music-core/content/catalog";
  import { earLessons, loopLessonItems } from "@repo/music-core/lessons/ear";
  import { LOOP_SETS, loopGroove, loopPalette, numeralChord, numeralLabel, numeralOfNotes } from "@repo/music-core/content/loops";
  import { rng } from "@repo/music-core/content/random";
  import { intervalBySemitones } from "@repo/music-core/theory/intervals";
  import {
    classifyChord,
    gradeChoice,
    gradeChordPlayback,
    gradeInversionPlayback,
    inversionOf,
    gradeChordQualityPlayback,
    gradeIntervalPlayback,
    gradeMelodyDictation,
    gradeScaleDegree,
    gradeSequence,
  } from "@repo/music-core/scoring/ear";
  import type { Graded } from "@repo/music-core/scoring/grade";
  import { skillSummaries } from "@repo/music-core/progress/analytics";
  import { decayMastery, isDueForReview } from "@repo/music-core/progress/mastery";
  import type { Score, ScoringEvent } from "@repo/music-core";
  import DrillShell, { type DrillMode, type Phase, type RunContext, type SetupClause } from "#lib/music/components/DrillShell.svelte";
  import { earTrainer } from "#lib/music/drills/ear/trainer.ts";
  import InstrumentStage from "#lib/music/components/InstrumentStage.svelte";
  import Choice from "#lib/music/components/Choice.svelte";
  import Stat from "#lib/music/components/Stat.svelte";
  import Results, { type RunSummary } from "#lib/music/components/Results.svelte";
  import { Flashes, type CellMarks } from "#lib/music/components/feedback.svelte.ts";
  import { btn, btnPrimary, btnStage } from "#lib/music/components/ui.ts";
  import { DrillSetup } from "#lib/music/setup.svelte.ts";
  import { assistanceFor, capture, pct, runInstrument, runSource, type Capture } from "#lib/music/drill.svelte.ts";
  import { practice } from "#lib/music/practice.svelte.ts";
  import { audio, db, getSetting, mic, putSetting, settings } from "#lib/music/runtime/index.ts";
  import DegreeWheel from "./DegreeWheel.svelte";
  import EarVisual from "./EarVisual.svelte";
  import EarReveal, { ON_INSTRUMENT } from "./EarReveal.svelte";
  import ConfusionGrid from "./ConfusionGrid.svelte";
  import Volume2 from "@lucide/svelte/icons/volume-2";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import Play from "@lucide/svelte/icons/play";
  import { namingKeyOf, spellDegree, spellInKey } from "./degrees";
  import { keyName, note, useNamingKey } from "#lib/music/names.svelte.ts";
  import { nextRun, type NextRun } from "#lib/music/advance.svelte.ts";
  import KeyPicker from "#lib/music/components/KeyPicker.svelte";
  import {
    buildSession,
    cadenceShift,
    cleanMeansFor,
    times,
    confusions,
    KIND_LABEL,
    levelDegrees,
    MIX_KINDS,
    mixKinds,
    NO_PLAYBACK,
    perKind,
    retryPrompts,
    setLadder,
    targetsFor,
    tokenLabel,
    type AnswerRecord,
    type EarKind,
    type LabelMode,
  } from "./session";

  let { slug: slugProp }: { slug: string } = $props();
  // The route keys this component by slug, so the slug never changes for its lifetime.
  const slug = untrack(() => slugProp);

  type AnswerMode = "choice" | "play-back" | "voice" | "listen" | "listen-along";
  type Prompt = EarPrompt & { direction?: "ascending" | "descending" | "harmonic" | "both"; phrase?: RankedPhrase; keyPc?: number; written?: string[]; songTitle?: string; minor?: boolean; beat?: number; fromPc?: number };

  const def = EAR_DRILLS.find((d) => d.slug === slug)!;
  const entry = catalogEntry(`ear-${slug}`)!;
  const MODE_LABEL: Record<AnswerMode, string> = {
    choice: m.music_drills_eardrill_mode_choice(),
    "play-back": m.music_drills_eardrill_mode_play_back(),
    voice: m.music_drills_eardrill_mode_voice(),
    listen: m.music_drills_eardrill_mode_listen(),
    "listen-along": m.music_drills_eardrill_mode_listen_along(),
  };
  // The daily routine sends ?answer=voice to the mixed review: it narrows to scale degrees.
  const modes = (slug === "mixed" ? [...def.answerModes, "voice"] : def.answerModes) as AnswerMode[];
  // Scored answers first, in the order a beginner picks them; the two listen modes apart.
  const SCORED = (["choice", "play-back", "voice"] as const).filter((m) => modes.includes(m));
  const LISTEN = (["listen", "listen-along"] as const).filter((m) => modes.includes(m));
  const KIND_OF: Record<string, EarKind> = {
    intervals: "interval",
    "interval-compare": "interval-compare",
    "chord-qualities": "chord-quality",
    cadences: "cadence",
    "chord-functions": "chord-function",
    progressions: "progression",
    "song-loops": "loop",
    scales: "scale",
    inversions: "inversion",
    "bass-lines": "bass-line",
    "fine-pitch": "pitch-compare",
    "wrong-note": "error-detect",
    "scale-degrees": "scale-degree",
    "melody-dictation": "melody-dictation",
  };

  const cfg = new DrillSetup(`ear-${slug}`, {
    answer: def.answerModes[0] as string,
    // A wrong note needs a few degrees to choose from: the first five to start.
    level: (slug === "wrong-note" ? "major-pentachord" : EAR_DEFAULT_CONFIG.scaleDegreeSet) as string,
    // Mixed review: "all", or a comma list of the drills in the mix.
    drill: "all" as string,
    // Intervals drill: which intervals (comma list, empty for the twelve) and which way.
    intervals: "M3,P5,P8" as string,
    qualities: "major,minor" as string,
    cadences: "authentic,plagal" as string,
    functions: "I,IV,V" as string,
    scales: "major,natural-minor" as string,
    inversions: "root,first" as string,
    bassLevel: "roots-primary" as string,
    startCents: "auto" as string,
    // Sung answers: how close to the note counts (the mic rounds to the nearest note, so 50 is any).
    tune: "50" as string,
    // Spot the wrong note: made-up melodies, or phrases from saved songs.
    source: "made-up" as string,
    scaleDirection: "auto" as string,
    keyMode: "major" as string,
    // Song loops: which set of loops.
    loops: "songs" as string,
    // Progressions: in one key ("none"), or key changes ("key").
    changes: "none" as string,
    // Drills in a key: "run" keeps one key, or a new key every 5 or 3 prompts.
    keyEvery: "run" as string,
    chordSize: "triads" as string,
    direction: "auto" as string,
    root: "random" as string,
  });
  const s = $derived(cfg.value);
  // Degree or solfège labels: one preference for every ear drill.
  const labelPref = new DrillSetup("ear-labels", { labels: EAR_DEFAULT_CONFIG.scaleDegreeLabelMode as string });
  const chordDrill = slug === "chord-functions" || slug === "progressions";
  /** Chords in a key and progressions: which key and chord size the picked numerals are heard in. */
  const chordKind = $derived({ minor: s.keyMode === "minor", seventh: s.chordSize === "sevenths" });
  const kindLabel = (t: string) => functionLabel(functionToken(t, chordKind));
  /** Progressions that change key: where it goes is a word, not a chord, so the answer is chosen, never played. */
  const keyChanges = $derived(slug === "progressions" && s.changes === "key");
  const answer = $derived<AnswerMode>(modes.includes(s.answer as AnswerMode) && !(keyChanges && s.answer === "play-back") ? (s.answer as AnswerMode) : modes[0]);
  const labels = $derived<LabelMode>(labelPref.value.labels === "solfege" ? "solfege" : "degree");
  /** The levels offered (the full set is the chromatic one, kept for old links). */
  const LEVELS = SCALE_DEGREE_LEVELS.filter((l) => l.id !== "full-current");
  const level = $derived(s.level === "full-current" ? "chromatic-color" : LEVELS.some((l) => l.id === s.level) ? s.level : "anchor");
  const kinds = $derived.by((): EarKind[] => {
    if (keyChanges) return ["key-change"];
    if (slug !== "mixed") return KIND_OF[slug] ? [KIND_OF[slug]] : [];
    return mixKinds(s.drill, answer);
  });
  /** Mixed review: the drills ticked, before the answer mode leaves any out. */
  const mixPicked = $derived(mixKinds(s.drill, "choice"));
  function toggleMix(k: EarKind) {
    const on = mixPicked.includes(k);
    if (on && mixPicked.length === 1) return;
    const next = MIX_KINDS.filter((x) => (x === k ? !on : mixPicked.includes(x)));
    cfg.set({ drill: next.length === MIX_KINDS.length ? "all" : next.join(",") });
  }
  /** Scale degrees are in this run: the level and the labels matter. */
  const usesDegrees = $derived(slug !== "mixed" || kinds.includes("scale-degree"));
  const showLevel = $derived(def.usesScaleDegreeLevel && usesDegrees && !(slug === "wrong-note" && s.source === "songs"));

  // Practise a few items at a time (intervals, chord qualities) instead of all at once:
  // small, far-apart sets first, the way most trainers start, then wider ones.
  const QUALITIES = CADENCES_AND_QUALITIES.chordQualities;
  const CADENCES = CADENCES_AND_QUALITIES.cadences;
  const TWELVE = EAR_INTERVALS.filter((i) => i.token !== "P1").map((i) => i.token as string);
  const QUALITY_SHORT: Record<string, string> = {
    major: "maj",
    minor: "min",
    diminished: "dim",
    augmented: "aug",
    "major-7": "maj7",
    "dominant-7": "7",
    "minor-7": "m7",
    "half-diminished-7": "m7♭5",
    "diminished-7": "dim7",
  };
  interface ItemSets {
    key: "intervals" | "qualities" | "cadences" | "functions" | "scales" | "inversions";
    title: string;
    /** "3 intervals". */
    units: (count: number) => string;
    /** The preset group's label: "Interval sets". */
    setsLabel: string;
    /** How the next item is offered, from its token: "the perfect 4th", "diminished chords". */
    phrase: (token: string) => string;
    items: { token: string; short: string; name: string }[];
    /** When nothing is listed. */
    fallback: string[];
    sets: { label: string; tokens: string[] }[];
    /** The order items are offered once a set feels easy. */
    ladder: string[];
  }
  const SETS: ItemSets | null =
    slug === "intervals"
      ? {
          key: "intervals",
          title: m.music_drills_eardrill_intervals_title(),
          units: (count) => m.music_drills_eardrill_intervals_count({ count }),
          setsLabel: m.music_drills_eardrill_intervals_sets(),
          phrase: (t) => m.music_drills_eardrill_intervals_phrase({ name: itemName(t).toLowerCase() }),
          items: EAR_INTERVALS.map((i) => ({ token: i.token, short: i.token, name: i.name })),
          fallback: TWELVE,
          sets: [
            { label: m.music_drills_eardrill_set_starter(), tokens: ["P5", "P8"] },
            { label: m.music_drills_eardrill_set_first_steps(), tokens: ["M3", "P5", "P8"] },
            { label: m.music_drills_eardrill_set_perfect(), tokens: ["P1", "P4", "P5", "P8"] },
            { label: m.music_drills_eardrill_set_thirds_sixths(), tokens: ["m3", "M3", "m6", "M6"] },
            { label: m.music_drills_eardrill_set_seconds_sevenths(), tokens: ["m2", "M2", "m7", "M7"] },
            { label: m.music_drills_eardrill_set_major_scale(), tokens: ["M2", "M3", "P4", "P5", "M6", "M7", "P8"] },
            { label: m.music_drills_eardrill_set_all_twelve(), tokens: TWELVE },
          ],
          ladder: ["P8", "P5", "M3", "P4", "m3", "M6", "M2", "m7", "m6", "M7", "m2", "TT"],
        }
      : slug === "chord-qualities"
        ? {
            key: "qualities",
            title: m.music_drills_eardrill_qualities_title(),
            units: (count) => m.music_drills_eardrill_qualities_count({ count }),
            setsLabel: m.music_drills_eardrill_qualities_sets(),
            phrase: (t) => m.music_drills_eardrill_qualities_phrase({ name: itemName(t).toLowerCase() }),
            items: QUALITIES.map((q) => ({ token: q.token, short: QUALITY_SHORT[q.token] ?? q.token, name: q.label })),
            fallback: QUALITIES.map((q) => q.token),
            sets: [
              { label: m.music_drills_eardrill_set_major_minor(), tokens: ["major", "minor"] },
              { label: m.music_drills_eardrill_set_triads(), tokens: ["major", "minor", "diminished", "augmented"] },
              { label: m.music_drills_eardrill_set_sevenths(), tokens: ["major-7", "dominant-7", "minor-7", "half-diminished-7", "diminished-7"] },
              { label: m.music_drills_eardrill_set_everything(), tokens: QUALITIES.map((q) => q.token) },
            ],
            ladder: ["major", "minor", "diminished", "augmented", "dominant-7", "major-7", "minor-7", "half-diminished-7", "diminished-7"],
          }
        : slug === "cadences"
          ? {
              key: "cadences",
              title: m.music_drills_eardrill_cadences_title(),
              units: (count) => m.music_drills_eardrill_cadences_count({ count }),
              setsLabel: m.music_drills_eardrill_cadences_sets(),
              phrase: (t) => m.music_drills_eardrill_cadences_phrase({ name: itemName(t).toLowerCase() }),
              items: CADENCES.map((c) => ({ token: c.token, short: c.romanProgression.join("-"), name: c.label })),
              fallback: CADENCES.map((c) => c.token),
              sets: [
                { label: m.music_drills_eardrill_set_authentic_plagal(), tokens: ["authentic", "plagal"] },
                { label: m.music_drills_eardrill_set_ending_pausing(), tokens: ["authentic", "half"] },
                { label: m.music_drills_eardrill_set_all_four(), tokens: CADENCES.map((c) => c.token) },
              ],
              ladder: ["authentic", "plagal", "half", "deceptive"],
            }
          : slug === "chord-functions" || slug === "progressions"
            ? {
                key: "functions",
                title: m.music_drills_eardrill_chords_title(),
                units: (count) => m.music_drills_eardrill_chords_count({ count }),
                setsLabel: m.music_drills_eardrill_chords_sets(),
                phrase: (t) => m.music_drills_eardrill_chords_phrase({ name: kindLabel(t) }),
                items: CHORD_FUNCTIONS.map((f) => ({ token: f.token, short: f.token, name: f.name })),
                fallback: CHORD_FUNCTIONS.map((f) => f.token),
                sets: [
                  { label: m.music_drills_eardrill_set_primary_three(), tokens: ["I", "IV", "V"] },
                  { label: m.music_drills_eardrill_set_add_sixth(), tokens: ["I", "IV", "V", "vi"] },
                  { label: m.music_drills_eardrill_set_add_second_sixth(), tokens: ["I", "ii", "IV", "V", "vi"] },
                  { label: m.music_drills_eardrill_set_all_seven(), tokens: CHORD_FUNCTIONS.map((f) => f.token) },
                ],
                ladder: ["I", "V", "IV", "vi", "ii", "iii", "vii"],
              }
            : slug === "scales"
              ? {
                  key: "scales",
                  title: m.music_drills_eardrill_scales_title(),
                  units: (count) => m.music_drills_eardrill_scales_count({ count }),
                  setsLabel: m.music_drills_eardrill_scales_sets(),
                  phrase: (t) => m.music_drills_eardrill_scales_phrase({ name: itemName(t).toLowerCase() }),
                  items: EAR_SCALES.map((x) => ({ token: x.token, short: x.short, name: x.name })),
                  fallback: EAR_SCALES.map((x) => x.token),
                  sets: [
                    { label: m.music_drills_eardrill_set_major_minor(), tokens: ["major", "natural-minor"] },
                    { label: m.music_drills_eardrill_set_three_minors(), tokens: ["natural-minor", "harmonic-minor", "melodic-minor"] },
                    { label: m.music_drills_eardrill_set_pentatonics_blues(), tokens: ["major-pentatonic", "minor-pentatonic", "blues"] },
                    { label: m.music_drills_eardrill_set_bright_modes(), tokens: ["major", "lydian", "mixolydian"] },
                    { label: m.music_drills_eardrill_set_dark_modes(), tokens: ["natural-minor", "dorian", "phrygian", "locrian"] },
                    { label: m.music_drills_eardrill_set_all_twelve(), tokens: EAR_SCALES.map((x) => x.token) },
                  ],
                  // Major and minor first, then the colours a player meets soonest, Locrian last.
                  ladder: EAR_SCALES.map((x) => x.token),
                }
              : slug === "inversions"
                ? {
                    key: "inversions",
                    title: m.music_drills_eardrill_inversions_title(),
                    units: (count) => m.music_drills_eardrill_inversions_count({ count }),
                    setsLabel: m.music_drills_eardrill_inversions_sets(),
                    phrase: (t) => itemName(t).toLowerCase(),
                    items: EAR_INVERSIONS.map((x) => ({ token: x.token, short: x.short, name: x.name })),
                    fallback: ["root", "first", "second"],
                    sets: [
                      { label: m.music_drills_eardrill_set_root_first(), tokens: ["root", "first"] },
                      { label: m.music_drills_eardrill_set_all_three(), tokens: ["root", "first", "second"] },
                      { label: m.music_drills_eardrill_set_sevenths(), tokens: ["7-root", "7-first", "7-second", "7-third"] },
                    ],
                    ladder: EAR_INVERSIONS.map((x) => x.token),
                  }
                : null;
  const itemName = (t: string): string => SETS?.items.find((i) => i.token === t)?.name ?? t;
  const picked = $derived.by(() => {
    if (!SETS) return [];
    const listed = s[SETS.key].split(",").filter((t) => SETS.items.some((i) => i.token === t));
    return listed.length ? SETS.items.map((i) => i.token).filter((t) => listed.includes(t)) : SETS.fallback;
  });
  function setItems(tokens: string[]) {
    if (SETS) cfg.set({ [SETS.key]: SETS.items.map((i) => i.token).filter((t) => tokens.includes(t)).join(",") });
  }
  /** "Pick your own" stays open once opened; it opens by itself for a pick no preset covers. */
  let pickOwn = $state(false);
  $effect(() => {
    if (SETS && (!SETS.sets.some((x) => sameSet(x.tokens, picked)) || SETS.items.length <= 4)) untrack(() => (pickOwn = true));
  });
  function toggleItem(t: string) {
    const on = picked.includes(t);
    if (on && picked.length === 1) return; // keep at least one
    setItems(on ? picked.filter((x) => x !== t) : [...picked, t]);
  }
  const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

  const SCALE_DIRECTIONS = [
    { value: "auto", label: m.music_drills_eardrill_dir_auto(), hint: m.music_drills_eardrill_dir_scale_auto_hint() },
    { value: "ascending", label: m.music_drills_eardrill_dir_up() },
    { value: "both", label: m.music_drills_eardrill_dir_up_down() },
    { value: "descending", label: m.music_drills_eardrill_dir_down() },
  ];
  /** A fixed first note: middle C, so even an octave down stays on the keys. */
  const FIXED_ROOT = 60;
  const DIRECTIONS = [
    { value: "auto", label: m.music_drills_eardrill_dir_auto(), hint: m.music_drills_eardrill_dir_interval_auto_hint() },
    { value: "mixed", label: m.music_drills_eardrill_dir_mixed(), hint: m.music_drills_eardrill_dir_mixed_hint() },
    { value: "ascending", label: m.music_drills_eardrill_dir_up() },
    { value: "descending", label: m.music_drills_eardrill_dir_down() },
    { value: "harmonic", label: m.music_drills_eardrill_dir_together() },
  ];
  /** Accuracy so far by skill, practice and check together: the weak ones are asked more. */
  const accuracy = $derived.by(() => {
    const out: Record<string, number> = {};
    for (const [id, sum] of Object.entries(skillSummaries(practice.stats))) if (sum.attempts) out[id] = sum.accuracy;
    return out;
  });
  /** Drills heard in a key: the key can change every few prompts. */
  const inKey = $derived(["scale-degrees", "chord-functions", "bass-lines", "melody-dictation"].includes(slug) || (slug === "progressions" && !keyChanges));
  const keyEvery = $derived(inKey && ["5", "3"].includes(s.keyEvery) ? Number(s.keyEvery) : undefined);
  const focus = $derived(
    SETS || slug === "bass-lines" || slug === "song-loops" || keyEvery
      ? {
          keyEvery,
          loops: slug === "song-loops" ? s.loops : undefined,
          tokens: SETS ? picked : undefined,
          bassLevel: slug === "bass-lines" ? s.bassLevel : undefined,
          direction: slug === "intervals" && s.direction !== "auto" ? (s.direction as "ascending" | "descending" | "harmonic" | "mixed") : undefined,
          root: slug === "intervals" && s.root !== "random" ? FIXED_ROOT : undefined,
          minor: chordDrill && chordKind.minor,
          sevenths: chordDrill && chordKind.seventh,
          scaleDirection: slug === "scales" && s.scaleDirection !== "auto" ? (s.scaleDirection as ScaleDirection) : undefined,
        }
      : undefined,
  );

  let phase = $state<Phase>("ready");
  let mode = $state<DrillMode>("practice");
  let status = $state("");
  let prompts = $state.raw<Prompt[]>([]);
  let qi = $state(0);
  let step = $state<"playing" | "answer" | "feedback" | "revealed">("answer");
  let records = $state<AnswerRecord[]>([]);
  /** A played-back phrase's notes per question, for the results' "you played 3 for the 2" rows. */
  let phraseNotes = $state.raw<Record<number, number[]>>({});
  let played = $state<number[]>([]);
  /** Cents off the nearest note for each note sung on this prompt. */
  let sungCents = $state<number[]>([]);
  const tune = $derived(Number(s.tune) || 50);
  const centsText = (c: number) =>
    Math.abs(c) < 3
      ? m.music_drills_eardrill_cents_in_tune()
      : c > 0
        ? m.music_drills_eardrill_cents_sharp({ cents: Math.abs(Math.round(c)) })
        : m.music_drills_eardrill_cents_flat({ cents: Math.abs(Math.round(c)) });
  /** A sung note outside the tolerance is wrong, whatever note it was. */
  const tuned = (g: Graded, cents: number): Graded => (Math.abs(cents) > tune ? { ...g, score: 0, correct: false } : g);
  /** A progression's chords after the opening I, as tapped. */
  let slots = $state<string[]>([]);
  let hinted = $state(false);
  let summary = $state<RunSummary | null>(null);
  let listened = $state(0);
  let queued: Prompt[] | null = null;
  /** A retry asks the mix-ups, not the set: it never moves the set on or back. */
  let retrying = false;
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let cap: Capture | null = null;
  let openAt = Infinity;
  let promptAt = 0;
  let chordTimer: ReturnType<typeof setTimeout> | undefined;
  let advanceTimer: ReturnType<typeof setTimeout> | undefined;
  let seq = $state.raw<{ stop(): void; playing: boolean } | null>(null);
  let lit = $state<number[]>([]);
  let litDegree = $state<string | null>(null);
  /** The playback event sounding now (for the picture), or -1. */
  let sounding = $state(-1);
  /** After a wrong answer: what was played, then what you chose, from the same note, root, key or tonic. */
  let mistake = $state.raw<{ token: string; chosen: Prompt; both: Prompt } | null>(null);
  /** The prompt the chosen answer would have been, built from the same starting point. */
  function asChosen(p: Prompt, token: string): Prompt["playback"] | null {
    if (p.drill === "interval") {
      const semis = EAR_INTERVALS.find((i) => i.token === token)?.semitones;
      if (semis === undefined || !p.expectedMidi) return null;
      const first = p.expectedMidi[0];
      const dir = p.direction ?? "ascending";
      const second = dir === "descending" ? first - semis : first + semis;
      return dir === "harmonic"
        ? [{ midi: [first, second], time: 0, duration: 0.8 }]
        : [
            { midi: [first], time: 0, duration: 0.55 },
            { midi: [second], time: 0.65, duration: 0.55 },
          ];
    }
    if (p.drill === "chord-quality") {
      const q = QUALITIES.find((x) => x.token === token);
      const root = p.expectedMidi ? Math.min(...p.expectedMidi) : null;
      return q && root !== null ? [{ midi: q.intervals.map((i) => root + i), time: 0, duration: 0.9 }] : null;
    }
    if (p.drill === "cadence") {
      const c = CADENCES.find((x) => x.token === token);
      const shift = cadenceShift(p.id);
      return c ? c.playback.map((e) => ({ midi: e.midiNotes.map((m) => m + shift), time: e.offsetSeconds, duration: e.durationSeconds })) : null;
    }
    if (p.drill === "chord-function" && p.keyPc !== undefined) {
      const last = p.playback.at(-1)!;
      return [...p.playback.slice(0, -1), { ...last, midi: functionChord(p.keyPc, token) }];
    }
    if (p.drill === "progression" && p.keyPc !== undefined) return functionPlayback(p.keyPc, token.split(" "));
    if (p.drill === "key-change" && p.fromPc !== undefined) return keyChangePlayback(p.fromPc, token);
    if (p.drill === "loop" && p.keyPc !== undefined) {
      const chosen = token.split(" ");
      return chosen.includes("?") ? null : p.playback.map((e, i) => ({ ...e, midi: numeralChord(p.keyPc!, chosen[i]) }));
    }
    if (p.drill === "inversion") {
      const m = /^inversion-(?:7-)?\w+-(.+)-(\d+)$/.exec(p.id);
      const inv = EAR_INVERSIONS.find((x) => x.token === token);
      return m && inv ? [{ midi: inversionVoicing(Number(m[2]), m[1], inv.position), time: 0, duration: 1.2 }] : null;
    }
    if (p.drill === "scale" && p.direction && p.direction !== "harmonic") return scalePlayback(p.playback[0].midi[0] + 12, token, p.direction);
    if (p.drill === "scale-degree") {
      const semis = SCALE_DEGREES.find((d) => d.label === token)?.semitones;
      const tonic = tonicOf(p);
      return semis === undefined ? null : [p.playback[0], { midi: [tonic + semis], time: p.playback[1].time, duration: p.playback[1].duration }];
    }
    return null;
  }
  /** What was played and what `token` would have been, and the two back to back; null when the drill can't build it. */
  function versus(p: Prompt, token: string): { token: string; chosen: Prompt; both: Prompt } | null {
    const chosen = asChosen(p, token);
    if (!chosen) return null;
    const after = Math.max(...p.playback.map((e) => e.time + e.duration)) + 0.9;
    // The key is set once: the chosen version follows without its key-setting chords.
    const tail = chosen.slice(p.keyEvents ?? 0);
    const t0 = tail[0]?.time ?? 0;
    return {
      token,
      chosen: { ...p, id: `${p.id}-chose-${token}`, answer: token, playback: chosen, ...(p.drill === "key-change" ? { caption: keyChangeCaption(p.fromPc ?? 0, token) } : {}) },
      both: { ...p, id: `${p.id}-vs-${token}`, playback: [...p.playback, ...tail.map((e) => ({ ...e, time: e.time - t0 + after }))] },
    };
  }
  function showMistake(p: Prompt, token: string) {
    mistake = versus(p, token);
    // Lit as it sounds: the instrument shows the played notes, then the chosen ones.
    setTimeout(() => mistake && playPrompt(mistake.both, { light: true }), 500);
  }
  let demo = $state<{ answer: string; kind: string } | null>(null);
  let demoPlaying = $state(false);
  const flashes = new Flashes();
  const rand = rng(Math.floor(Math.random() * 2 ** 31));

  const current = $derived(prompts[qi]);
  // Movable do counts from the key the question is heard in (none for intervals and chord qualities).
  useNamingKey(() => (phase === "running" && current ? namingKeyOf(current) : undefined));
  const rec = $derived(records[qi]);
  const isPlayback = $derived(answer === "play-back");

  // ---------------------------------------------------------------------------
  // Repertoire: phrases from saved songs, ranked by the weakest degree.
  const usesSongs = slug === "repertoire-transfer" || slug === "wrong-note";
  let songCount = $state<number | null>(usesSongs ? null : 0);
  let ranked = $state.raw<RankedPhrase[]>([]);
  const plan = $derived(repertoirePlan(ranked.filter((p) => p.degrees.every((d) => levelDegrees(level).includes(d))).length ? ranked.filter((p) => p.degrees.every((d) => levelDegrees(level).includes(d))) : ranked));
  const planPhrases = $derived([...plan.warmup, ...plan.review, ...plan.new, ...plan.stretch]);

  async function loadSongs() {
    const rows = await db.songs.toArray();
    const scores = rows.map((r) => r.score as Score | undefined).filter((x): x is Score => !!x?.voices);
    songCount = scores.length;
    await practice.ready;
    const now = Date.now();
    ranked = rankPhrases(
      scores.flatMap((sc) => phrasesFromScore(sc)),
      (id) => {
        const m = practice.mastery[id];
        return m ? { mastery: decayMastery(m, now).mastery, due: isDueForReview(m, now) } : undefined;
      },
    );
  }
  if (usesSongs) void loadSongs();
  const fromSongs = $derived(slug === "wrong-note" && s.source === "songs");

  /** What the quiz asks, taught first: the drill and its level (never the answer mode), item by item. */
  const lessonRef = $derived.by(() => {
    let items: string[] = [];
    if (SETS) items = chordDrill ? picked.map((t) => functionToken(t, chordKind)) : picked;
    else if (slug === "song-loops") items = loopLessonItems(s.loops);
    else if (slug === "bass-lines") items = [...(BASS_LEVELS.find((l) => l.id === s.bassLevel) ?? BASS_LEVELS[0]).degrees];
    else if (slug === "scale-degrees" || slug === "melody-dictation" || (slug === "wrong-note" && !fromSongs)) items = levelDegrees(level);
    const degs = levelDegrees(level);
    const lessons = earLessons(keyChanges ? "key-changes" : slug, keyChanges ? [] : items, { direction: slug === "intervals" ? s.direction : undefined, level, minor: degs.includes("b3") && !degs.includes("3") });
    return lessons.length ? { lessons } : null;
  });

  // ---------------------------------------------------------------------------
  // Prompt helpers

  const tonicOf = (p: Prompt) => p.playback[0].midi[0];
  /** A played or sung note by name: spelled in the question's key when it has one (F#3 in E, as the answer chips say), else with flats. */
  const playedName = (p: Prompt, m: number) =>
    p.drill === "melody-dictation" || p.drill === "repertoire-transfer" || p.drill === "scale-degree" || p.drill === "scale" || p.drill === "error-detect"
      ? note(spellInKey(m, tonicOf(p)))
      : p.keyPc !== undefined
        ? note(spellInKey(m, 48 + p.keyPc))
        : note(noteName(m, "flat"));
  /** Major-key degrees by semitones above the tonic. */
  const MAJOR_DEGREE: Record<number, string> = { 0: "1", 2: "2", 4: "3", 5: "4", 7: "5", 9: "6", 11: "7" };
  const keyLine = (p: Prompt) => {
    if (p.drill === "bass-line") return m.music_drills_eardrill_line_chords_from({ key: keyOf(p.keyPc ?? 0, false), count: p.answer.split(" ").length, first: "I" });
    if (p.drill === "chord-function" || p.drill === "progression") {
      const minor = parseFunction(p.answer).minor;
      const key = keyOf(p.keyPc ?? 0, minor);
      const one = minor ? "i" : "I";
      const cadence = minor ? "i, iv, V, i" : "I, IV, V, I";
      return p.drill === "chord-function"
        ? p.keyEvents
          ? m.music_drills_eardrill_line_function_cadence({ key, cadence })
          : m.music_drills_eardrill_line_function_once({ key, cadence })
        : m.music_drills_eardrill_line_chords_from({ key, count: p.answer.split(" ").length, first: one });
    }
    if (p.drill === "key-change") return m.music_drills_eardrill_line_key_change({ key: keyOf(p.fromPc ?? 0, false) });
    if (p.drill === "loop") {
      return m.music_drills_eardrill_line_loop({ key: keyOf(p.keyPc ?? 0, !!p.minor), cadence: p.minor ? "i, iv, V, i" : "I, IV, V, I", count: p.answer.split(" ").length });
    }
    if (p.drill === "inversion") return m.music_drills_eardrill_line_one_chord();
    if (p.drill === "pitch-compare") return p.choices.includes("same") ? m.music_drills_eardrill_line_pitch_same({ cents: centsOf(p) }) : m.music_drills_eardrill_line_pitch({ cents: centsOf(p) });
    if (p.drill === "scale") return m.music_drills_eardrill_line_scale({ note: tonicName(p.playback[0].midi[0]) });
    if (p.drill === "cadence") {
      const shift = cadenceShift(p.id);
      return keyOf(shift, false);
    }
    if (p.drill === "error-detect") {
      const note = tonicName(tonicOf(p));
      return p.songTitle ? m.music_drills_eardrill_line_error_song({ note, song: p.songTitle }) : m.music_drills_eardrill_line_error({ note });
    }
    if (p.drill === "scale-degree" || p.drill === "melody-dictation" || p.drill === "repertoire-transfer") {
      const note = tonicName(tonicOf(p));
      return p.phrase ? m.music_drills_eardrill_line_tonic_from({ note, title: p.phrase.title }) : m.music_drills_eardrill_line_tonic({ note });
    }
    return p.drill === "interval" ? m.music_drills_eardrill_line_two_notes() : p.drill === "interval-compare" ? m.music_drills_eardrill_line_two_intervals() : m.music_drills_eardrill_line_one_chord();
  };
  /** A tonic or key by name ("Eb", "Mib"): keys are absolute, even in movable do. */
  const tonicName = (midi: number) => keyName(noteName(midi, "flat", false));
  /** "Key of E♭ major", from a pitch class. */
  const keyOf = (keyPc: number, minor: boolean) => {
    const note = tonicName(48 + keyPc);
    return minor ? m.music_drills_eardrill_key_minor({ note }) : m.music_drills_eardrill_key_major({ note });
  };
  const scaleName = (t: string) => EAR_SCALES.find((x) => x.token === t)?.name ?? t;
  const ask = (p: Prompt) =>
    p.drill === "interval"
      ? answer === "voice"
        ? p.direction === "harmonic"
          ? m.music_drills_eardrill_ask_interval_sing_high()
          : m.music_drills_eardrill_ask_interval_sing_second()
        : isPlayback
          ? m.music_drills_eardrill_ask_interval_play()
          : m.music_drills_eardrill_ask_interval()
      : p.drill === "interval-compare"
        ? m.music_drills_eardrill_ask_compare()
      : p.drill === "chord-quality"
        ? isPlayback
          ? m.music_drills_eardrill_ask_quality_play()
          : m.music_drills_eardrill_ask_quality()
        : p.drill === "cadence"
          ? m.music_drills_eardrill_ask_cadence()
        : p.drill === "scale"
          ? answer === "voice"
            ? (p.direction === "descending" ? m.music_drills_eardrill_ask_scale_sing_down : p.direction === "both" ? m.music_drills_eardrill_ask_scale_sing_both : m.music_drills_eardrill_ask_scale_sing_up)({ scale: scaleName(p.answer).toLowerCase() })
            : m.music_drills_eardrill_ask_scale()
        : p.drill === "error-detect"
          ? p.choices.includes("none")
            ? m.music_drills_eardrill_ask_wrong_none()
            : m.music_drills_eardrill_ask_wrong()
        : p.drill === "pitch-compare"
          ? p.choices.includes("same")
            ? m.music_drills_eardrill_ask_pitch_same()
            : m.music_drills_eardrill_ask_pitch()
        : p.drill === "inversion"
          ? isPlayback
            ? m.music_drills_eardrill_ask_inversion_play()
            : m.music_drills_eardrill_ask_inversion()
        : p.drill === "chord-function"
          ? isPlayback
            ? p.keyEvents ? m.music_drills_eardrill_ask_function_play_last() : m.music_drills_eardrill_ask_function_play()
            : p.keyEvents
              ? m.music_drills_eardrill_ask_function_last()
              : m.music_drills_eardrill_ask_function()
        : p.drill === "bass-line"
          ? answer === "voice"
            ? m.music_drills_eardrill_ask_bass_sing()
            : isPlayback
            ? m.music_drills_eardrill_ask_bass_play()
            : m.music_drills_eardrill_ask_bass()
        : p.drill === "key-change"
          ? m.music_drills_eardrill_ask_key_change()
        : p.drill === "loop"
          ? isPlayback
            ? m.music_drills_eardrill_ask_loop_play()
            : m.music_drills_eardrill_ask_loop()
        : p.drill === "progression"
          ? isPlayback
            ? m.music_drills_eardrill_ask_prog_play({ first: functionLabel(p.answer.split(" ")[0]) })
            : m.music_drills_eardrill_ask_prog({ first: functionLabel(p.answer.split(" ")[0]) })
          : p.drill === "scale-degree"
            ? answer === "voice"
              ? m.music_drills_eardrill_ask_degree_sing()
              : isPlayback
                ? m.music_drills_eardrill_ask_degree_play()
                : m.music_drills_eardrill_ask_degree()
            : answer === "voice"
              ? m.music_drills_eardrill_ask_phrase_sing()
              : m.music_drills_eardrill_ask_phrase_play();

  function notesOf(p: Prompt) {
    return p.playback.flatMap((ev) => ev.midi.map((m) => ({ midi: m, time: ev.time, duration: ev.duration })));
  }

  let playToken = 0;
  function playPrompt(p: Prompt, opts: { light?: boolean; onend?: () => void } = {}) {
    seq?.stop();
    // Singing a scale in Check: only the tonic, low and high, then the scale from its name.
    if (answer === "voice" && p.drill === "scale" && mode === "check") p = { ...p, playback: [{ midi: [tonicOf(p), tonicOf(p) + 12], time: 0, duration: 1.5 }] };
    const token = ++playToken;
    // A loop plays as a groove: comped chords, a bass and drums.
    const notes = p.drill === "loop" && p.beat ? loopGroove({ playback: p.playback, beat: p.beat }) : notesOf(p);
    const pass = Math.max(...p.playback.map((e) => e.time + e.duration)) + 0.05;
    let ended = false;
    const end = () => {
      if (ended || token !== playToken) return;
      ended = true;
      clearTimeout(guard);
      lit = [];
      litDegree = null;
      sounding = -1;
      opts.onend?.();
    };
    // The prompt always ends on the wall clock too: a stalled audio clock must not strand a question.
    const lengthMs = Math.max(...notes.map((n) => (n.time + n.duration) * 1000));
    const guard = setTimeout(() => {
      if (seq === handle) seq = null;
      end();
    }, lengthMs + 1200);
    let handle: ReturnType<typeof audio.playSequence> | null = null;
    try {
      handle = audio.playSequence(notes, {
        onNote: (i) => {
          if (ended) return;
          const t = notes[i].time;
          // The key cadence and the resolution are not the prompt's own events: nothing lights.
          sounding =
            p !== current
              ? -1
              : p.drill === "loop"
                ? p.playback.findLastIndex((ev) => ev.time <= (t % pass) + 1e-6)
                : p.playback.findIndex((ev) => Math.abs(ev.time - t) < 1e-6);
          if (!opts.light) return;
          lit = notes.filter((n) => n.time === t && !("voice" in n)).map((n) => n.midi);
          if (p.drill === "scale-degree") litDegree = i === 0 ? "1" : p.answer;
        },
      });
    } catch (e) {
      console.error("Woodshed: prompt playback failed", e);
      end();
      return;
    }
    const h = handle;
    seq = h;
    void h.done.then(() => {
      if (seq !== h) return;
      seq = null;
      end();
    });
  }

  // ---------------------------------------------------------------------------
  // Demo and warmup (never recorded)

  function sample(): Prompt | null {
    if (slug === "repertoire-transfer") return planPhrases[0] ? { ...repertoirePrompt(planPhrases[0]), phrase: planPhrases[0] } : null;
    return buildSession({ kinds, level, mode: "balanced", mastery: practice.mastery, summaries: {}, now: Date.now(), rand, length: 1, focus, accuracy })[0] ?? null;
  }

  async function playDemo() {
    if (demoPlaying) return stopDemo();
    stopWarmup();
    await audio.unlock();
    const p = sample();
    if (!p) return;
    demo = { answer: p.answer, kind: p.drill };
    demoPlaying = true;
    status = m.music_drills_eardrill_status_demo({ answer: tokenLabel(p.drill, p.answer, labels) });
    const go = () => playPrompt(p, { light: true, onend: () => (demoPlaying = false) });
    const k = promptKey(p);
    if (k) playPrompt({ ...p, drill: "cadence", playback: keyCadence(k.keyPc, k.minor) }, { light: true, onend: go });
    else go();
  }
  function stopDemo() {
    playToken++;
    seq?.stop();
    seq = null;
    demoPlaying = false;
    lit = [];
    litDegree = null;
  }

  let droneTonic = $state(48);
  let droneOn = $state(false);
  async function toggleDrone() {
    await audio.unlock();
    if (droneOn) audio.drone.stop();
    else audio.drone.start(droneTonic, "sine", 0.3);
    droneOn = !droneOn;
    status = droneOn ? m.music_drills_eardrill_status_drone_on({ note: tonicName(droneTonic) }) : m.music_drills_eardrill_status_drone_off();
  }
  function stopWarmup() {
    if (droneOn) audio.drone.stop();
    droneOn = false;
  }
  async function compare(label: string) {
    await audio.unlock();
    const tonic = droneTonic + 12;
    const target = tonic + (SCALE_DEGREES.find((d) => d.label === label)?.semitones ?? 0);
    const p: Prompt = { id: "warmup", drill: "scale-degree", skillIds: [], choices: [], difficulty: 0, answer: label, playback: [{ midi: [tonic], time: 0, duration: 0.55 }, { midi: [target], time: 0.7, duration: 0.65 }] };
    playPrompt(p, { light: true });
    status = m.music_drills_eardrill_status_tonic_then({ degree: tokenLabel("scale-degree", label, labels) });
  }

  // ---------------------------------------------------------------------------
  // The run

  // Fine pitch: a 2-down, 1-up staircase over the cent steps, picked up where the last run ended.
  const STAIR_KEY = "music.ear-fine-pitch.step";
  let stair = { at: 0, streak: 0 };
  let rememberedStep = $state(0);
  if (slug === "fine-pitch") void getSetting<number>(STAIR_KEY, 0).then((v) => (rememberedStep = v));
  const centsPrompt = (at: number): Prompt => ({ ...finePitchPrompt(rand, { difficulty: at / (CENT_STEPS.length - 1), cents: CENT_STEPS[at] }) });
  const centsOf = (p: Prompt) => Number(/^fine-pitch-\w+-(\d+)-/.exec(p.id)?.[1] ?? 0);

  function makeSession(): Prompt[] {
    if (slug === "fine-pitch") {
      // Where it ended last time, one step back to warm up; or the step picked in setup.
      const at = s.startCents === "auto" ? Math.max(0, rememberedStep - 1) : Math.max(0, CENT_STEPS.indexOf(Number(s.startCents) as (typeof CENT_STEPS)[number]));
      stair = { at, streak: 0 };
      return Array.from({ length: 10 }, () => centsPrompt(at));
    }
    if (slug === "repertoire-transfer") return planPhrases.slice(0, 10).map((ph) => ({ ...repertoirePrompt(ph), phrase: ph }));
    if (fromSongs && ranked.length) {
      // The usual session's difficulties, each on a phrase from a saved song (weakest degrees first, then shuffled).
      const pool = [...ranked].sort(() => rand() - 0.5);
      return buildSession({ kinds, level, mode: "balanced", mastery: practice.mastery, summaries: {}, now: Date.now(), rand }).map((p, i) =>
        errorDetectPrompt(rand, { difficulty: p.difficulty, level, phrase: pool[i % pool.length] }),
      );
    }
    return buildSession({
      kinds,
      level,
      mode: slug === "mixed" ? "adaptive" : "balanced",
      mastery: practice.mastery,
      summaries: skillSummaries(practice.stats, { independentOnly: true }),
      now: Date.now(),
      rand,
      focus,
      accuracy,
    });
  }

  const modality = $derived(answer === "voice" ? ("sung" as const) : isPlayback ? ("played" as const) : ("heard" as const));
  const runAssistance = $derived<Assistance>(answer === "listen" ? "self-assessed" : assistanceFor(mode));

  async function start(_ctx: RunContext) {
    stopDemo();
    stopWarmup();
    clearTimeout(advanceTimer);
    summary = null;
    listened = 0;
    await practice.ready;
    retrying = !!queued;
    prompts = queued ?? makeSession();
    queued = null;
    records = [];
    phraseNotes = {};
    // Not open for answers until the first prompt has played (the microphone may take a moment to start).
    step = "playing";
    if (!prompts.length) {
      phase = "ready";
      status = m.music_drills_eardrill_status_nothing_to_ask();
      return;
    }
    if (answer === "voice") {
      status = m.music_drills_eardrill_status_mic_starting();
      const ok = await mic.start();
      if (!ok) {
        phase = "ready";
        status = mic.error || m.music_drills_eardrill_status_mic_failed();
        return;
      }
    }
    run =
      answer === "listen-along"
        ? null
        : practice.beginRun({
            exerciseId: entry.exerciseId,
            setupKey: `${slug}${keyChanges ? "-key" : ""}|${answer}|${def.usesScaleDegreeLevel ? level : "-"}|${slug === "mixed" ? kinds.join(",") : "-"}`,
            skillIds: entry.skillIds,
            capabilities: ["ear"],
            modality,
            assistance: runAssistance,
            difficulty: prompts.reduce((a, p) => a + p.difficulty, 0) / prompts.length,
            instrument: answer === "voice" ? "voice" : undefined,
            params: { answer, level, labels, drill: s.drill, ...(slug === "song-loops" ? { loops: s.loops } : {}), ...(keyChanges ? { changes: "key" } : {}), ...(keyEvery ? { keyEvery } : {}), ...(slug === "scales" ? { scales: s.scales } : {}), ...(answer === "voice" ? { tune } : {}) },
          });
    cap = capture(performance.now(), (e) => {
      if (e.kind === "noteon") onNote(e);
    });
    begin(0);
  }

  function begin(i: number) {
    clearTimeout(chordTimer);
    clearTimeout(advanceTimer);
    qi = i;
    played = [];
    sungCents = [];
    slots = [];
    hinted = false;
    mistake = null;
    flashes.clear();
    step = "playing";
    openAt = Infinity;
    promptAt = 0;
    const p = prompts[i];
    status = m.music_drills_eardrill_status_question({ n: i + 1, total: prompts.length });
    // The key is set once per block: before the run's first prompt in a key, or when a mix changes key.
    if (keyId(p) && keyId(p) !== keyId(prompts[i - 1])) hearKey(p, () => replay(p, true));
    else replay(p, true);
  }

  const keyId = (p?: Prompt) => {
    const k = p && promptKey(p);
    return k ? `${k.keyPc}${k.minor ? "m" : ""}` : "";
  };

  /** I IV V I in the prompt's key, then `then` (the prompt again, by default). */
  function hearKey(p = current, then = () => replay(p)) {
    const k = p && promptKey(p);
    if (!k) return;
    clearTimeout(advanceTimer);
    openAt = Infinity;
    if (step === "answer") step = "playing";
    status = m.music_drills_eardrill_status_key_then({ key: keyOf(k.keyPc, k.minor) });
    playPrompt({ ...p, id: `${p.id}-key`, drill: "cadence", playback: keyCadence(k.keyPc, k.minor) }, {
      light: answer === "listen-along",
      onend: () => {
        if (prompts[qi] === p && phase === "running") then();
      },
    });
  }

  /**
   * After an answer: the degree, or a line's last note, steps home to the tonic; the chord, or
   * a progression's last chord, goes to I. Silent when muted (and never in Check, where it is not called).
   */
  function resolve(p: Prompt, then?: () => void) {
    const k = promptKey(p);
    const home =
      !k || settings.value.muted
        ? null
        : p.drill === "scale-degree"
          ? stepHome(k.keyPc, p.expectedMidi![0])
          : p.drill === "bass-line" || p.drill === "melody-dictation"
            ? stepHome(k.keyPc, p.expectedMidi!.at(-1)!)
            : p.drill === "chord-function" || p.drill === "progression"
              ? chordResolution(k.keyPc, p.answer.split(" ").at(-1)!)
              : null;
    if (!home) return then?.();
    playPrompt({ ...p, id: `${p.id}-home`, playback: home }, { onend: then });
  }

  function replay(p = current, first = false) {
    if (!p) return;
    // Voice and play-back open once the prompt has finished, so the speakers can't answer.
    openAt = Infinity;
    if (step === "answer") step = "playing";
    playPrompt(p, {
      // Once answered (or in listen along) the notes light as they sound.
      light: answer === "listen-along" || step === "feedback",
      onend: () => {
        if (prompts[qi] !== p || phase !== "running") return;
        // A short tail so the last note's release can't answer for the player.
        openAt = performance.now() + 150;
        promptAt = first ? performance.now() : promptAt;
        // The answer shows as open a mic frame (about 45 ms) after the gate: a sung note is stamped
        // at its frame's start, so one begun the moment "answer" shows still lands after the gate
        // (otherwise it is dropped, and held it never sounds again).
        setTimeout(() => {
          if (prompts[qi] === p && step === "playing") step = "answer";
        }, 210);
        if (answer === "listen-along") {
          listened = qi + 1;
          advanceTimer = setTimeout(next, 1400);
        } else status = ask(p);
      },
    });
  }

  function onNote(e: NoteEvent) {
    if (phase !== "running" || step !== "answer" || e.at < openAt) return;
    const p = current;
    if (!p) return;
    if (answer === "voice") {
      if (e.source !== "audio") return;
      const cents = e.cents ?? 0;
      sungCents = [...sungCents, cents];
      const off = Math.abs(cents) > tune ? m.music_drills_eardrill_heard_out_of_tune({ cents: centsText(cents) }) : null;
      if (p.drill === "interval") {
        // The second note (the higher one when played together), in any octave.
        const [a, b] = p.expectedMidi!;
        const [from, to] = p.direction === "harmonic" ? [Math.min(a, b), Math.max(a, b)] : [a, b];
        const right = gradeScaleDegree(from, to - from, { midi: e.midi, cents: e.cents });
        const g = tuned(right, cents);
        const semis = pc(p.direction === "descending" ? from - e.midi : e.midi - from);
        const heard = right.correct && off ? off : g.correct ? p.answer : (EAR_INTERVALS.find((i) => i.semitones === semis)?.token ?? m.music_drills_eardrill_heard_another_note());
        void commit(g, heard, e.midi, [e]);
        return;
      }
      if (p.drill === "bass-line") {
        // Each sung root fills the next slot by its degree in the key; out of tune or outside the key it is "?".
        tapChord(Math.abs(cents) <= tune ? (MAJOR_DEGREE[pc(e.midi - (p.keyPc ?? 0))] ?? "?") : "?", [e]);
        return;
      }
      if (p.drill === "melody-dictation" || p.drill === "scale") {
        played = [...played, e.midi];
        if (played.length < (p.expectedMidi?.length ?? 3)) return;
        const tonic = tonicOf(p);
        // A note sung outside the tolerance counts as missed ("?").
        const ok = sungCents.map((c) => Math.abs(c) <= tune);
        const heard = played.map((m, i) => (ok[i] ? SCALE_DEGREES[pc(m - tonic)].label : "?")).join(" ");
        void commit(gradeMelodyDictation(p.expectedMidi!, played.map((m, i) => (ok[i] ? m : NaN))), heard, played, [e]);
        return;
      }
      const tonic = tonicOf(p);
      const right = gradeScaleDegree(tonic, (p.expectedMidi?.[0] ?? tonic) - tonic, { midi: e.midi, cents: e.cents });
      void commit(tuned(right, cents), right.correct && off ? off : SCALE_DEGREES[pc(e.midi - tonic)].label, e.midi, [e]);
      return;
    }
    if (!isPlayback) return;
    played = [...played, e.midi];
    const notes = cap?.notes.filter((n) => n.kind === "noteon" && n.at >= openAt) ?? [];
    if (p.drill === "scale-degree") {
      const tonic = tonicOf(p);
      const g = gradeScaleDegree(tonic, p.expectedMidi![0] - tonic, { midi: e.midi });
      flashes.add(e.midi, g.correct ? "correct" : "wrong");
      void commit(g, SCALE_DEGREES[pc(e.midi - tonic)].label, e.midi, notes);
    } else if (p.drill === "interval" && played.length >= 2) {
      const semis = Math.abs(p.expectedMidi![1] - p.expectedMidi![0]);
      const g = gradeIntervalPlayback({ semitones: semis, direction: p.direction === "both" ? "ascending" : (p.direction ?? "ascending") }, played);
      const d = Math.abs(g.playedSemitones ?? 0);
      const token = intervalBySemitones(d)?.token;
      const wrongWay = p.direction !== "harmonic" && (g.playedSemitones ?? 0) * (p.direction === "descending" ? -1 : 1) < 0;
      // The saved metric keeps its English wording; the answer shown is in the reader's language.
      const actual = (token ?? `${d} semitones`) + (wrongWay ? " (wrong way)" : "");
      const shown = token ?? m.music_drills_eardrill_heard_semitones({ count: d });
      const heard = wrongWay ? m.music_drills_eardrill_heard_wrong_way({ heard: shown }) : shown;
      void commit(g, heard, played.slice(0, 2), notes, [{ kind: "choice", expected: p.answer, actual }]);
    } else if (p.drill === "bass-line") {
      // Each bass note fills the next slot, by its degree in the key (a note outside it as "?").
      played = [];
      tapChord(MAJOR_DEGREE[pc(e.midi - (p.keyPc ?? 0))] ?? "?", notes);
    } else if (p.drill === "chord-quality" || p.drill === "chord-function" || p.drill === "progression" || p.drill === "loop" || p.drill === "inversion") {
      clearTimeout(chordTimer);
      // A chord is in once all its notes are down and the hands rest a moment (or on "That's my chord").
      const needed =
        p.drill === "chord-quality"
          ? (p.expectedMidi?.length ?? 3)
          : p.drill === "inversion"
            ? new Set(p.expectedMidi!.map(pc)).size
            : p.drill === "loop"
              ? new Set(numeralChord(p.keyPc ?? 0, p.answer.split(" ")[slots.length] ?? "I").map(pc)).size
              : parseFunction(p.answer).seventh
              ? 4
              : 3;
      if (new Set(played.map(pc)).size >= needed) chordTimer = setTimeout(() => submitChord(), 350);
    } else if ((p.drill === "melody-dictation" || p.drill === "repertoire-transfer") && played.length >= (p.expectedMidi?.length ?? 3)) {
      const g = gradeMelodyDictation(p.expectedMidi!, played);
      const tonic = tonicOf(p);
      const heard = played.map((m) => SCALE_DEGREES[pc(m - tonic)].label).join(" ");
      void commit(g, heard, played, notes);
    }
  }

  function submitChord() {
    const p = current;
    if (!p || step !== "answer" || !played.length) return;
    if (p.drill === "inversion") {
      const found = inversionOf(played);
      const seventh = new Set(played.map(pc)).size === 4;
      const heard = found ? (EAR_INVERSIONS.find((x) => x.position === found.position && x.seventh === seventh)?.token ?? m.music_drills_eardrill_heard_another_chord()) : m.music_drills_eardrill_heard_another_chord();
      const notes = cap?.notes.filter((n) => n.kind === "noteon" && n.at >= openAt) ?? [];
      void commit(gradeInversionPlayback(p.expectedMidi!, played), heard, played, notes);
      return;
    }
    if (p.drill === "loop") {
      // Each chord fills the next slot; a chord that is none of the answer buttons fills it as "?".
      const notes = cap?.notes.filter((n) => n.kind === "noteon" && n.at >= openAt) ?? [];
      const token = numeralOfNotes(p.keyPc ?? 0, played, p.choices);
      played = [];
      tapChord(token ?? "?", notes);
      return;
    }
    if (p.drill === "chord-function" || p.drill === "progression") {
      const token = functionOfNotes(p.keyPc ?? 0, played, parseFunction(p.answer));
      const notes = cap?.notes.filter((n) => n.kind === "noteon" && n.at >= openAt) ?? [];
      if (p.drill === "progression") {
        // Each chord fills the next slot; a chord outside the key fills it as "?".
        played = [];
        tapChord(token ?? "?", notes);
      } else void commit(gradeChordPlayback(p.expectedMidi!, played), token ?? m.music_drills_eardrill_heard_another_chord(), played, notes);
      return;
    }
    const g = gradeChordQualityPlayback(p.answer, played);
    const found = g.detected ?? classifyChord(played)?.token;
    const heard = found ?? m.music_drills_eardrill_heard_another_chord();
    const notes = cap?.notes.filter((n) => n.kind === "noteon" && n.at >= openAt) ?? [];
    // The saved metric keeps its English wording.
    void commit(g, heard, played, notes, [{ kind: "choice", expected: p.answer, actual: found ?? "another chord" }]);
  }

  function choose(token: string) {
    if (phase !== "running" || (step !== "answer" && step !== "playing")) return;
    void commit(gradeChoice(current.answer, token), token, token, []);
  }

  /** Chords shown before the slots: a progression's opening I; a loop asks every chord. */
  const givenOf = (p: Prompt) => (p.drill === "loop" || p.drill === "key-change" ? 0 : 1);
  /** A chord token as a button or slot shows it. */
  const chordLabel = (p: Prompt, t: string) =>
    p.drill === "key-change" ? (KEY_CHANGES.some((k) => k.id === t) ? keyChangeLabel(t) : numeralLabel(t)) : p.drill === "loop" ? numeralLabel(t) : functionLabel(t);
  /** The buttons for the next slot: a key change asks where it goes first, then the chords. */
  const slotChoices = (p: Prompt) =>
    p.drill !== "key-change" ? p.choices : slots.length ? KEY_CHANGE_NUMERALS : KEY_CHANGES.map((k) => k.id);

  /** One chord into the next slot of a progression; the last slot answers it. */
  function tapChord(token: string, notes: NoteEvent[] = []) {
    if (phase !== "running" || (step !== "answer" && step !== "playing")) return;
    const given = givenOf(current);
    const want = current.answer.split(" ").slice(given);
    slots = [...slots, token];
    if (slots.length < want.length) return;
    const answered = [...current.answer.split(" ").slice(0, given), ...slots].join(" ");
    void commit(gradeSequence(want, slots), answered, answered, notes);
  }

  async function commit(g: Graded, answered: string, response: Label, notes: NoteEvent[], extra: Metric[] = []) {
    const p = current;
    const i = qi;
    step = "feedback";
    clearTimeout(chordTimer);
    records[i] = { kind: p.drill, expected: p.answer, answered, correct: g.correct, scored: true };
    if (isPhrase(p) && Array.isArray(response)) {
      phraseNotes = { ...phraseNotes, [i]: [...response] };
      // In Practice the keys you played that were not the phrase's stay red with a cross through the feedback.
      if (!g.correct && mode === "practice") response.forEach((m, k) => Number.isFinite(m) && p.expectedMidi?.[k] !== undefined && pc(m) !== pc(p.expectedMidi[k]) && flashes.add(m, "wrong", 600_000));
    }
    if (!g.correct && answer === "choice" && mode === "practice") showMistake(p, answered);
    const src: InputSource | "mixed" = answer === "choice" ? "click" : answer === "voice" ? "audio" : runSource(notes);
    await run?.attempt({
      promptId: p.id,
      correct: g.correct,
      partialCredit: g.score,
      metrics: [...g.metrics, ...extra],
      source: src,
      target: p.answer,
      response,
      latencyMs: promptAt ? Math.round(performance.now() - promptAt) : undefined,
      skillIds: p.skillIds,
      difficulty: p.difficulty,
      assistance: hinted ? "hinted" : undefined,
      instrument: answer === "voice" ? "voice" : isPlayback ? (runInstrument(notes) ?? null) : null,
    });
    if (p.drill === "pitch-compare") {
      // The next prompt follows the staircase.
      const next = staircase(stair.at, stair.streak, g.correct);
      stair = { at: next.step, streak: next.streak };
      if (i + 1 < prompts.length) prompts = prompts.map((x, k) => (k === i + 1 ? centsPrompt(stair.at) : x));
    }
    if (mode === "practice") {
      if (!mistake && prompts[qi] === p) resolve(p);
      status = g.correct
        ? m.music_drills_eardrill_status_right({ answer: tokenLabel(p.drill, p.answer, labels) })
        : m.music_drills_eardrill_status_wrong({ answer: tokenLabel(p.drill, p.answer, labels), answered: tokenLabel(p.drill, answered, labels) });
    } else {
      status = m.music_drills_eardrill_status_saved({ n: i + 1 });
      // A phrase is shown once it has been answered, even in a test; the answer is already in.
      advanceTimer = setTimeout(next, isPhrase(p) ? 1600 : 450);
    }
  }

  function reveal() {
    step = "revealed";
    status = m.music_drills_eardrill_status_revealed({ answer: tokenLabel(current.drill, current.answer, labels) });
  }
  async function rate(heard: boolean) {
    const p = current;
    records[qi] = { kind: p.drill, expected: p.answer, answered: heard ? p.answer : undefined, correct: heard, scored: true };
    step = "feedback";
    await run?.attempt({
      promptId: p.id,
      correct: heard,
      partialCredit: heard ? 1 : 0,
      metrics: [],
      source: "click",
      target: p.answer,
      skillIds: p.skillIds,
      difficulty: p.difficulty,
      assistance: "self-assessed",
      instrument: null,
    });
    resolve(p, next);
  }

  function showAnswerNow() {
    hinted = true;
    status = m.music_drills_eardrill_status_hinted({ answer: tokenLabel(current.drill, current.answer, labels) });
  }

  /** Number keys answer the buttons in order (a degree by its own number), and Enter continues. */
  function onKey(e: KeyboardEvent) {
    if (phase !== "running" || e.repeat || e.metaKey || e.ctrlKey || e.altKey || !current) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest?.("input, select, textarea, [contenteditable]")) return;
    // A focused button takes Enter itself.
    if (step === "feedback" && e.key === "Enter" && mode === "practice" && !target?.closest?.("button, a")) return next();
    const n = KEYS.indexOf(e.key);
    if (n < 0 || answer !== "choice" || (step !== "answer" && step !== "playing")) return;
    const p = current;
    if (p.drill === "scale-degree") {
      if (p.choices.includes(e.key)) choose(e.key);
    } else if (p.drill === "error-detect") {
      if (p.written && n < Math.min(9, p.written.length)) choose(String(n + 1));
    } else if (!["progression", "key-change", "loop", "bass-line"].includes(p.drill) && p.choices[n] !== undefined) choose(p.choices[n]);
  }

  function next() {
    clearTimeout(advanceTimer);
    if (phase !== "running") return;
    if (qi + 1 < prompts.length) begin(qi + 1);
    else void finish();
  }

  function teardown() {
    clearTimeout(chordTimer);
    clearTimeout(advanceTimer);
    cap?.stop();
    cap = null;
    playToken++;
    seq?.stop();
    seq = null;
    if (mic.state === "on" || mic.state === "starting") mic.stop();
  }

  const missedPhrases = $derived(
    records.flatMap((r, i) => {
      const p = prompts[i];
      if (!r || r.correct || !p || !isPhrase(p) || !phraseNotes[i] || !r.answered) return [];
      const want = p.answer.split(" ");
      const got = r.answered.split(" ");
      const swaps = want.flatMap((d, k) => (got[k] !== undefined && got[k] !== d ? [m.music_drills_eardrill_phrase_swap({ got: deg(got[k]), want: deg(d) })] : [])).join(", ");
      const text = swaps ? m.music_drills_eardrill_phrase_you_played({ swaps }) : m.music_drills_eardrill_phrase_you_played_other();
      return [{ i, prompt: p, notes: phraseNotes[i], text }];
    }),
  );
  /** Phrases: the single notes played for others, most often first ("3 for the 2"). */
  const noteSwaps = $derived.by(() => {
    const n = new Map<string, { want: string; got: string; wantDeg: string; gotDeg: string; count: number }>();
    records.forEach((r, i) => {
      const p = prompts[i];
      if (!r || r.correct || !p || !isPhrase(p) || !r.answered) return;
      const got = r.answered.split(" ");
      p.answer.split(" ").forEach((d, k) => {
        if (got[k] === undefined || got[k] === d) return;
        const key = `${d}>${got[k]}`;
        n.set(key, { want: deg(d), got: deg(got[k]), wantDeg: degWords(d), gotDeg: degWords(got[k]), count: (n.get(key)?.count ?? 0) + 1 });
      });
    });
    return [...n.values()].sort((a, b) => b.count - a.count);
  });
  const byKind = $derived(perKind(records.filter(Boolean)));
  const confused = $derived(confusions(records.filter(Boolean)));

  async function finish() {
    teardown();
    phase = "results";
    if (answer === "listen-along") {
      status = m.music_drills_eardrill_status_listened({ count: listened });
      return;
    }
    const done = records.filter(Boolean);
    const right = done.filter((r) => r.correct).length;
    const score = done.length ? right / done.length : 0;
    lastEvents = [...run!.events];
    const fin = await run!.finish({ score, correct: right === prompts.length, headline: `${right} of ${prompts.length}` });
    const top = confused[0];
    const pocket = answer === "listen";
    // A run with a next-run ladder counts as clean at 9 of 10 (the advance rule); without one, clean is a Check run
    // with every answer right (the `clean` flag below). The star key says whichever applies.
    const ladder = !!(SETS || levelSteps) && !pocket && !keyChanges && !retrying;
    const swap = noteSwaps[0];
    const retries = retryCount;
    summary = {
      headline:
        right === prompts.length
          ? pocket
            ? m.music_drills_eardrill_res_pocket_all({ total: prompts.length })
            : m.music_drills_eardrill_res_all_right({ total: prompts.length })
          : swap
            ? swap.count > 1
              ? m.music_drills_eardrill_res_swap_times({ right, total: prompts.length, got: swap.got, want: swap.want, times: times(swap.count) })
              : m.music_drills_eardrill_res_swap({ right, total: prompts.length, got: swap.got, want: swap.want })
            : top
            ? (pocket
                ? top.count > 1
                  ? m.music_drills_eardrill_res_confused_heard_times
                  : m.music_drills_eardrill_res_confused_heard
                : top.count > 1
                  ? m.music_drills_eardrill_res_confused_right_times
                  : m.music_drills_eardrill_res_confused_right)({ right, total: prompts.length, expected: tokenLabel(top.kind, top.expected, labels), answered: tokenLabel(top.kind, top.answered, labels), times: times(top.count) })
            : pocket
              ? m.music_drills_eardrill_res_heard({ right, total: prompts.length })
              : m.music_drills_eardrill_res_right({ right, total: prompts.length }),
      metric: pct(score),
      metricLabel: pocket ? m.music_drills_eardrill_res_metric_pocket() : m.music_drills_eardrill_res_metric_score(),
      delta: fin.delta,
      best: fin.best,
      clean: mode === "check" && right === prompts.length && !pocket,
      cleanMeans: cleanMeansFor(ladder, prompts.length),
      xp: fin.xp,
      // Pocket recall is rated by you: said in its own words, not as a Practice or Check run.
      ...(pocket ? { assistance: m.music_drills_eardrill_res_pocket_assistance() } : { mode }),
      coach: retries && !pocket ? { label: m.music_drills_eardrill_res_coach({ count: retries }), run: retry } : undefined,
      rows: centsRows(done) ?? itemRows(done) ?? byKind.map((k) => ({ label: KIND_LABEL[k.kind as EarKind] ?? m.music_drills_eardrill_res_repertoire_phrases(), value: k.total ? k.correct / k.total : 0, text: m.music_drills_eardrill_res_of({ right: k.correct, total: k.total }) })),
      routine: page.url.searchParams.get("routine") ? { label: m.music_drills_eardrill_res_back_today(), href: "/music" } : undefined,
    };
    if (slug === "fine-pitch") {
      summary.headline += ` ${m.music_drills_eardrill_res_next_cents({ cents: CENT_STEPS[stair.at] })}`;
      rememberedStep = stair.at;
      void putSetting(STAIR_KEY, stair.at);
    }
    status = summary.headline;
    if (ladder) summary.advance = await advanceAfter(score);
  }

  /** Fine pitch: one row per cent step asked, widest first. */
  function centsRows(done: AnswerRecord[]) {
    if (slug !== "fine-pitch") return null;
    const asked = prompts.slice(0, done.length).map(centsOf);
    return [...new Set(asked)]
      .sort((a, b) => b - a)
      .map((c) => {
        const here = done.filter((_, k) => asked[k] === c);
        const ok = here.filter((r) => r.correct).length;
        return { label: m.music_drills_eardrill_cents_label({ cents: c }), value: ok / here.length, text: m.music_drills_eardrill_res_of({ right: ok, total: here.length }) };
      });
  }

  /** One results row per answer asked (an interval, a quality, a degree), this run only. */
  function itemRows(done: AnswerRecord[]) {
    if (kinds.length !== 1 || slug === "repertoire-transfer" || kinds[0] === "melody-dictation" || kinds[0] === "progression" || kinds[0] === "key-change" || kinds[0] === "loop" || kinds[0] === "bass-line" || kinds[0] === "error-detect") return null;
    const kind = kinds[0];
    const targets = targetsFor(kind, level, focus);
    const order = (t: string) => {
      const i = targets.findIndex((x) => x.token === t);
      return i < 0 ? 99 : i;
    };
    return [...new Set(done.map((r) => r.expected))]
      .sort((a, b) => order(a) - order(b))
      .map((t) => {
        const here = done.filter((r) => r.expected === t);
        const ok = here.filter((r) => r.correct).length;
        return { label: tokenLabel(kind, t, labels), value: ok / here.length, text: m.music_drills_eardrill_res_of({ right: ok, total: here.length }) };
      });
  }

  // The next run by the shared rule: a set grows by the next item on its ladder, or
  // drops the last one added; degree drills move through the levels. A run of 9 of
  // 10 or better counts as clean.
  const LEVEL_LADDER = ["anchor", "major-pentachord", "major-diatonic", "minor-diatonic", "chromatic-color"];
  const levelSteps = $derived(def.usesScaleDegreeLevel && slug !== "mixed" && slug !== "repertoire-transfer" && !fromSongs);
  function advanceAfter(score: number): Promise<NextRun> | undefined {
    const run = { score, correct: score >= 0.9 };
    if (SETS) {
      const { steps, step } = setLadder(picked, SETS.ladder, SETS.phrase);
      return nextRun(`ear.${slug}.${picked.join(",")}`, { steps, step }, run, ({ step }) => step !== undefined && setItems(steps[step].tokens));
    }
    const at = LEVEL_LADDER.indexOf(level);
    if (at < 0) return;
    const steps = LEVEL_LADDER.map((id) => ({ label: SCALE_DEGREE_LEVELS.find((l) => l.id === id)?.title ?? id }));
    return nextRun(`ear.${slug}.level`, { steps, step: at }, run, ({ step }) => step !== undefined && cfg.set({ level: LEVEL_LADDER[step] }));
  }

  function stop() {
    teardown();
    phase = "ready";
    const n = records.filter(Boolean).length;
    status = answer === "listen-along" ? m.music_drills_eardrill_status_stopped() : m.music_drills_eardrill_status_stopped_after({ count: n });
  }

  function retry() {
    const r = retryPrompts(lastEvents, slug === "mixed" || keyChanges ? kinds : [KIND_OF[slug] ?? "scale-degree"], rand);
    if (!r.length) return;
    queued = r;
    phase = "running";
    void start({ mode, downbeat: performance.now(), beatMs: 0, bpm: 0, stopClock() {} });
  }
  let lastEvents = $state.raw<ScoringEvent[]>([]);
  const retryCount = $derived(phase === "results" ? retryPrompts(lastEvents, slug === "mixed" || keyChanges ? kinds : [KIND_OF[slug] ?? "scale-degree"], rand).length : 0);

  onDestroy(() => {
    teardown();
    stopWarmup();
  });

  /** One-item drills get a played-vs-answered grid: every item in teaching order. */
  const gridOrder = $derived.by(() => {
    // Progressions answer several chords at once: no single square for them.
    if (slug === "mixed" || slug === "progressions" || answer === "listen") return null;
    if (SETS) return slug === "chord-functions" ? SETS.items.map((i) => functionToken(i.token, chordKind)) : SETS.items.map((i) => i.token);
    if (slug === "scale-degrees") return SCALE_DEGREES.map((d) => d.label);
    return slug === "fine-pitch" ? ["higher", "lower", "same"] : slug === "interval-compare" ? ["first", "second", "same"] : null;
  });
  /** A grid square: the item played, then the answer given, from the same starting point. */
  async function playPair(asked: string, said: string) {
    const p = prompts[records.findIndex((r) => r?.expected === asked)];
    if (!p) return;
    await audio.unlock();
    playPrompt((said !== asked && versus(p, said)?.both) || p);
  }

  // ---------------------------------------------------------------------------
  // Surfaces

  /** The prompt's notes and what is lit: where the fretboard window sits on guitar and ukulele. */
  /** Played back against a tonic: home is marked "1" on the keys (and kept in view on a phone). */
  function tonicMarked(p: Prompt) {
    return isPlayback && (p.drill === "melody-dictation" || p.drill === "repertoire-transfer" || p.drill === "scale-degree");
  }
  const earLine = $derived([...(current?.expectedMidi ?? []), ...lit, ...(phase === "running" && current && tonicMarked(current) ? [tonicOf(current)] : [])]);
  const pianoMarks = $derived.by(() => {
    const out: Record<number, CellMarks> = {};
    const p = current;
    // Played back against a tonic (named above the question): home is marked "1" on the keys, in both modes.
    if (phase === "running" && p && tonicMarked(p)) out[tonicOf(p)] = { label: "1", role: "scale" };
    for (const m of lit) out[m] = { ...out[m], demo: true };
    if (phase === "running" && p && isPlayback && mode === "practice" && (step === "feedback" || hinted) && p.expectedMidi) {
      const show = p.drill === "interval" || p.drill === "chord-quality" ? [] : p.expectedMidi;
      for (const m of show) out[m] = { target: true };
    }
    return out;
  });

  /** What to do now, beside Stop on a phone: never the verdict (the card says it). */
  const cue = $derived.by(() => {
    if (phase !== "running" || !current) return "";
    if (step === "playing" || sounding >= 0) return m.music_drills_eardrill_cue_listen();
    if (step === "feedback") return "";
    if (answer === "listen") return step === "revealed" ? m.music_drills_eardrill_cue_did_you_hear() : m.music_drills_eardrill_cue_name_it();
    if (answer === "listen-along") return m.music_drills_eardrill_mode_listen_along();
    if (answer === "voice") return m.music_drills_eardrill_cue_sing();
    if (answer !== "choice") return m.music_drills_eardrill_cue_play_back();
    return degreeChoices ? m.music_drills_eardrill_cue_tap_degree() : m.music_drills_eardrill_cue_pick();
  });
  const choiceTokens = $derived(current?.choices ?? []);
  /** Equal columns: two on a phone (an odd last one full width), up to five in one row from sm, then rows of 3 or 4. */
  const answerCols = (n: number) =>
    n <= 2 ? "grid-cols-2" : `grid-cols-2 ${n === 3 ? "sm:grid-cols-3" : n === 4 ? "sm:grid-cols-4" : n === 5 ? "sm:grid-cols-5" : n === 6 || n === 9 ? "sm:grid-cols-3" : "sm:grid-cols-4"}`;
  /** A long answer as a name over a smaller line: "Authentic" over "(V to I)". */
  const splitLabel = (l: string): [string, string] => {
    const at = l.indexOf(" (");
    return at > 0 ? [l.slice(0, at), l.slice(at + 1)] : [l, ""];
  };
  /** Shortcut keys for the answer buttons, in order: all twelve intervals have one. */
  const KEYS = "1234567890-=".split("");
  const degreeChoices = $derived(current?.drill === "scale-degree" && answer === "choice");
  /** A degree as one short word: "3", or "mi" in solfege (no "3 / mi" pairs in tight places). */
  const deg = (d: string) => (labels === "solfege" ? (SCALE_DEGREES.find((x) => x.label === d)?.solfege ?? d) : d);
  const isPhrase = (p: Prompt) => p.drill === "melody-dictation" || p.drill === "repertoire-transfer";
  /** A degree in a sentence: "3", with its solfège only when the labels are solfège ("3 (mi)"). */
  const degWords = (d: string) => (labels === "solfege" ? `${d} (${SCALE_DEGREES.find((x) => x.label === d)?.solfege ?? d})` : d);
  /** The mix-ups as plain lines: "Heard 3 as #4, once". A phrase lists the single notes swapped, not whole phrases. */
  const mixups = $derived(
    noteSwaps.length
      ? noteSwaps.map((n) => ({ key: n.want + n.got, text: m.music_drills_eardrill_mixup_line({ expected: n.wantDeg, answered: n.gotDeg, times: times(n.count) }) }))
      : confused.map((c) => ({ key: c.kind + c.expected + c.answered, text: m.music_drills_eardrill_mixup_line({ expected: tokenLabel(c.kind, c.expected, labels), answered: tokenLabel(c.kind, c.answered, labels), times: times(c.count) }) })),
  );
  /** Answered by ear (not played back): the answer is drawn on the strip's instrument. */
  const onInstrument = (p: Prompt) => ON_INSTRUMENT.includes(p.drill) && !isPlayback;
  /** "the root for root position, the 3rd for first inversion": what each offered inversion puts lowest. */
  const inversionHint = (tokens: string[]) =>
    tokens
      .map((t) => EAR_INVERSIONS.find((x) => x.token === t))
      .filter((x) => !!x)
      .map((x) => [m.music_drills_eardrill_inv_hint_root, m.music_drills_eardrill_inv_hint_third, m.music_drills_eardrill_inv_hint_fifth, m.music_drills_eardrill_inv_hint_seventh][x.position]())
      .join(", ");
  const showAnswer = $derived(answer === "listen-along" || step === "revealed" || (step === "feedback" && (mode === "practice" || (!!current && isPhrase(current)))));
  /** Items in plain words: a range of intervals, a set's own name, or the names themselves. */
  const itemsText = $derived.by(() => {
    if (!SETS) return "";
    if (chordDrill) return picked.map(kindLabel).join(" ");
    const names = picked.map(itemName);
    if (slug === "intervals") return names.length > 2 ? m.music_drills_eardrill_items_interval_range({ count: names.length, first: names[0], last: names.at(-1)! }) : formatList(names);
    const preset = SETS.sets.find((x) => sameSet(x.tokens, picked));
    if (preset) return preset.label.toLowerCase();
    return names.length > 3 ? SETS.units(names.length) : formatList(names.map((n) => n.toLowerCase()));
  });
  const summaryLine = $derived<SetupClause[]>(
    [
      { text: answer === "choice" ? m.music_drills_eardrill_sum_buttons() : MODE_LABEL[answer], focus: (LISTEN as readonly string[]).includes(answer) ? "listen" : "answer" },
      slug === "mixed" && answer !== "voice"
        ? { text: kinds.length === MIX_KINDS.length ? m.music_drills_eardrill_sum_all_drills() : kinds.length > 3 ? m.music_drills_eardrill_sum_some_drills({ count: kinds.length, total: MIX_KINDS.length }) : kinds.map((k) => KIND_LABEL[k].toLowerCase()).join(", "), focus: "mix" }
        : null,
      slug === "progressions" ? { text: keyChanges ? m.music_drills_eardrill_sum_key_changes() : m.music_drills_eardrill_sum_one_key(), focus: "changes" } : null,
      SETS && !keyChanges ? { text: itemsText, focus: "items" } : null,
      slug === "intervals" && s.direction !== "auto" ? { text: DIRECTIONS.find((d) => d.value === s.direction)?.label.toLowerCase() ?? "", focus: "direction" } : null,
      slug === "scales" && s.scaleDirection !== "auto" ? { text: SCALE_DIRECTIONS.find((d) => d.value === s.scaleDirection)?.label.toLowerCase() ?? "", focus: "scaleDirection" } : null,
      slug === "bass-lines" ? { text: BASS_LEVELS.find((l) => l.id === s.bassLevel)?.title.toLowerCase() ?? "", focus: "bass" } : null,
      slug === "song-loops" ? { text: (LOOP_SETS.find((l) => l.id === s.loops) ?? LOOP_SETS[0]).label.toLowerCase(), focus: "loops" } : null,
      chordDrill && !keyChanges ? { text: chordKind.minor ? m.music_drills_eardrill_sum_minor_key() : m.music_drills_eardrill_sum_major_key(), focus: "key" } : null,
      chordDrill && !keyChanges ? { text: chordKind.seventh ? m.music_drills_eardrill_sum_sevenths() : m.music_drills_eardrill_sum_triads(), focus: "size" } : null,
      fromSongs ? { text: m.music_drills_eardrill_sum_from_songs(), focus: "source" } : null,
      showLevel ? { text: LEVELS.find((l) => l.id === level)?.title ?? "", focus: "level" } : null,
      def.usesLabels && usesDegrees ? { text: labels === "solfege" ? m.music_drills_eardrill_sum_solfege() : m.music_drills_eardrill_sum_numbers(), focus: "labels" } : null,
      inKey ? { text: keyEvery ? m.music_drills_eardrill_sum_key_every({ count: keyEvery }) : m.music_drills_eardrill_sum_key_same(), focus: "keyEvery" } : null,
      { text: m.music_drills_eardrill_sum_ten_questions() as string },
    ].filter((c): c is SetupClause => !!c),
  );
  const blocked = $derived(
    (slug === "repertoire-transfer" && songCount !== null && planPhrases.length === 0) || (fromSongs && songCount !== null && ranked.length === 0)
      ? m.music_drills_eardrill_blocked_save_song()
      : answer === "voice" && mic.state === "denied"
        ? m.music_drills_eardrill_blocked_mic()
        : null,
  );
  /** The notes played so far, by name, or "nothing yet". */
  const playedList = (p: Prompt) => (played.length ? played.map((n) => playedName(p, n)).join(", ") : m.music_drills_eardrill_nothing_yet());
  const vocalDegree = $derived(current && mic.pitch ? SCALE_DEGREES[pc(mic.pitch.midi - tonicOf(current))].label : null);
</script>

{#snippet progressionSlots(p: Prompt)}
  <ol class="mb-3 flex flex-wrap gap-2" aria-label={m.music_drills_eardrill_your_progression()}>
    {#each p.answer.split(" ") as w, i (i)}
      {@const given = givenOf(p)}
      {@const got = i < given ? w : slots[i - given]}
      {@const judged = showAnswer && step === "feedback" && i >= given && got !== undefined}
      <li class="slot" data-state={judged ? (got === w ? "right" : "wrong") : got ? "filled" : null}>
        <span class="font-display text-xl font-semibold">{got && got !== "?" ? chordLabel(p, got) : "?"}</span>
        {#if judged}<span class="text-sm">{got === w ? "✓" : `✕ ${chordLabel(p, w)}`}</span>{/if}
      </li>
    {/each}
  </ol>
{/snippet}

<!-- The run drawn: the missed phrases and the mix-up grid, beside the breakdown on a laptop. -->
{#snippet runFigure()}
  <div class="grid gap-3">
    {#if missedPhrases.length}
      <!-- Each missed phrase drawn: the notes in their degree colours, yours in red with a cross where it differs. -->
      <section class="rounded-2xl border border-ws-line bg-ws-surface p-4" aria-labelledby="phrases-title">
        <h3 id="phrases-title" class="font-display text-lg font-semibold">{m.music_drills_eardrill_missed_title()}</h3>
        <!-- Two to a row on a laptop, so the figure stays short under the summary. -->
        <ul class="mt-2 grid gap-3 lg:grid-cols-2">
          {#each missedPhrases as mp (mp.i)}
            <li class="phrase-row rounded-xl p-3">
              <p class="text-sm font-semibold">{m.music_drills_eardrill_missed_question({ n: mp.i + 1, text: mp.text })}</p>
              <EarVisual prompt={mp.prompt} revealed prefix={m.music_drills_eardrill_the_phrase()} labels={labels === "solfege" ? "solfege" : "numbers"} answered={mp.notes} />
            </li>
          {/each}
        </ul>
      </section>
    {/if}
    {#if confused.length}
      <section class="rounded-2xl border border-ws-line bg-ws-surface p-4" aria-labelledby="confusions-title">
        <h3 id="confusions-title" class="font-display text-lg font-semibold">{m.music_drills_eardrill_mixed_up_title()}</h3>
        {#if gridOrder}
          <p class="mt-1 text-sm text-ws-soft"><span class="sm:hidden">{m.music_drills_eardrill_mixed_up_tap_play()}</span><span class="max-sm:hidden">{m.music_drills_eardrill_mixed_up_tap_square()}</span></p>
          <ConfusionGrid records={records.filter(Boolean)} order={gridOrder} name={(t) => tokenLabel(KIND_OF[slug], t, labels)} onplay={playPair} named={noteSwaps.length ? null : confused[0]} />
        {:else}
          <!-- No grid (phrases, a mix of drills): the mix-ups as plain lines. -->
          <ul class="mt-2 grid gap-1">
            {#each mixups as m (m.key)}<li>{m.text}</li>{/each}
          </ul>
        {/if}
      </section>
    {/if}
  </div>
{/snippet}

<DrillShell
  title={m.music_drills_eardrill_title()}
  trainer={earTrainer(entry.id)}
  hue="ear"
  demoLabel={slug === "chords" ? m.music_drills_eardrill_demo_example() : undefined}
  modeNotes={{
    practice: m.music_drills_eardrill_note_practice(),
    check: m.music_drills_eardrill_note_check(),
  }}
  blurb={def.description}
  summary={summaryLine}
  bind:phase
  bind:mode
  bind:status
  checkable={answer !== "listen" && answer !== "listen-along"}
  progress={prompts.length ? (qi + 1) / prompts.length : 0}
  ondemo={answer === "listen-along" ? undefined : playDemo}
  lesson={lessonRef}
  {demoPlaying}
  onstart={start}
  onstop={stop}
  {blocked}
  {cue}
  step={phase === "running" && step === "feedback" && mode === "practice" ? { label: qi + 1 < prompts.length ? m.music_drills_eardrill_next() : m.music_drills_eardrill_see_results(), run: next } : null}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2">
      {#if modes.length > 1}
        <Choice label={m.music_drills_eardrill_answer_by()} setupKey="answer" options={SCORED.filter((m) => !(keyChanges && m === "play-back")).map((m) => ({ value: m as AnswerMode, label: MODE_LABEL[m] }))} value={answer} onchange={(v) => cfg.set({ answer: v })} />
      {/if}
      {#if LISTEN.length}
        <Choice
          label={m.music_drills_eardrill_listen_only()}
          setupKey="listen"
          options={LISTEN.map((md) => ({
            value: md as AnswerMode,
            label: MODE_LABEL[md],
            hint: md === "listen" ? m.music_drills_eardrill_listen_hint() : m.music_drills_eardrill_listen_along_hint(),
          }))}
          value={answer}
          onchange={(v) => cfg.set({ answer: v })}
        />
      {/if}
      {#if slug === "mixed" && answer !== "voice"}
        <div class="flex min-w-0 flex-col gap-1 text-sm sm:col-span-2" role="group" aria-labelledby="mix-label" data-setup="mix">
          <span id="mix-label" class="font-medium">{m.music_drills_eardrill_mix_label()}</span>
          <div class="flex flex-wrap gap-1.5">
            {#each MIX_KINDS as k (k)}
              {@const out = isPlayback && NO_PLAYBACK.includes(k)}
              {@const on = mixPicked.includes(k) && !out}
              <button
                type="button"
                class="min-h-10 rounded-full border px-3 text-sm disabled:opacity-45 {on ? 'border-transparent bg-instr-strong font-semibold text-on-instr' : 'border-ws-line bg-ws-surface hover:bg-ws-raised'}"
                aria-pressed={on}
                disabled={out}
                onclick={() => toggleMix(k)}>{KIND_LABEL[k]}</button
              >
            {/each}
          </div>
          {#if isPlayback}<span class="text-ws-soft">{m.music_drills_eardrill_mix_no_playback()}</span>{/if}
        </div>
      {/if}
      {#if slug === "progressions"}
        <div class="sm:col-span-2">
          <Choice
            label={m.music_drills_eardrill_changes()}
            setupKey="changes"
            options={[
              { value: "none", label: m.music_drills_eardrill_changes_one_key(), hint: m.music_drills_eardrill_changes_one_key_hint() },
              { value: "key", label: m.music_drills_eardrill_changes_key(), hint: m.music_drills_eardrill_changes_key_hint() },
            ]}
            value={keyChanges ? "key" : "none"}
            onchange={(v) => cfg.set({ changes: v })}
          />
          {#if keyChanges}<p class="mt-1 text-sm text-ws-soft">{m.music_drills_eardrill_changes_name_where({ places: KEY_CHANGES.map((k) => k.label.toLowerCase()).join(", ") })}</p>{/if}
        </div>
      {/if}
      {#if SETS && !keyChanges}
        {@const custom = !SETS.sets.some((x) => sameSet(x.tokens, picked))}
        <div class="flex min-w-0 flex-col gap-2 text-sm sm:col-span-2" role="group" aria-labelledby="items-label" data-setup="items">
          <span id="items-label" class="font-medium">{SETS.title}</span>
          <div class="flex flex-wrap gap-1.5" role="group" aria-label={SETS.setsLabel}>
            {#each SETS.sets as set (set.label)}
              {@const on = sameSet(set.tokens, picked)}
              <button type="button" class="min-h-10 rounded-full border px-3 text-sm {on ? 'border-instr bg-instr-wash font-semibold' : 'border-ws-line hover:bg-ws-raised'}" aria-pressed={on} onclick={() => setItems(set.tokens)}>{set.label}</button>
            {/each}
          </div>
          <!-- Opens on its own when the pick is one no preset covers, and stays as the player leaves it. -->
          <details class="group" bind:open={pickOwn}>
            <summary class="flex min-h-10 w-fit cursor-pointer items-center rounded-lg px-1 font-medium text-instr-ink hover:bg-instr-wash">{m.music_drills_eardrill_pick_own()}</summary>
            <div class="mt-2 flex flex-col gap-2">
              <div class="flex flex-wrap gap-1.5">
                {#each SETS.items as it (it.token)}
                  {@const on = picked.includes(it.token)}
                  {@const name = chordDrill && chordKind.minor && it.token === "vii" ? m.music_drills_eardrill_subtonic() : it.name}
                  {@const short = chordDrill ? kindLabel(it.token) : it.short}
                  <button
                    type="button"
                    class="flex min-h-11 flex-col items-start justify-center rounded-lg border px-3 py-1 text-left {on ? 'border-transparent bg-instr-strong text-on-instr' : 'border-ws-line bg-ws-surface text-ws-soft hover:bg-ws-raised'}"
                    aria-pressed={on}
                    aria-label={name}
                    onclick={() => toggleItem(it.token)}
                  >
                    <span class="font-semibold leading-tight">{short}</span>
                    {#if short !== name}<span class="text-sm leading-tight">{name}</span>{/if}
                  </button>
                {/each}
              </div>
              {#if slug === "intervals"}
                <Choice
                  label={m.music_drills_eardrill_first_note()}
                  options={[
                    { value: "random", label: m.music_drills_eardrill_random() },
                    { value: String(FIXED_ROOT), label: m.music_drills_eardrill_middle_c({ note: note("C") }), hint: m.music_drills_eardrill_middle_c_hint() },
                  ]}
                  value={s.root === "random" ? "random" : String(FIXED_ROOT)}
                  onchange={(v) => cfg.set({ root: v })}
                />
              {/if}
            </div>
          </details>
          <span class="text-ws-soft">
            {slug === "progressions"
              ? m.music_drills_eardrill_items_progressions({ first: kindLabel("I"), count: picked.length })
              : picked.length === 1
                ? m.music_drills_eardrill_items_one()
                : m.music_drills_eardrill_items_only({ items: SETS.units(picked.length) })}
          </span>
        </div>
      {/if}
      {#if inKey}
        <Choice
          label={m.music_drills_eardrill_change_key()}
          setupKey="keyEvery"
          options={[
            { value: "run", label: m.music_drills_eardrill_key_per_run() },
            { value: "5", label: m.music_drills_eardrill_key_every_5(), hint: m.music_drills_eardrill_key_every_5_hint() },
            { value: "3", label: m.music_drills_eardrill_key_every_3() },
          ]}
          value={keyEvery ? String(keyEvery) : "run"}
          onchange={(v) => cfg.set({ keyEvery: v })}
        />
      {/if}
      {#if answer === "voice"}
        <Choice
          label={m.music_drills_eardrill_tolerance()}
          options={[
            { value: "50", label: m.music_drills_eardrill_tolerance_note() },
            { value: "35", label: m.music_drills_eardrill_tolerance_35() },
            { value: "25", label: m.music_drills_eardrill_tolerance_25() },
          ]}
          value={String(tune)}
          onchange={(v) => cfg.set({ tune: v })}
        />
      {/if}
      {#if slug === "wrong-note"}
        <Choice
          label={m.music_drills_eardrill_melodies()}
          setupKey="source"
          options={[
            { value: "made-up", label: m.music_drills_eardrill_melodies_made_up() },
            { value: "songs", label: songCount === null ? m.music_drills_eardrill_melodies_songs() : m.music_drills_eardrill_melodies_songs_count({ count: songCount }) },
          ]}
          value={s.source}
          onchange={(v) => cfg.set({ source: v })}
        />
      {/if}
      {#if slug === "fine-pitch"}
        <Choice
          label={m.music_drills_eardrill_start_at()}
          options={[{ value: "auto", label: m.music_drills_eardrill_where_left_off() }, ...[50, 25, 12].map((c) => ({ value: String(c), label: m.music_drills_eardrill_cents_label({ cents: c }) }))]}
          value={s.startCents}
          onchange={(v) => cfg.set({ startCents: v })}
        />
      {/if}
      {#if slug === "song-loops"}
        {@const set = LOOP_SETS.find((l) => l.id === s.loops) ?? LOOP_SETS[0]}
        <div class="sm:col-span-2">
          <Choice label={m.music_drills_eardrill_loops()} setupKey="loops" options={LOOP_SETS.map((l) => ({ value: l.id, label: l.label, hint: l.hint }))} value={set.id} onchange={(v) => cfg.set({ loops: v })} />
          <p class="mt-1 text-sm text-ws-soft">{m.music_drills_eardrill_loop_answers({ list: loopPalette(set.id).map(numeralLabel).join(", ") })}</p>
        </div>
      {/if}
      {#if slug === "bass-lines"}
        <Choice label={m.music_drills_eardrill_bass_notes()} setupKey="bass" options={BASS_LEVELS.map((l) => ({ value: l.id, label: l.title }))} value={s.bassLevel} onchange={(v) => cfg.set({ bassLevel: v })} />
      {/if}
      {#if slug === "scales"}
        <Choice label={m.music_drills_eardrill_direction()} setupKey="scaleDirection" options={SCALE_DIRECTIONS} value={s.scaleDirection} onchange={(v) => cfg.set({ scaleDirection: v })} />
      {/if}
      {#if chordDrill && !keyChanges}
        <Choice label={m.music_drills_eardrill_key()} setupKey="key" options={[{ value: "major", label: m.music_drills_eardrill_major() }, { value: "minor", label: m.music_drills_eardrill_minor() }]} value={s.keyMode} onchange={(v) => cfg.set({ keyMode: v })} />
        <Choice label={m.music_drills_eardrill_chord_size()} setupKey="size" options={[{ value: "triads", label: m.music_drills_eardrill_set_triads() }, { value: "sevenths", label: m.music_drills_eardrill_set_sevenths() }]} value={s.chordSize} onchange={(v) => cfg.set({ chordSize: v })} />
      {/if}
      {#if slug === "intervals"}
        <Choice label={m.music_drills_eardrill_direction()} setupKey="direction" options={DIRECTIONS} value={s.direction} onchange={(v) => cfg.set({ direction: v })} />
      {/if}
      {#if showLevel}
        <div class="sm:col-span-2">
          <Choice label={m.music_drills_eardrill_degree_level()} setupKey="level" options={LEVELS.map((l) => ({ value: l.id, label: l.title, detail: l.degrees.join(" "), hint: l.summary }))} value={level} onchange={(v) => cfg.set({ level: v })} />
        </div>
      {/if}
      {#if def.usesLabels && usesDegrees}
        <Choice
          label={m.music_drills_eardrill_labels()}
          setupKey="labels"
          options={[{ value: "degree", label: m.music_drills_eardrill_labels_degree() }, { value: "solfege", label: m.music_drills_eardrill_labels_solfege() }]}
          value={labels}
          onchange={(v) => labelPref.set({ labels: v })}
        />
      {/if}
    </div>
    {#if answer === "listen" || answer === "listen-along" || answer === "voice"}
      <p class="mt-3 text-sm text-ws-soft">
        {#if answer === "listen"}{m.music_drills_eardrill_note_listen()}
        {:else if answer === "listen-along"}{m.music_drills_eardrill_note_listen_along()}
        {:else}{m.music_drills_eardrill_note_voice()}{/if}
      </p>
    {/if}
  {/snippet}

  {#snippet hud()}
    {#if phase === "running" && current}
      <Stat label={m.music_drills_eardrill_question()} value={m.music_drills_eardrill_res_of({ right: qi + 1, total: prompts.length })} />
      {#if answer !== "listen-along" && mode === "practice"}<Stat label={m.music_drills_eardrill_right_so_far()} value={records.filter((r) => r?.correct).length} />{/if}
    {/if}
  {/snippet}


  {#snippet stage()}
    {#if phase === "running" && current}
      {@const p = current}
      <!-- One card holds the question and its answers, sized to its content (a grid, so the live layout
           centres it and never stretches it). The degree wheel sits inside it, beside the question, on a laptop. -->
      <div class="prompt grid gap-4 rounded-2xl p-4 sm:p-5 {degreeChoices ? 'lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-x-6' : ''}">
      <article
        data-dock="music"
        class="flex min-w-0 flex-col"
        aria-label={m.music_drills_eardrill_question_n({ n: qi + 1 })}
        data-drill={p.drill}
        data-answer={p.answer}
        data-expected={p.expectedMidi?.join(",") ?? ""}
        data-key={p.keyPc ?? ""}
        data-step={step}
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-sm text-ws-stage-soft">{keyLine(p)}</p>
            <p class="font-display text-xl font-semibold sm:text-2xl">{ask(p)}</p>
            {#if degreeChoices && step !== "feedback"}<p class="text-sm text-ws-stage-soft">{m.music_drills_eardrill_tap_wheel()}</p>{/if}
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" class={btnStage} aria-label={m.music_drills_eardrill_hear_again()} onclick={() => replay()} disabled={step === "feedback" && mode === "check"}>
              {#if sounding >= 0}<Volume2 class="playing size-4" aria-hidden="true" />{m.music_drills_eardrill_playing()}{:else}<RotateCcw class="size-4" aria-hidden="true" />{m.music_drills_eardrill_hear_again()}{/if}
            </button>
            {#if promptKey(p)}
              <button type="button" class={btnStage} onclick={() => hearKey()} disabled={step === "feedback" && mode === "check"}>{m.music_drills_eardrill_hear_key()}</button>
            {/if}
            {#if mistake && step === "feedback"}
              <!-- Beside Hear it again: the two back to back, from the same starting point. -->
              <button type="button" class={btnStage} onclick={() => mistake && playPrompt(mistake.both, { light: true })} aria-label={m.music_drills_eardrill_hear_both_label({ played: tokenLabel(p.drill, p.answer, labels), chosen: tokenLabel(p.drill, mistake.token, labels) })}>
                <Play class="size-4" aria-hidden="true" />{m.music_drills_eardrill_hear_both()}
              </button>
            {/if}
          </div>
        </div>

        <!-- The verdict first, then the picture that explains it. -->
        {#if showAnswer || hinted}
          <p class="answer mt-3 text-lg font-semibold">
            {#if rec && !rec.correct && step === "feedback" && mistake}
              <!-- The comparison below says what was played and what you chose: said once, there. -->
              <span class="verdict wrong" aria-hidden="true">✕</span> {m.music_drills_eardrill_verdict_compare()}
            {:else if rec && !rec.correct && step === "feedback"}
              <span class="verdict wrong" aria-hidden="true">✕</span>
              {#if p.drill === "interval-compare"}
                {rec.answered ? m.music_drills_eardrill_verdict_you_chose({ answer: tokenLabel(p.drill, p.answer), chosen: tokenLabel(p.drill, rec.answered).toLowerCase() }) : m.music_drills_eardrill_verdict_answer({ answer: tokenLabel(p.drill, p.answer) })}
              {:else if isPhrase(p) && rec.answered}
                <!-- A phrase: the notes as one line, then only the ones that differ, "3 for the 2". -->
                {@const want = p.answer.split(" ")}
                {@const got = rec.answered.split(" ")}
                {@const swaps = want.flatMap((d, i) => (got[i] !== undefined && got[i] !== d ? [m.music_drills_eardrill_phrase_swap({ got: deg(got[i]), want: deg(d) })] : [])).join(", ")}
                {swaps ? m.music_drills_eardrill_verdict_phrase({ phrase: want.map(deg).join(" "), swaps }) : m.music_drills_eardrill_verdict_phrase_other({ phrase: want.map(deg).join(" ") })}
              {:else}
                {rec.answered ? m.music_drills_eardrill_verdict_was_answered({ answer: tokenLabel(p.drill, p.answer, labels), answered: tokenLabel(p.drill, rec.answered, labels) }) : m.music_drills_eardrill_verdict_was({ answer: tokenLabel(p.drill, p.answer, labels) })}
              {/if}
            {:else if rec?.correct && step === "feedback"}
              <span class="verdict right" aria-hidden="true">✓</span> {m.music_drills_eardrill_status_right({ answer: tokenLabel(p.drill, p.answer, labels) })}
            {:else}
              {#if p.drill === "interval-compare"}{m.music_drills_eardrill_verdict_answer({ answer: tokenLabel(p.drill, p.answer) })}{:else}{(hinted && !showAnswer ? m.music_drills_eardrill_verdict_listen_for : m.music_drills_eardrill_verdict_it_is)({ answer: tokenLabel(p.drill, p.answer, labels) })}{/if}
            {/if}
          </p>
        {/if}
        <!-- The picture under the question: the card hugs its content, top aligned under the HUD. -->
        <div class="mt-3">
          {#if (onInstrument(p) || (p.drill === "scale-degree" && !isPlayback && step === "feedback")) && (showAnswer || hinted)}
            <!-- The notes on the strip's instrument, with a wrong choice dashed beside them. -->
            <EarReveal prompt={p} chosen={step === "feedback" ? mistake?.chosen : null} {lit} />
          {:else if onInstrument(p) && step !== "feedback" && answer !== "listen-along"}
            <!-- Before the answer: the instrument unlit, one octave up from the lowest note, so the card keeps its place. -->
            {@const lo = Math.min(...(p.expectedMidi ?? [60]))}
            <!-- A phone keeps the answers in view instead: the keys appear with the answer. -->
            <div class="max-sm:hidden"><InstrumentStage line={[lo, lo + 12]} marks={{}} interactive={false} /></div>
          {:else if mistake && step === "feedback"}
            <!-- What was played beside what you chose, from the same starting point. -->
            <div class="grid gap-3 sm:grid-cols-2">
              <EarVisual prompt={p} revealed prefix={m.music_drills_eardrill_played()} labels={labels === "solfege" ? "solfege" : "numbers"} />
              <EarVisual prompt={mistake.chosen} revealed prefix={m.music_drills_eardrill_you_chose()} labels={labels === "solfege" ? "solfege" : "numbers"} />
            </div>
          {:else}
            <EarVisual prompt={p} revealed={showAnswer || hinted} active={sounding} labels={labels === "solfege" ? "solfege" : "numbers"} answered={step === "feedback" && rec && (isPhrase(p) || p.drill === "scale") ? played : []} filled={step === "answer" && isPhrase(p) && (isPlayback || answer === "voice") ? played.map((m) => (Number.isFinite(m) ? deg(SCALE_DEGREES[pc(m - tonicOf(p))].label) : "?")) : []} />
          {/if}
        </div>

        {#if showAnswer || hinted}
          {#if (p.drill === "melody-dictation" || p.drill === "repertoire-transfer") && (step === "feedback" || answer === "listen-along")}
            <ol class="mt-3 flex flex-wrap gap-2" aria-label={m.music_drills_eardrill_the_phrase()}>
              {#each p.answer.split(" ") as d, i (i)}
                {@const got = rec?.answered?.split(" ")[i]}
                {@const state = got === undefined || step !== "feedback" ? null : got === d ? "right" : "wrong"}
                <li class="phrase-note" data-state={state}>
                  <span class="font-semibold">{labels === "solfege" ? tokenLabel("scale-degree", d, "solfege") : d}</span>
                  <span class="text-sm">{note(spellDegree(p.expectedMidi![i], tonicOf(p), d))}</span>
                  {#if state}<span class="text-sm font-semibold">{state === "right" ? "✓" : m.music_drills_eardrill_you_got({ degree: deg(got!) })}</span>{/if}
                </li>
              {/each}
            </ol>
          {/if}
        {/if}

      </article>

      <!-- The answers sit at the bottom of a phone screen, under the thumb. Once answered, Continue comes
           under them, where the thumb already is (on a phone it takes their place; the answers, marked,
           stay in view from sm up). -->
      <div class="min-w-0" data-dock="answers">
        <div class={step === "feedback" && mode === "practice" && answer === "choice" ? "max-sm:hidden" : ""}>
        {#if answer === "choice" || answer === "listen-along"}
          {#if degreeChoices || (answer === "listen-along" && p.drill === "scale-degree")}
            <DegreeWheel
              available={p.choices}
              {labels}
              center={tonicName(tonicOf(p))}
              lit={litDegree}
              expected={showAnswer ? p.answer : null}
              answered={rec && !rec.correct && showAnswer ? (rec.answered ?? null) : null}
              disabled={answer === "listen-along" || step === "feedback"}
              onpick={choose}
            />
          {:else if answer === "choice" && p.drill === "error-detect" && p.written}
            <!-- The melody as written: tap the note that sounded different. -->
            <ol class="flex flex-wrap gap-2" aria-label={m.music_drills_eardrill_melody_written()}>
              {#each p.written as d, i (i)}
                {@const t = String(i + 1)}
                <li>
                  <button
                    type="button"
                    class="written-note"
                    data-state={showAnswer && t === p.answer ? "expected" : showAnswer && rec && !rec.correct && rec.answered === t ? "answered" : null}
                    aria-label={m.music_drills_eardrill_note_written({ n: t, degree: tokenLabel("scale-degree", d, labels) })}
                    disabled={step === "feedback"}
                    onclick={() => choose(t)}
                  >
                    <span class="font-semibold">{labels === "solfege" ? tokenLabel("scale-degree", d, "solfege") : d}</span>
                    <span class="text-sm">{showAnswer && t === p.answer ? m.music_drills_eardrill_written_wrong() : showAnswer && rec?.answered === t ? "✕" : t}</span>
                  </button>
                </li>
              {/each}
              {#if p.choices.includes("none")}
                <li><button type="button" class="choice min-h-12 rounded-xl px-3 text-sm font-semibold" disabled={step === "feedback"} onclick={() => choose("none")}>{m.music_drills_eardrill_no_wrong_note()}</button></li>
              {/if}
            </ol>
          {:else if answer === "choice" && (p.drill === "progression" || p.drill === "key-change" || p.drill === "loop" || p.drill === "bass-line")}
            {@render progressionSlots(p)}
            <div class="grid gap-2 {p.drill === 'key-change' && !slots.length ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-4 sm:grid-cols-8'}">
              {#each slotChoices(p) as t (t)}
                <button type="button" class="choice min-h-12 rounded-xl px-3 font-display font-semibold {p.drill === 'key-change' && !slots.length ? 'text-base' : 'text-lg'}" disabled={step === "feedback"} onclick={() => tapChord(t)}>{chordLabel(p, t)}</button>
              {/each}
              <button type="button" class="choice min-h-12 rounded-xl px-3 text-sm" disabled={step === "feedback" || !slots.length} onclick={() => (slots = slots.slice(0, -1))}>{m.music_drills_eardrill_undo()}</button>
            </div>
          {:else if answer === "choice"}
            <div class="grid gap-2 {answerCols(choiceTokens.length)}">
              {#each choiceTokens as t, i (t)}
                {@const [name, sub] = splitLabel(tokenLabel(p.drill, t, labels))}
                <button
                  type="button"
                  class="choice flex min-h-14 flex-col items-center justify-center rounded-xl px-3 py-1.5 text-base font-semibold leading-tight {i === choiceTokens.length - 1 && choiceTokens.length % 2 ? 'max-sm:col-span-2' : ''}"
                  data-key={KEYS[i] ?? null}
                  data-state={showAnswer && t === p.answer ? "expected" : showAnswer && rec && !rec.correct && rec.answered === t ? "answered" : null}
                  disabled={step === "feedback"}
                  onclick={() => choose(t)}
                >
                  <!-- One line of markup, so the button's text stays "Authentic (V to I)" for search and tests. -->
                  <span>{name}{#if showAnswer && t === p.answer}<span aria-hidden="true">{" ✓"}</span><span class="sr-only">{m.music_drills_eardrill_sr_the_answer()}</span>{/if}{#if showAnswer && rec && !rec.correct && rec.answered === t}<span aria-hidden="true">{" ✕"}</span><span class="sr-only">{m.music_drills_eardrill_sr_your_answer()}</span>{/if}</span>{#if sub}<span class="text-sm font-medium text-ws-stage-soft">{" " + sub}</span>{/if}
                </button>
              {/each}
            </div>
            {#if p.drill === "inversion"}
              <!-- What the names mean, in one line: which chord tone is lowest. -->
              <p class="mt-2 text-sm text-ws-stage-soft">{m.music_drills_eardrill_in_the_bass({ hint: inversionHint(p.choices) })}</p>
            {/if}
          {/if}
          {#if answer === "listen-along" && p.drill !== "scale-degree" && !onInstrument(p)}
            <InstrumentStage line={earLine} low={48} high={84} marks={pianoMarks} interactive={false} />
          {/if}
        {:else if answer === "listen"}
          <div class="flex flex-wrap gap-2">
            {#if step !== "revealed"}
              <button type="button" class={btnPrimary} onclick={reveal} disabled={step === "feedback"}>{m.music_drills_eardrill_reveal()}</button>
            {:else}
              <button type="button" class={btnPrimary} onclick={() => rate(true)}>{m.music_drills_eardrill_heard_it()}</button>
              <button type="button" class={btn} onclick={() => rate(false)}>{m.music_drills_eardrill_missed_it()}</button>
            {/if}
          </div>
        {:else if answer === "voice"}
          <div class="grid grid-cols-[minmax(0,1fr)] items-center gap-4 {p.drill === 'interval' ? '' : 'md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]'}">
            <!-- The wheel lights the degree you are singing, relative to this prompt's tonic. -->
            {#if p.drill !== "interval"}
            <DegreeWheel
              available={levelDegrees(level)}
              {labels}
              center={tonicName(tonicOf(p))}
              lit={step === "answer" ? vocalDegree : null}
              expected={showAnswer ? p.answer : null}
              answered={showAnswer && rec && !rec.correct && p.drill === "scale-degree" ? (rec.answered ?? null) : null}
            />
            {/if}
            <div class="voice rounded-2xl p-4" aria-label={m.music_drills_eardrill_microphone()}>
              <p class="text-sm text-ws-stage-soft">
                {step === "playing" ? m.music_drills_eardrill_mic_listen_first() : step === "answer" ? m.music_drills_eardrill_mic_sing_now() : m.music_drills_eardrill_mic_got_it()}
              </p>
              <div class="meter mt-2" aria-hidden="true"><span style:width="{Math.max(0, Math.min(100, ((mic.level + 60) / 60) * 100))}%"></span></div>
              <p class="mt-2 font-display text-2xl font-semibold tnum">
                {#if mic.pitch && p.drill === "interval"}{note(noteName(mic.pitch.midi, "flat"))}{:else if mic.pitch && vocalDegree}{playedName(p, mic.pitch.midi)}, {tokenLabel("scale-degree", vocalDegree, labels)}{:else}{m.music_drills_eardrill_no_pitch()}{/if}
              </p>
              {#if p.drill === "bass-line"}{@render progressionSlots(p)}{/if}
              {#if p.drill === "melody-dictation" || p.drill === "scale"}
                <p class="mt-1 text-sm text-ws-stage-soft">
                  {m.music_drills_eardrill_sung({ notes: played.length ? played.map((n) => tokenLabel("scale-degree", SCALE_DEGREES[pc(n - tonicOf(p))].label, labels)).join(", ") : m.music_drills_eardrill_nothing_yet() })}
                  {#if step === "answer" && played.length}<button type="button" class="{btnStage} ml-2" onclick={() => (played = [])}>{m.music_drills_eardrill_sing_again()}</button>{/if}
                </p>
              {/if}
              {#if sungCents.length}<p class="text-sm text-ws-stage-soft">{tune < 50 ? m.music_drills_eardrill_last_note_within({ cents: centsText(sungCents.at(-1)!), tune }) : m.music_drills_eardrill_last_note({ cents: centsText(sungCents.at(-1)!) })}</p>{/if}
              {#if mic.advice}<p class="text-sm text-ws-stage-soft">{mic.advice.label}</p>{/if}
            </div>
          </div>
        {:else}
          {#if p.drill === "progression" || p.drill === "loop" || p.drill === "bass-line"}{@render progressionSlots(p)}{/if}
          <InstrumentStage line={earLine} low={48} high={84} marks={pianoMarks} {flashes} names={mode === "check" ? "none" : "c"} />
          <div class="mt-2 flex flex-wrap items-center gap-3 text-sm text-ws-stage-soft">
            <span>{tonicMarked(p) ? m.music_drills_eardrill_you_played_tonic({ notes: playedList(p), note: tonicName(tonicOf(p)) }) : m.music_drills_eardrill_you_played_notes({ notes: playedList(p) })}</span>
            {#if step === "answer" && played.length}
              <button type="button" class={btnStage} onclick={() => (played = [])}>{m.music_drills_eardrill_clear()}</button>
              {#if p.drill === "chord-quality" || p.drill === "chord-function" || p.drill === "progression" || p.drill === "loop" || p.drill === "inversion"}<button type="button" class={btnStage} onclick={submitChord}>{m.music_drills_eardrill_thats_my_chord()}</button>{/if}
            {/if}
            {#if (p.drill === "progression" || p.drill === "loop" || p.drill === "bass-line") && step === "answer" && slots.length}
              <button type="button" class={btnStage} onclick={() => (slots = slots.slice(0, -1))}>{m.music_drills_eardrill_undo_chord()}</button>
            {/if}
          </div>
        {/if}
        </div>
        {#if mode === "practice" && answer !== "listen" && answer !== "listen-along" && step !== "feedback" && !hinted}
          <!-- A quiet way out, under the answers: never beside the replays, where a thumb lands by habit. -->
          <button type="button" class="mt-2 min-h-11 rounded-lg px-1 text-sm font-medium text-ws-stage-soft underline underline-offset-4 hover:text-ws-stage-ink" onclick={showAnswerNow}>{m.music_drills_eardrill_show_answer()}</button>
        {/if}
      </div>
      {#if step === "feedback" && mode === "practice"}
        <!-- Continue full width under the feedback from sm (across both columns beside the wheel); a phone docks it. -->
        <button type="button" class="{btnPrimary} min-h-14 w-full text-base max-sm:hidden {degreeChoices ? 'lg:col-span-2' : ''}" onclick={next}>{qi + 1 < prompts.length ? m.music_drills_eardrill_next() : m.music_drills_eardrill_see_results()}</button>
      {/if}
      </div>
    {:else if phase === "results" && answer === "listen-along"}
      <p class="font-display text-xl font-semibold">{m.music_drills_eardrill_listened_heading({ count: listened })}</p>
      <p class="text-ws-stage-soft">{m.music_drills_eardrill_listened_note()}</p>
    {:else if slug === "repertoire-transfer" && songCount !== null && planPhrases.length === 0}
      <div class="py-6 text-center">
        <p class="font-display text-xl font-semibold">{m.music_drills_eardrill_no_songs()}</p>
        <p class="mt-1 text-ws-stage-soft">{m.music_drills_eardrill_no_songs_note()}</p>
        <a class="{btnPrimary} mt-4" href="/music/studio?tab=import">{m.music_drills_eardrill_import_song()}</a>
      </div>
    {:else}
      <div class="grid grid-cols-[minmax(0,1fr)] items-center gap-5 {slug === 'scale-degrees' ? 'md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]' : ''}">
        {#if slug === "scale-degrees"}
          <div>
            <DegreeWheel available={levelDegrees(level)} {labels} center={tonicName(droneTonic)} lit={litDegree} onpick={compare} />
          </div>
          <div class="space-y-3">
            <p class="font-display text-xl font-semibold">{m.music_drills_eardrill_warmup_title()}</p>
            <p class="text-sm text-ws-stage-soft">{m.music_drills_eardrill_warmup_note()}</p>
            <div class="flex flex-wrap items-end gap-2">
              <div class="flex flex-col gap-1 text-sm">
                <span>{m.music_drills_eardrill_tonic()}</span>
                <KeyPicker class="min-w-24" tone="stage" label={m.music_drills_eardrill_tonic()} value={droneTonic - 48} name={(pc) => tonicName(48 + pc)} onchange={(pc) => { droneTonic = 48 + pc; if (droneOn) { audio.drone.stop(); audio.drone.start(droneTonic, "sine", 0.3); } }} />
              </div>
              <button type="button" class={btnStage} aria-pressed={droneOn} onclick={toggleDrone}>{droneOn ? m.music_drills_eardrill_drone_stop() : m.music_drills_eardrill_drone_start()}</button>
            </div>
            {#if demo}<p class="text-sm">{m.music_drills_eardrill_demo_line({ answer: tokenLabel(demo.kind, demo.answer, labels) })}</p>{/if}
          </div>
        {:else}
          <div class="space-y-2">
            <!-- What a run is, not the subtitle again. -->
            <p class="font-display text-xl font-semibold">
              {answer === "listen-along" ? m.music_drills_eardrill_intro_along() : answer === "choice" ? m.music_drills_eardrill_intro_choice() : answer === "play-back" ? m.music_drills_eardrill_intro_play() : answer === "voice" ? m.music_drills_eardrill_intro_voice() : m.music_drills_eardrill_intro_listen()}
            </p>
            {#if slug === "repertoire-transfer"}
              <ul class="mt-2 grid gap-2 sm:grid-cols-2">
                {#each [[m.music_drills_eardrill_plan_warmup(), plan.warmup], [m.music_drills_eardrill_plan_review(), plan.review], [m.music_drills_eardrill_plan_new(), plan.new], [m.music_drills_eardrill_plan_stretch(), plan.stretch]] as const as [name, list] (name)}
                  {#if list.length}
                    <li class="rounded-xl bg-ws-stage-ink/8 p-3">
                      <p class="text-sm font-semibold">{name}</p>
                      {#each list as ph (ph.id)}
                        <p class="text-sm text-ws-stage-soft">{ph.title}, {ph.degrees.map((d) => tokenLabel("scale-degree", d, labels)).join(" ")} <span class="text-sm">({ph.tag})</span></p>
                      {/each}
                    </li>
                  {/if}
                {/each}
              </ul>
            {:else}
              <p class="text-sm text-ws-stage-soft">
                {answer === "choice" ? m.music_drills_eardrill_how_choice() : answer === "play-back" ? m.music_drills_eardrill_how_play() : answer === "voice" ? m.music_drills_eardrill_how_voice() : answer === "listen" ? m.music_drills_eardrill_how_listen() : m.music_drills_eardrill_how_along()}
                {m.music_drills_eardrill_how_example()}
              </p>
            {/if}
            {#if demo}<p class="font-semibold">{m.music_drills_eardrill_that_was({ answer: tokenLabel(demo.kind, demo.answer, labels) })}</p>{/if}
          </div>
          <InstrumentStage line={earLine} low={48} high={84} marks={pianoMarks} interactive={isPlayback} />
        {/if}
      </div>
    {/if}
  {/snippet}

  {#snippet results()}
    {#if summary}
      <Results {summary} figure={missedPhrases.length || confused.length ? runFigure : undefined} />
    {/if}
  {/snippet}

</DrillShell>

<svelte:window onkeydown={onKey} />

<style>
  .phrase-row {
    background: var(--ws-stage);
    color: var(--ws-stage-ink);
  }
  .prompt {
    background: color-mix(in oklch, var(--ws-stage-ink) 7%, transparent);
    border: 1px solid color-mix(in oklch, var(--instr) 30%, transparent);
  }
  .choice {
    position: relative;
    background: color-mix(in oklch, var(--ws-stage-ink) 12%, transparent);
    border: 2px solid color-mix(in oklch, var(--ws-stage-ink) 22%, transparent);
  }
  .choice:not(:disabled):hover {
    background: color-mix(in oklch, var(--instr) 22%, transparent);
    border-color: var(--instr);
  }
  /* Answered: a tinted fill with the check or cross the label carries, the same on every width. */
  .choice[data-state="expected"] {
    border-color: var(--success);
    background: color-mix(in oklch, var(--success) 24%, transparent);
  }
  .choice[data-state="answered"] {
    border-color: var(--destructive);
    background: color-mix(in oklch, var(--destructive) 22%, transparent);
  }
  /* Not an answer now: the border fades, the label keeps full contrast (4.5:1). */
  .choice:disabled:not([data-state]) {
    border-color: color-mix(in oklch, var(--ws-stage-ink) 12%, transparent);
  }
  /* The number key that picks it, where there is a keyboard, in its own column at the left so it never touches the
     label. Generated text, so the button's name stays the answer. */
  @media (pointer: fine) and (min-width: 40rem) {
    .choice[data-key] {
      padding-left: 2rem;
    }
    .choice[data-key]::after {
      content: attr(data-key);
      position: absolute;
      top: 50%;
      left: 0.7rem;
      translate: 0 -50%;
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--ws-stage-soft);
    }
  }
  /* Hear it again while the prompt sounds: the speaker pulses. */
  :global(.playing) {
    animation: ws-pulse 900ms ease-in-out infinite;
  }
  @keyframes ws-pulse {
    50% {
      opacity: 0.35;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.playing) {
      animation: none;
    }
  }
  .verdict {
    display: inline-grid;
    place-items: center;
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 999px;
    font-size: 0.9rem;
    color: var(--ws-stage);
  }
  .verdict.right {
    background: var(--success);
  }
  .verdict.wrong {
    background: var(--destructive);
  }
  /* Degree chips: one neutral colour; green and red (with a tick or a cross) only for right and wrong. */
  .phrase-note,
  .written-note {
    display: grid;
    justify-items: center;
    min-width: 3.2rem;
    padding: 0.4rem 0.6rem;
    border-radius: 0.8rem;
    border: 2px solid color-mix(in oklch, var(--ws-stage-ink) 30%, transparent);
    background: color-mix(in oklch, var(--ws-stage-ink) 10%, transparent);
    color: var(--ws-stage-ink);
  }
  .written-note {
    min-height: 3.2rem;
  }
  .written-note:not(:disabled):hover {
    border-color: var(--instr);
  }
  .phrase-note[data-state="right"],
  .written-note[data-state="expected"] {
    border-color: var(--success);
    background: color-mix(in oklch, var(--success) 22%, transparent);
  }
  .phrase-note[data-state="wrong"],
  .written-note[data-state="answered"] {
    border-color: var(--destructive);
    background: color-mix(in oklch, var(--destructive) 20%, transparent);
  }
  .slot {
    display: grid;
    justify-items: center;
    min-width: 3.4rem;
    padding: 0.4rem 0.7rem;
    border-radius: 0.8rem;
    border: 2px dashed color-mix(in oklch, var(--ws-stage-ink) 30%, transparent);
  }
  .slot[data-state="filled"] {
    border-style: solid;
    border-color: var(--instr);
  }
  .slot[data-state="right"] {
    border-style: solid;
    border-color: var(--success);
  }
  .slot[data-state="wrong"] {
    border-color: var(--destructive);
  }
  .voice {
    background: color-mix(in oklch, var(--ws-stage-ink) 7%, transparent);
  }
  .meter {
    height: 0.5rem;
    border-radius: 999px;
    background: color-mix(in oklch, var(--ws-stage-ink) 12%, transparent);
    overflow: hidden;
  }
  .meter span {
    display: block;
    height: 100%;
    background: var(--instr);
  }
</style>

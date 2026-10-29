<script lang="ts">
  // One ear drill page for all seven routes. A run is 10 prompts; each prompt is
  // heard, answered (choice, play-back, voice, pocket recall) and, in Practice,
  // judged in place with a Continue step. Listen along is never a run.
  import { onDestroy, untrack } from "svelte";
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
  import DrillShell, { type DrillMode, type Phase, type RunContext, type SetupClause } from "$lib/music/components/DrillShell.svelte";
  import InstrumentStage from "$lib/music/components/InstrumentStage.svelte";
  import Choice from "$lib/music/components/Choice.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { type RunSummary } from "$lib/music/components/Results.svelte";
  import { Flashes, type CellMarks } from "$lib/music/components/feedback.svelte";
  import { btn, btnPrimary, btnStage } from "$lib/music/components/ui";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { assistanceFor, capture, pct, runInstrument, runSource, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { audio, db, getSetting, mic, putSetting, settings } from "$lib/music/runtime";
  import DegreeWheel from "./DegreeWheel.svelte";
  import EarVisual from "./EarVisual.svelte";
  import { degreeColor } from "./degrees";
  import type { NextRun } from "$lib/music/advance.svelte";
  import KeyPicker from "$lib/music/components/KeyPicker.svelte";
  import {
    buildSession,
    cadenceShift,
    confusions,
    KIND_LABEL,
    levelDegrees,
    MIX_KINDS,
    mixKinds,
    NO_PLAYBACK,
    perKind,
    retryPrompts,
    shortLabel,
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
    choice: "Choice",
    "play-back": "Play it back",
    voice: "Sing it",
    listen: "Pocket recall",
    "listen-along": "Listen along",
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
    /** "intervals", and one of them: "interval". */
    unit: string;
    one: string;
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
          title: "Intervals to practise",
          unit: "intervals",
          one: "interval",
          phrase: (t) => `the ${itemName(t).toLowerCase()}`,
          items: EAR_INTERVALS.map((i) => ({ token: i.token, short: i.token, name: i.name })),
          fallback: TWELVE,
          sets: [
            { label: "Starter", tokens: ["P5", "P8"] },
            { label: "First steps", tokens: ["M3", "P5", "P8"] },
            { label: "Perfect", tokens: ["P1", "P4", "P5", "P8"] },
            { label: "Thirds and sixths", tokens: ["m3", "M3", "m6", "M6"] },
            { label: "Seconds and sevenths", tokens: ["m2", "M2", "m7", "M7"] },
            { label: "Major scale", tokens: ["M2", "M3", "P4", "P5", "M6", "M7", "P8"] },
            { label: "All twelve", tokens: TWELVE },
          ],
          ladder: ["P8", "P5", "M3", "P4", "m3", "M6", "M2", "m7", "m6", "M7", "m2", "TT"],
        }
      : slug === "chord-qualities"
        ? {
            key: "qualities",
            title: "Chord qualities to practise",
            unit: "qualities",
            one: "quality",
            phrase: (t) => `${itemName(t).toLowerCase()} chords`,
            items: QUALITIES.map((q) => ({ token: q.token, short: QUALITY_SHORT[q.token] ?? q.token, name: q.label })),
            fallback: QUALITIES.map((q) => q.token),
            sets: [
              { label: "Major and minor", tokens: ["major", "minor"] },
              { label: "Triads", tokens: ["major", "minor", "diminished", "augmented"] },
              { label: "Sevenths", tokens: ["major-7", "dominant-7", "minor-7", "half-diminished-7", "diminished-7"] },
              { label: "Everything", tokens: QUALITIES.map((q) => q.token) },
            ],
            ladder: ["major", "minor", "diminished", "augmented", "dominant-7", "major-7", "minor-7", "half-diminished-7", "diminished-7"],
          }
        : slug === "cadences"
          ? {
              key: "cadences",
              title: "Cadences to practise",
              unit: "cadences",
              one: "cadence",
              phrase: (t) => `${itemName(t).toLowerCase()} cadences`,
              items: CADENCES.map((c) => ({ token: c.token, short: c.romanProgression.join("-"), name: c.label })),
              fallback: CADENCES.map((c) => c.token),
              sets: [
                { label: "Authentic and plagal", tokens: ["authentic", "plagal"] },
                { label: "Ending or pausing", tokens: ["authentic", "half"] },
                { label: "All four", tokens: CADENCES.map((c) => c.token) },
              ],
              ladder: ["authentic", "plagal", "half", "deceptive"],
            }
          : slug === "chord-functions" || slug === "progressions"
            ? {
                key: "functions",
                title: "Chords to practise",
                unit: "chords",
                one: "chord",
                phrase: (t) => `the ${kindLabel(t)} chord`,
                items: CHORD_FUNCTIONS.map((f) => ({ token: f.token, short: f.token, name: f.name })),
                fallback: CHORD_FUNCTIONS.map((f) => f.token),
                sets: [
                  { label: "Primary three", tokens: ["I", "IV", "V"] },
                  { label: "Add the sixth", tokens: ["I", "IV", "V", "vi"] },
                  { label: "Add the second and sixth", tokens: ["I", "ii", "IV", "V", "vi"] },
                  { label: "All seven", tokens: CHORD_FUNCTIONS.map((f) => f.token) },
                ],
                ladder: ["I", "V", "IV", "vi", "ii", "iii", "vii"],
              }
            : slug === "scales"
              ? {
                  key: "scales",
                  title: "Scales to practise",
                  unit: "scales",
                  one: "scale",
                  phrase: (t) => `the ${itemName(t).toLowerCase()} scale`,
                  items: EAR_SCALES.map((x) => ({ token: x.token, short: x.short, name: x.name })),
                  fallback: EAR_SCALES.map((x) => x.token),
                  sets: [
                    { label: "Major and minor", tokens: ["major", "natural-minor"] },
                    { label: "The three minors", tokens: ["natural-minor", "harmonic-minor", "melodic-minor"] },
                    { label: "Pentatonics and blues", tokens: ["major-pentatonic", "minor-pentatonic", "blues"] },
                    { label: "Bright modes", tokens: ["major", "lydian", "mixolydian"] },
                    { label: "Dark modes", tokens: ["natural-minor", "dorian", "phrygian", "locrian"] },
                    { label: "All twelve", tokens: EAR_SCALES.map((x) => x.token) },
                  ],
                  // Major and minor first, then the colours a player meets soonest, Locrian last.
                  ladder: EAR_SCALES.map((x) => x.token),
                }
              : slug === "inversions"
                ? {
                    key: "inversions",
                    title: "Inversions to practise",
                    unit: "positions",
                    one: "position",
                    phrase: (t) => itemName(t).toLowerCase(),
                    items: EAR_INVERSIONS.map((x) => ({ token: x.token, short: x.short, name: x.name })),
                    fallback: ["root", "first", "second"],
                    sets: [
                      { label: "Root and first", tokens: ["root", "first"] },
                      { label: "All three", tokens: ["root", "first", "second"] },
                      { label: "Sevenths", tokens: ["7-root", "7-first", "7-second", "7-third"] },
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
    { value: "auto", label: "Auto", hint: "Up at first, then both ways as you improve." },
    { value: "ascending", label: "Up" },
    { value: "both", label: "Up and down" },
    { value: "descending", label: "Down" },
  ];
  /** A fixed first note: middle C, so even an octave down stays on the keys. */
  const FIXED_ROOT = 60;
  const DIRECTIONS = [
    { value: "auto", label: "Auto", hint: "Up at first, then every way as you improve." },
    { value: "mixed", label: "Mixed", hint: "Up, down or together, from the first prompt." },
    { value: "ascending", label: "Up" },
    { value: "descending", label: "Down" },
    { value: "harmonic", label: "Together" },
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
  let played = $state<number[]>([]);
  /** Cents off the nearest note for each note sung on this prompt. */
  let sungCents = $state<number[]>([]);
  const tune = $derived(Number(s.tune) || 50);
  const centsText = (c: number) => (Math.abs(c) < 3 ? "in tune" : `${Math.abs(Math.round(c))} cents ${c > 0 ? "sharp" : "flat"}`);
  /** A sung note outside the tolerance is wrong, whatever note it was. */
  const tuned = (g: Graded, cents: number): Graded => (Math.abs(cents) > tune ? { ...g, score: 0, correct: false } : g);
  /** A progression's chords after the opening I, as tapped. */
  let slots = $state<string[]>([]);
  let hinted = $state(false);
  let summary = $state<RunSummary | null>(null);
  let listened = $state(0);
  let queued: Prompt[] | null = null;
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
  function showMistake(p: Prompt, token: string) {
    const chosen = asChosen(p, token);
    if (!chosen) return;
    const after = Math.max(...p.playback.map((e) => e.time + e.duration)) + 0.9;
    // The key is set once: the chosen version follows without its key-setting chords.
    const tail = chosen.slice(p.keyEvents ?? 0);
    const t0 = tail[0]?.time ?? 0;
    mistake = {
      token,
      chosen: { ...p, id: `${p.id}-chose-${token}`, answer: token, playback: chosen, ...(p.drill === "key-change" ? { caption: keyChangeCaption(p.fromPc ?? 0, token) } : {}) },
      both: { ...p, id: `${p.id}-vs-${token}`, playback: [...p.playback, ...tail.map((e) => ({ ...e, time: e.time - t0 + after }))] },
    };
    setTimeout(() => mistake && playPrompt(mistake.both), 500);
  }
  let demo = $state<{ answer: string; kind: string } | null>(null);
  let demoPlaying = $state(false);
  const flashes = new Flashes();
  const rand = rng(Math.floor(Math.random() * 2 ** 31));

  const current = $derived(prompts[qi]);
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
    const lessons = earLessons(keyChanges ? "key-changes" : slug, keyChanges ? [] : items, { direction: slug === "intervals" ? s.direction : undefined, minor: degs.includes("b3") && !degs.includes("3") });
    return lessons.length ? { lessons } : null;
  });

  // ---------------------------------------------------------------------------
  // Prompt helpers

  const tonicOf = (p: Prompt) => p.playback[0].midi[0];
  /** Major-key degrees by semitones above the tonic. */
  const MAJOR_DEGREE: Record<number, string> = { 0: "1", 2: "2", 4: "3", 5: "4", 7: "5", 9: "6", 11: "7" };
  const keyLine = (p: Prompt) => {
    if (p.drill === "bass-line") return `Key of ${noteName(48 + (p.keyPc ?? 0), "flat", false)} major, ${p.answer.split(" ").length} chords from I`;
    if (p.drill === "chord-function" || p.drill === "progression") {
      const minor = parseFunction(p.answer).minor;
      const key = `Key of ${noteName(48 + (p.keyPc ?? 0), "flat", false)} ${minor ? "minor" : "major"}`;
      const one = minor ? "i" : "I";
      const cadence = minor ? "i, iv, V, i" : "I, IV, V, I";
      return p.drill === "chord-function"
        ? p.keyEvents
          ? `${key}: ${cadence}, then one chord`
          : `${key}, set once with ${cadence}: one chord a question`
        : `${key}, ${p.answer.split(" ").length} chords from ${one}`;
    }
    if (p.drill === "key-change") return `Key of ${noteName(48 + (p.fromPc ?? 0), "flat", false)} major, set with I, IV, V, I: then it moves`;
    if (p.drill === "loop") {
      const key = `Key of ${noteName(48 + (p.keyPc ?? 0), "flat", false)} ${p.minor ? "minor" : "major"}`;
      return `${key}, set with ${p.minor ? "i, iv, V, i" : "I, IV, V, I"}: a loop of ${p.answer.split(" ").length} chords`;
    }
    if (p.drill === "inversion") return "One chord";
    if (p.drill === "pitch-compare") return `A note, then the same note ${centsOf(p)} cents off${p.choices.includes("same") ? " or in tune" : ""}`;
    if (p.drill === "scale") return `Tonic ${noteName(p.playback[0].midi[0], "flat", false)}, held underneath`;
    if (p.drill === "cadence") {
      const shift = cadenceShift(p.id);
      return `Key of ${noteName(48 + shift, "flat", false)} major`;
    }
    if (p.drill === "error-detect") return `Tonic ${noteName(tonicOf(p), "flat", false)}, then the melody as written${p.songTitle ? `, from ${p.songTitle}` : ""}`;
    if (p.drill === "scale-degree" || p.drill === "melody-dictation" || p.drill === "repertoire-transfer")
      return `Tonic ${noteName(tonicOf(p), "flat", false)}${p.phrase ? `, from ${p.phrase.title}` : ""}`;
    return p.drill === "interval" ? "Two notes" : p.drill === "interval-compare" ? "Two intervals, one after the other" : "One chord";
  };
  const scaleName = (t: string) => EAR_SCALES.find((x) => x.token === t)?.name ?? t;
  const ask = (p: Prompt) =>
    p.drill === "interval"
      ? answer === "voice"
        ? p.direction === "harmonic"
          ? "Sing the higher note, in any octave."
          : "Sing the second note back, in any octave."
        : isPlayback
          ? "Play the two notes back, from any note."
          : "What interval was that?"
      : p.drill === "interval-compare"
        ? "Which interval was bigger?"
      : p.drill === "chord-quality"
        ? isPlayback
          ? "Play a chord of the same quality, from any root."
          : "What quality is the chord?"
        : p.drill === "cadence"
          ? "Which cadence ends the phrase?"
        : p.drill === "scale"
          ? answer === "voice"
            ? `Sing the ${scaleName(p.answer).toLowerCase()} scale ${p.direction === "descending" ? "down" : p.direction === "both" ? "up and down" : "up"} from the tonic, in any octave.`
            : "Which scale was that?"
        : p.drill === "error-detect"
          ? p.choices.includes("none")
            ? "Which note was played wrong, if any?"
            : "Which note was played wrong?"
        : p.drill === "pitch-compare"
          ? p.choices.includes("same")
            ? "Was the second note higher, lower or in tune?"
            : "Was the second note higher or lower?"
        : p.drill === "inversion"
          ? isPlayback
            ? "Play the chord back with the same note in the bass."
            : "Which note of the chord is in the bass?"
        : p.drill === "chord-function"
          ? isPlayback
            ? `Play the ${p.keyEvents ? "last " : ""}chord back, in any octave.`
            : p.keyEvents
              ? "Which chord of the key was the last one?"
              : "Which chord of the key was that?"
        : p.drill === "bass-line"
          ? answer === "voice"
            ? "Sing the bass notes after the 1, one at a time, in any octave."
            : isPlayback
            ? "Play the bass notes after the 1, one at a time."
            : "Which bass notes came after the 1?"
        : p.drill === "key-change"
          ? "Where does it go, and which chords take it there?"
        : p.drill === "loop"
          ? isPlayback
            ? "Play the loop's chords back, one at a time."
            : "Which chords make the loop, in order?"
        : p.drill === "progression"
          ? isPlayback
            ? `Play the chords after the ${functionLabel(p.answer.split(" ")[0])}, one at a time.`
            : `Which chords came after the ${functionLabel(p.answer.split(" ")[0])}?`
          : p.drill === "scale-degree"
            ? answer === "voice"
              ? "Sing the second note back."
              : isPlayback
                ? "Play the second note back."
                : "Which degree was the second note?"
            : answer === "voice"
              ? "Sing the phrase back in order, in any octave."
              : "Play the phrase back in order.";

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
    status = `Listen: ${tokenLabel(p.drill, p.answer, labels)}, lit as it sounds.`;
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
    status = droneOn ? `Drone on ${noteName(droneTonic, "flat", false)}. Tap a degree to hear it against home. Nothing is recorded.` : "Drone off.";
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
    status = `Home, then ${tokenLabel("scale-degree", label, labels)}.`;
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
    prompts = queued ?? makeSession();
    queued = null;
    records = [];
    // Not open for answers until the first prompt has played (the microphone may take a moment to start).
    step = "playing";
    if (!prompts.length) {
      phase = "ready";
      status = "Nothing to ask with this setup.";
      return;
    }
    if (answer === "voice") {
      status = "Starting the microphone.";
      const ok = await mic.start();
      if (!ok) {
        phase = "ready";
        status = mic.error || "The microphone could not start.";
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
    status = `Question ${i + 1} of ${prompts.length}. Listen.`;
    // The key is set once per block: before the run's first prompt in a key, or when a mix changes key.
    if (keyId(p) && keyId(p) !== keyId(prompts[i - 1])) hearKey(p, () => replay(p, true));
    else replay(p, true);
  }

  const keyId = (p?: Prompt) => {
    const k = p && promptKey(p);
    return k ? `${k.keyPc}${k.minor ? "m" : ""}` : "";
  };
  const keyName = (k: { keyPc: number; minor: boolean }) => `${noteName(48 + k.keyPc, "flat", false)} ${k.minor ? "minor" : "major"}`;

  /** I IV V I in the prompt's key, then `then` (the prompt again, by default). */
  function hearKey(p = current, then = () => replay(p)) {
    const k = p && promptKey(p);
    if (!k) return;
    clearTimeout(advanceTimer);
    openAt = Infinity;
    if (step === "answer") step = "playing";
    status = `Key of ${keyName(k)}, then the question.`;
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
      light: answer === "listen-along",
      onend: () => {
        if (prompts[qi] !== p || phase !== "running") return;
        // A short tail so the last note's release can't answer for the player.
        openAt = performance.now() + 150;
        promptAt = first ? performance.now() : promptAt;
        setTimeout(() => {
          if (prompts[qi] === p && step === "playing") step = "answer";
        }, 150);
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
      const off = Math.abs(cents) > tune ? `out of tune, ${centsText(cents)}` : null;
      if (p.drill === "interval") {
        // The second note (the higher one when played together), in any octave.
        const [a, b] = p.expectedMidi!;
        const [from, to] = p.direction === "harmonic" ? [Math.min(a, b), Math.max(a, b)] : [a, b];
        const right = gradeScaleDegree(from, to - from, { midi: e.midi, cents: e.cents });
        const g = tuned(right, cents);
        const semis = pc(p.direction === "descending" ? from - e.midi : e.midi - from);
        const heard = right.correct && off ? off : g.correct ? p.answer : (EAR_INTERVALS.find((i) => i.semitones === semis)?.token ?? "another note");
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
      const heard = (intervalBySemitones(d)?.token ?? `${d} semitones`) + (p.direction !== "harmonic" && (g.playedSemitones ?? 0) * (p.direction === "descending" ? -1 : 1) < 0 ? " (wrong way)" : "");
      void commit(g, heard, played.slice(0, 2), notes, [{ kind: "choice", expected: p.answer, actual: heard }]);
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
      const heard = found ? (EAR_INVERSIONS.find((x) => x.position === found.position && x.seventh === seventh)?.token ?? "another chord") : "another chord";
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
      } else void commit(gradeChordPlayback(p.expectedMidi!, played), token ?? "another chord", played, notes);
      return;
    }
    const g = gradeChordQualityPlayback(p.answer, played);
    const heard = g.detected ?? classifyChord(played)?.token ?? "another chord";
    const notes = cap?.notes.filter((n) => n.kind === "noteon" && n.at >= openAt) ?? [];
    void commit(g, heard, played, notes, [{ kind: "choice", expected: p.answer, actual: heard }]);
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
        ? `Right: ${tokenLabel(p.drill, p.answer, labels)}.`
        : `That was ${tokenLabel(p.drill, p.answer, labels)}. You answered ${tokenLabel(p.drill, answered, labels)}.`;
    } else {
      status = `Answer ${i + 1} saved.`;
      // A phrase is shown once it has been answered, even in a test; the answer is already in.
      advanceTimer = setTimeout(next, isPhrase(p) ? 1600 : 450);
    }
  }

  function reveal() {
    step = "revealed";
    status = `It was ${tokenLabel(current.drill, current.answer, labels)}. Did you hear it?`;
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
    status = `The answer is ${tokenLabel(current.drill, current.answer, labels)}. Listen for it, then answer: this one counts as hinted.`;
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

  const byKind = $derived(perKind(records.filter(Boolean)));
  const confused = $derived(confusions(records.filter(Boolean)));

  async function finish() {
    teardown();
    phase = "results";
    if (answer === "listen-along") {
      status = `You listened to ${listened} prompts. Listening along is never scored.`;
      return;
    }
    const done = records.filter(Boolean);
    const right = done.filter((r) => r.correct).length;
    const score = done.length ? right / done.length : 0;
    lastEvents = [...run!.events];
    const fin = await run!.finish({ score, correct: right === prompts.length, headline: `${right} of ${prompts.length}` });
    const top = confused[0];
    const pocket = answer === "listen";
    summary = {
      headline:
        right === prompts.length
          ? pocket
            ? `You heard all ${prompts.length}. Try Choice to check it.`
            : `All ${prompts.length} right.`
          : top
            ? `${right} of ${prompts.length} ${pocket ? "heard" : "right"}. You heard ${shortLabel(top.kind, top.expected, labels)} as ${shortLabel(top.kind, top.answered, labels)}${top.count > 1 ? ` ${top.count} times` : ""}.`
            : `${right} of ${prompts.length} ${pocket ? "heard" : "right"}.`,
      metric: pct(score),
      metricLabel: pocket ? "heard, self-rated" : "accuracy",
      delta: fin.delta,
      best: fin.best,
      clean: mode === "check" && right === prompts.length && !pocket,
      xp: fin.xp,
      assistance: pocket
        ? "Pocket recall: you rated yourself, so this doesn't move mastery."
        : mode === "check"
          ? "Test run: no feedback during the run, so it counts toward mastery."
          : "Practice run with feedback after each answer. Switch to Check to count it.",
      rows: centsRows(done) ?? itemRows(done) ?? byKind.map((k) => ({ label: KIND_LABEL[k.kind as EarKind] ?? "Repertoire phrases", value: k.total ? k.correct / k.total : 0, text: `${k.correct} of ${k.total}` })),
      routine: page.url.searchParams.get("routine") ? { label: "Back to today's plan", href: "/music" } : undefined,
    };
    if (slug === "fine-pitch") {
      summary.headline += ` Next time starts near ${CENT_STEPS[stair.at]} cents.`;
      rememberedStep = stair.at;
      void putSetting(STAIR_KEY, stair.at);
    }
    status = summary.headline;
    if ((SETS || levelSteps) && !pocket && !keyChanges) summary.advance = await checkUnlock(done);
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
        return { label: `${c} cents`, value: ok / here.length, text: `${ok} of ${here.length}` };
      });
  }

  /** One results row per answer asked (an interval, a quality, a degree): this run and overall. */
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
        const skill = targets.find((x) => x.token === t)?.skillId ?? targets[0]?.skillId;
        const all = skill ? accuracy[skill] : undefined;
        return { label: tokenLabel(kind, t, labels), value: ok / here.length, text: `${ok} of ${here.length}${all !== undefined ? `, ${Math.round(all * 100)}% overall` : ""}` };
      });
  }

  // Once what you practise feels easy (about 90% of the last 20 answers), offer
  // the next step as the next run: one more item in a set, or the next degree level.
  const RECENT_KEY = `music.ear-${slug}.recent`;
  const LEVEL_LADDER = ["anchor", "major-pentachord", "major-diatonic", "minor-diatonic", "chromatic-color"];
  const levelSteps = $derived(def.usesScaleDegreeLevel && slug !== "mixed" && slug !== "repertoire-transfer" && !fromSongs);
  async function checkUnlock(done: AnswerRecord[]): Promise<NextRun | undefined> {
    const set = SETS ? picked.join(",") : `level:${level}`;
    const saved = await getSetting<{ set: string; results: boolean[] }>(RECENT_KEY, { set, results: [] });
    const results = [...(saved.set === set ? saved.results : []), ...done.map((r) => r.correct)].slice(-20);
    await putSetting(RECENT_KEY, { set, results });
    const easy = results.length >= 20 && results.filter(Boolean).length / results.length >= 0.9;
    if (!easy) return;
    const reason = "90% of the last 20 answers";
    if (SETS) {
      const next = SETS.ladder.find((t) => !picked.includes(t));
      if (!next) return;
      return { kind: "harder", label: SETS.phrase(next), reason, go: () => setItems([...picked, next]) };
    }
    const next = SCALE_DEGREE_LEVELS.find((l) => l.id === LEVEL_LADDER[LEVEL_LADDER.indexOf(level) + 1]);
    if (!next) return;
    return { kind: "harder", label: next.title, reason, go: () => cfg.set({ level: next.id }) };
  }

  function stop() {
    teardown();
    phase = "ready";
    status = answer === "listen-along" ? "Stopped." : `Stopped after ${records.filter(Boolean).length} answers. Answers already given are saved.`;
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

  // ---------------------------------------------------------------------------
  // Surfaces

  /** The prompt's notes and what is lit: where the fretboard window sits on guitar and ukulele. */
  const earLine = $derived([...(current?.expectedMidi ?? []), ...lit]);
  const pianoMarks = $derived.by(() => {
    const out: Record<number, CellMarks> = {};
    for (const m of lit) out[m] = { demo: true };
    const p = current;
    if (phase === "running" && p && isPlayback && mode === "practice" && (step === "feedback" || hinted) && p.expectedMidi) {
      const show = p.drill === "interval" || p.drill === "chord-quality" ? [] : p.expectedMidi;
      for (const m of show) out[m] = { target: true };
    }
    return out;
  });

  const choiceTokens = $derived(current?.choices ?? []);
  const degreeChoices = $derived(current?.drill === "scale-degree" && answer === "choice");
  const isPhrase = (p: Prompt) => p.drill === "melody-dictation" || p.drill === "repertoire-transfer";
  const showAnswer = $derived(answer === "listen-along" || step === "revealed" || (step === "feedback" && (mode === "practice" || (!!current && isPhrase(current)))));
  const summaryLine = $derived<SetupClause[]>(
    [
      { text: MODE_LABEL[answer], focus: (LISTEN as readonly string[]).includes(answer) ? "listen" : "answer" },
      slug === "mixed" && answer !== "voice"
        ? { text: kinds.length === MIX_KINDS.length ? "all nine drills" : kinds.length > 3 ? `${kinds.length} drills` : kinds.map((k) => KIND_LABEL[k].toLowerCase()).join(", "), focus: "mix" }
        : null,
      slug === "progressions" ? { text: keyChanges ? "key changes" : "in one key", focus: "changes" } : null,
      SETS && !keyChanges
        ? { text: SETS.sets.find((x) => sameSet(x.tokens, picked))?.label.toLowerCase() ?? picked.map((t) => (chordDrill ? kindLabel(t) : (SETS.items.find((i) => i.token === t)?.short ?? t))).join(" "), focus: "items" }
        : null,
      slug === "intervals" && s.direction !== "auto" ? { text: DIRECTIONS.find((d) => d.value === s.direction)?.label.toLowerCase() ?? "", focus: "direction" } : null,
      slug === "scales" && s.scaleDirection !== "auto" ? { text: SCALE_DIRECTIONS.find((d) => d.value === s.scaleDirection)?.label.toLowerCase() ?? "", focus: "scaleDirection" } : null,
      slug === "bass-lines" ? { text: BASS_LEVELS.find((l) => l.id === s.bassLevel)?.title.toLowerCase() ?? "", focus: "bass" } : null,
      slug === "song-loops" ? { text: (LOOP_SETS.find((l) => l.id === s.loops) ?? LOOP_SETS[0]).label.toLowerCase(), focus: "loops" } : null,
      chordDrill && !keyChanges ? { text: `${chordKind.minor ? "minor" : "major"} key`, focus: "key" } : null,
      chordDrill && !keyChanges ? { text: chordKind.seventh ? "sevenths" : "triads", focus: "size" } : null,
      fromSongs ? { text: "from my songs", focus: "source" } : null,
      showLevel ? { text: LEVELS.find((l) => l.id === level)?.title ?? "", focus: "level" } : null,
      def.usesLabels && usesDegrees ? { text: labels === "solfege" ? "solfège labels" : "degree labels", focus: "labels" } : null,
      inKey ? { text: keyEvery ? `a new key every ${keyEvery}` : "one key a run", focus: "keyEvery" } : null,
      { text: "10 prompts" },
    ].filter((c): c is SetupClause => !!c),
  );
  const blocked = $derived(
    (slug === "repertoire-transfer" && songCount !== null && planPhrases.length === 0) || (fromSongs && songCount !== null && ranked.length === 0)
      ? "Save a song with a score first."
      : answer === "voice" && mic.state === "denied"
        ? "Allow the microphone to sing answers."
        : null,
  );
  const vocalDegree = $derived(current && mic.pitch ? SCALE_DEGREES[pc(mic.pitch.midi - tonicOf(current))].label : null);
</script>

{#snippet progressionSlots(p: Prompt)}
  <ol class="mb-3 flex flex-wrap gap-2" aria-label="Your progression">
    {#each p.answer.split(" ") as w, i (i)}
      {@const given = givenOf(p)}
      {@const got = i < given ? w : slots[i - given]}
      {@const judged = showAnswer && step === "feedback" && i >= given && got !== undefined}
      <li class="slot" data-state={judged ? (got === w ? "right" : "wrong") : got ? "filled" : null}>
        <span class="font-display text-xl font-semibold">{got && got !== "?" ? chordLabel(p, got) : "?"}</span>
        {#if judged}<span class="text-xs">{got === w ? "✓" : `✕ ${chordLabel(p, w)}`}</span>{/if}
      </li>
    {/each}
  </ol>
{/snippet}

<DrillShell
  title={def.title}
  hue="ear"
  modeNotes={{
    practice: "Feedback after every answer. Practice, not a test.",
    check: "No feedback until the end. Counts toward mastery.",
  }}
  blurb={def.description}
  summary={summaryLine}
  bind:phase
  bind:mode
  bind:status
  checkable={answer !== "listen" && answer !== "listen-along"}
  progress={prompts.length ? (qi + (rec ? 1 : 0)) / prompts.length : 0}
  ondemo={answer === "listen-along" ? undefined : playDemo}
  lesson={lessonRef}
  {demoPlaying}
  onstart={start}
  onstop={stop}
  {blocked}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2">
      {#if modes.length > 1}
        <Choice label="Answer by" setupKey="answer" options={SCORED.filter((m) => !(keyChanges && m === "play-back")).map((m) => ({ value: m as AnswerMode, label: MODE_LABEL[m] }))} value={answer} onchange={(v) => cfg.set({ answer: v })} />
      {/if}
      {#if LISTEN.length}
        <Choice
          label="Or just listen"
          setupKey="listen"
          options={LISTEN.map((m) => ({
            value: m as AnswerMode,
            label: MODE_LABEL[m],
            hint: m === "listen" ? "Answer in your head, reveal, then rate yourself. Never moves mastery." : "The answers are shown and the prompts move on by themselves. Not scored.",
          }))}
          value={answer}
          onchange={(v) => cfg.set({ answer: v })}
        />
      {/if}
      {#if slug === "mixed" && answer !== "voice"}
        <div class="flex min-w-0 flex-col gap-1 text-sm sm:col-span-2" role="group" aria-labelledby="mix-label" data-setup="mix">
          <span id="mix-label" class="font-medium">Drills in the mix</span>
          <div class="flex flex-wrap gap-1.5">
            {#each MIX_KINDS as k (k)}
              {@const out = isPlayback && NO_PLAYBACK.includes(k)}
              {@const on = mixPicked.includes(k) && !out}
              <button
                type="button"
                class="min-h-10 rounded-full border px-3 text-sm disabled:opacity-45 {on ? 'border-transparent bg-instr font-semibold text-ws-stage' : 'border-ws-line bg-ws-surface hover:bg-ws-raised'}"
                aria-pressed={on}
                disabled={out}
                onclick={() => toggleMix(k)}>{KIND_LABEL[k]}</button
              >
            {/each}
          </div>
          {#if isPlayback}<span class="text-ws-soft">Cadences and scales have no play-back answer, so they sit out.</span>{/if}
        </div>
      {/if}
      {#if slug === "progressions"}
        <div class="sm:col-span-2">
          <Choice
            label="Changes"
            setupKey="changes"
            options={[
              { value: "none", label: "In one key", hint: "Chords of the key, from I." },
              { value: "key", label: "Key changes", hint: "The key is set, then a ii-V, a V7 or a backdoor takes it somewhere new." },
            ]}
            value={keyChanges ? "key" : "none"}
            onchange={(v) => cfg.set({ changes: v })}
          />
          {#if keyChanges}<p class="mt-1 text-sm text-ws-soft">Name where it goes ({KEY_CHANGES.map((k) => k.label.toLowerCase()).join(", ")}), then the chords as numerals in the new key.</p>{/if}
        </div>
      {/if}
      {#if SETS && !keyChanges}
        {@const custom = !SETS.sets.some((x) => sameSet(x.tokens, picked))}
        <div class="flex min-w-0 flex-col gap-2 text-sm sm:col-span-2" role="group" aria-labelledby="items-label" data-setup="items">
          <span id="items-label" class="font-medium">{SETS.title}</span>
          <div class="flex flex-wrap gap-1.5" role="group" aria-label="{SETS.one.replace(/^./, (c) => c.toUpperCase())} sets">
            {#each SETS.sets as set (set.label)}
              {@const on = sameSet(set.tokens, picked)}
              <button type="button" class="min-h-10 rounded-full border px-3 text-sm {on ? 'border-instr bg-instr-wash font-semibold' : 'border-ws-line hover:bg-ws-raised'}" aria-pressed={on} onclick={() => setItems(set.tokens)}>{set.label}</button>
            {/each}
          </div>
          <!-- Opens on its own when the pick is one no preset covers, and stays as the player leaves it. -->
          <details class="group" bind:open={pickOwn}>
            <summary class="flex min-h-10 w-fit cursor-pointer items-center rounded-lg px-1 font-medium text-instr-ink hover:bg-instr-wash">Pick your own</summary>
            <div class="mt-2 flex flex-col gap-2">
              <div class="flex flex-wrap gap-1.5">
                {#each SETS.items as it (it.token)}
                  {@const on = picked.includes(it.token)}
                  {@const name = chordDrill && chordKind.minor && it.token === "vii" ? "Subtonic" : it.name}
                  {@const short = chordDrill ? kindLabel(it.token) : it.short}
                  <button
                    type="button"
                    class="flex min-h-11 flex-col items-start justify-center rounded-lg border px-3 py-1 text-left {on ? 'border-transparent bg-instr text-ws-stage' : 'border-ws-line bg-ws-surface text-ws-soft hover:bg-ws-raised'}"
                    aria-pressed={on}
                    aria-label={name}
                    onclick={() => toggleItem(it.token)}
                  >
                    <span class="font-semibold leading-tight">{short}</span>
                    {#if short !== name}<span class="text-xs leading-tight">{name}</span>{/if}
                  </button>
                {/each}
              </div>
              {#if slug === "intervals"}
                <Choice
                  label="First note"
                  options={[
                    { value: "random", label: "Random" },
                    { value: String(FIXED_ROOT), label: "Always middle C", hint: "Only the distance changes." },
                  ]}
                  value={s.root === "random" ? "random" : String(FIXED_ROOT)}
                  onchange={(v) => cfg.set({ root: v })}
                />
              {/if}
            </div>
          </details>
          <span class="text-ws-soft">
            {slug === "progressions"
              ? `Every progression starts on ${kindLabel("I")}; the rest use only these ${picked.length} chords.`
              : picked.length === 1
                ? `One picked: every prompt is this one, among all the answers.`
                : `${picked.length} ${SETS.unit}: only these play, and only these are the answers.`}
          </span>
        </div>
      {/if}
      {#if inKey}
        <Choice
          label="Change key"
          setupKey="keyEvery"
          options={[
            { value: "run", label: "One key a run" },
            { value: "5", label: "New key every 5", hint: "I, IV, V, I plays again at each change." },
            { value: "3", label: "New key every 3" },
          ]}
          value={keyEvery ? String(keyEvery) : "run"}
          onchange={(v) => cfg.set({ keyEvery: v })}
        />
      {/if}
      {#if answer === "voice"}
        <Choice
          label="Singing tolerance"
          options={[
            { value: "50", label: "The right note" },
            { value: "35", label: "Within 35 cents" },
            { value: "25", label: "Within 25 cents" },
          ]}
          value={String(tune)}
          onchange={(v) => cfg.set({ tune: v })}
        />
      {/if}
      {#if slug === "wrong-note"}
        <Choice
          label="Melodies"
          setupKey="source"
          options={[
            { value: "made-up", label: "Made up for the level" },
            { value: "songs", label: songCount === null ? "From my songs" : `From my songs (${songCount})` },
          ]}
          value={s.source}
          onchange={(v) => cfg.set({ source: v })}
        />
      {/if}
      {#if slug === "fine-pitch"}
        <Choice
          label="Start at"
          options={[{ value: "auto", label: "Where I left off" }, ...[50, 25, 12].map((c) => ({ value: String(c), label: `${c} cents` }))]}
          value={s.startCents}
          onchange={(v) => cfg.set({ startCents: v })}
        />
      {/if}
      {#if slug === "song-loops"}
        {@const set = LOOP_SETS.find((l) => l.id === s.loops) ?? LOOP_SETS[0]}
        <div class="sm:col-span-2">
          <Choice label="Loops" setupKey="loops" options={LOOP_SETS.map((l) => ({ value: l.id, label: l.label, hint: l.hint }))} value={set.id} onchange={(v) => cfg.set({ loops: v })} />
          <p class="mt-1 text-sm text-ws-soft">Answers: {loopPalette(set.id).map(numeralLabel).join(", ")}.</p>
        </div>
      {/if}
      {#if slug === "bass-lines"}
        <Choice label="Bass notes" setupKey="bass" options={BASS_LEVELS.map((l) => ({ value: l.id, label: l.title }))} value={s.bassLevel} onchange={(v) => cfg.set({ bassLevel: v })} />
      {/if}
      {#if slug === "scales"}
        <Choice label="Direction" setupKey="scaleDirection" options={SCALE_DIRECTIONS} value={s.scaleDirection} onchange={(v) => cfg.set({ scaleDirection: v })} />
      {/if}
      {#if chordDrill && !keyChanges}
        <Choice label="Key" setupKey="key" options={[{ value: "major", label: "Major" }, { value: "minor", label: "Minor" }]} value={s.keyMode} onchange={(v) => cfg.set({ keyMode: v })} />
        <Choice label="Chord size" setupKey="size" options={[{ value: "triads", label: "Triads" }, { value: "sevenths", label: "Sevenths" }]} value={s.chordSize} onchange={(v) => cfg.set({ chordSize: v })} />
      {/if}
      {#if slug === "intervals"}
        <Choice label="Direction" setupKey="direction" options={DIRECTIONS} value={s.direction} onchange={(v) => cfg.set({ direction: v })} />
      {/if}
      {#if showLevel}
        <div class="sm:col-span-2">
          <Choice label="Degree level" setupKey="level" options={LEVELS.map((l) => ({ value: l.id, label: l.title, detail: l.degrees.join(" "), hint: l.summary }))} value={level} onchange={(v) => cfg.set({ level: v })} />
        </div>
      {/if}
      {#if def.usesLabels && usesDegrees}
        <Choice
          label="Labels (every ear drill)"
          setupKey="labels"
          options={[{ value: "degree", label: "Degree (3 / mi)" }, { value: "solfege", label: "Solfège (mi)" }]}
          value={labels}
          onchange={(v) => labelPref.set({ labels: v })}
        />
      {/if}
    </div>
    {#if answer === "listen" || answer === "listen-along" || answer === "voice"}
      <p class="mt-3 text-sm text-ws-soft">
        {#if answer === "listen"}Pocket recall: think or sing, reveal, then rate yourself. Self-rated answers are saved but never move mastery.
        {:else if answer === "listen-along"}Listen along: the answers are shown and the prompts move on by themselves. Nothing is scored.
        {:else}Sing it: the microphone starts when you press Start and stops at the end. Headphones keep the prompt out of the mic.{/if}
      </p>
    {/if}
  {/snippet}

  {#snippet hud()}
    {#if phase === "running" && current}
      <Stat label="Question" value="{qi + 1} of {prompts.length}" />
      {#if answer !== "listen-along" && mode === "practice"}<Stat label="Right so far" value={records.filter((r) => r?.correct).length} />{/if}
    {/if}
  {/snippet}


  {#snippet stage()}
    {#if phase === "running" && current}
      {@const p = current}
      <article
        class="prompt rounded-2xl p-4 sm:p-5"
        aria-label="Question {qi + 1}"
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
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" class={btnStage} onclick={() => replay()} disabled={step === "feedback" && mode === "check"}>Hear it again</button>
            {#if promptKey(p)}
              <button type="button" class={btnStage} onclick={() => hearKey()} disabled={step === "feedback" && mode === "check"}>Hear the key</button>
            {/if}
            {#if mode === "practice" && answer !== "listen" && answer !== "listen-along" && step !== "feedback" && !hinted}
              <button type="button" class={btnStage} onclick={showAnswerNow}>Show answer</button>
            {/if}
          </div>
        </div>

        <div class="mt-3">
          {#if mistake && step === "feedback"}
            <!-- What was played beside what you chose, from the same starting point. -->
            <div class="grid gap-3 sm:grid-cols-2">
              <EarVisual prompt={p} revealed prefix="Played" labels={labels === "solfege" ? "solfege" : "numbers"} />
              <EarVisual prompt={mistake.chosen} revealed prefix="You chose" labels={labels === "solfege" ? "solfege" : "numbers"} />
            </div>
            <button type="button" class="{btnStage} mt-2" onclick={() => mistake && playPrompt(mistake.both)}>
              Hear both again: {tokenLabel(p.drill, p.answer, labels)}, then {tokenLabel(p.drill, mistake.token, labels)}
            </button>
          {:else}
            <EarVisual prompt={p} revealed={showAnswer || hinted} active={sounding} labels={labels === "solfege" ? "solfege" : "numbers"} />
          {/if}
        </div>

        {#if showAnswer || hinted}
          <p class="answer mt-1 text-lg font-semibold">
            {#if rec && !rec.correct && step === "feedback"}
              <span class="verdict wrong" aria-hidden="true">✕</span>
              {#if p.drill === "interval-compare"}
                {tokenLabel(p.drill, p.answer)}.{#if rec.answered} You chose: {tokenLabel(p.drill, rec.answered).toLowerCase()}.{/if}
              {:else}
                It was {tokenLabel(p.drill, p.answer, labels)}{#if rec.answered}. You answered {tokenLabel(p.drill, rec.answered, labels)}{/if}.
              {/if}
            {:else if rec?.correct && step === "feedback"}
              <span class="verdict right" aria-hidden="true">✓</span> Right: {tokenLabel(p.drill, p.answer, labels)}.
            {:else}
              {#if p.drill === "interval-compare"}{tokenLabel(p.drill, p.answer)}.{:else}{hinted && !showAnswer ? "Listen for" : "It is"} {tokenLabel(p.drill, p.answer, labels)}.{/if}
            {/if}
          </p>
          {#if (p.drill === "melody-dictation" || p.drill === "repertoire-transfer") && (step === "feedback" || answer === "listen-along")}
            <ol class="mt-3 flex flex-wrap gap-2" aria-label="The phrase">
              {#each p.answer.split(" ") as d, i (i)}
                {@const got = rec?.answered?.split(" ")[i]}
                <li class="phrase-note" style:--deg={degreeColor(d)}>
                  <span class="font-semibold">{labels === "solfege" ? tokenLabel("scale-degree", d, "solfege") : d}</span>
                  <span class="text-xs">{noteName(p.expectedMidi![i], "flat")}</span>
                  {#if got !== undefined && step === "feedback"}<span class="text-xs">{got === d ? "✓" : `✕ ${got}`}</span>{/if}
                </li>
              {/each}
            </ol>
          {/if}
        {/if}

        {#if step === "feedback" && mode === "practice"}
          <button type="button" class="{btnPrimary} mt-4" onclick={next}>{qi + 1 < prompts.length ? "Continue" : "See results"}</button>
        {/if}
      </article>

      <div class="mt-4">
        {#if answer === "choice" || answer === "listen-along"}
          {#if degreeChoices || (answer === "listen-along" && p.drill === "scale-degree")}
            <DegreeWheel
              available={p.choices}
              {labels}
              center={noteName(tonicOf(p), "flat", false)}
              lit={litDegree}
              expected={showAnswer ? p.answer : null}
              answered={rec && !rec.correct && showAnswer ? (rec.answered ?? null) : null}
              disabled={answer === "listen-along" || step === "feedback"}
              onpick={choose}
            />
          {:else if answer === "choice" && p.drill === "error-detect" && p.written}
            <!-- The melody as written: tap the note that sounded different. -->
            <ol class="flex flex-wrap gap-2" aria-label="The melody as written">
              {#each p.written as d, i (i)}
                {@const t = String(i + 1)}
                <li>
                  <button
                    type="button"
                    class="written-note"
                    style:--deg={degreeColor(d)}
                    data-state={showAnswer && t === p.answer ? "expected" : showAnswer && rec && !rec.correct && rec.answered === t ? "answered" : null}
                    aria-label="Note {t}, written {tokenLabel('scale-degree', d, labels)}"
                    disabled={step === "feedback"}
                    onclick={() => choose(t)}
                  >
                    <span class="font-semibold">{labels === "solfege" ? tokenLabel("scale-degree", d, "solfege") : d}</span>
                    <span class="text-xs">{showAnswer && t === p.answer ? "✓ wrong" : showAnswer && rec?.answered === t ? "✕" : t}</span>
                  </button>
                </li>
              {/each}
              {#if p.choices.includes("none")}
                <li><button type="button" class="choice min-h-12 rounded-xl px-3 text-sm font-semibold" disabled={step === "feedback"} onclick={() => choose("none")}>No wrong note</button></li>
              {/if}
            </ol>
          {:else if answer === "choice" && (p.drill === "progression" || p.drill === "key-change" || p.drill === "loop" || p.drill === "bass-line")}
            {@render progressionSlots(p)}
            <div class="grid gap-2 {p.drill === 'key-change' && !slots.length ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-4 sm:grid-cols-8'}">
              {#each slotChoices(p) as t (t)}
                <button type="button" class="choice min-h-12 rounded-xl px-3 font-display font-semibold {p.drill === 'key-change' && !slots.length ? 'text-base' : 'text-lg'}" disabled={step === "feedback"} onclick={() => tapChord(t)}>{chordLabel(p, t)}</button>
              {/each}
              <button type="button" class="choice min-h-12 rounded-xl px-3 text-sm" disabled={step === "feedback" || !slots.length} onclick={() => (slots = slots.slice(0, -1))}>Undo</button>
            </div>
          {:else if answer === "choice"}
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {#each choiceTokens as t (t)}
                <button
                  type="button"
                  class="choice min-h-12 rounded-xl px-3 text-left text-sm font-semibold"
                  data-state={showAnswer && t === p.answer ? "expected" : showAnswer && rec && !rec.correct && rec.answered === t ? "answered" : null}
                  disabled={step === "feedback"}
                  onclick={() => choose(t)}
                >
                  {tokenLabel(p.drill, t, labels)}
                  {#if showAnswer && t === p.answer}<span aria-hidden="true"> ✓</span><span class="sr-only">, the answer</span>{/if}
                  {#if showAnswer && rec && !rec.correct && rec.answered === t}<span aria-hidden="true"> ✕</span><span class="sr-only">, your answer</span>{/if}
                </button>
              {/each}
            </div>
          {/if}
          {#if answer === "listen-along" && p.drill !== "scale-degree"}
            <InstrumentStage line={earLine} low={48} high={84} marks={pianoMarks} interactive={false} />
          {/if}
        {:else if answer === "listen"}
          <div class="flex flex-wrap gap-2">
            {#if step !== "revealed"}
              <button type="button" class={btnPrimary} onclick={reveal} disabled={step === "feedback"}>Reveal answer</button>
            {:else}
              <button type="button" class={btnPrimary} onclick={() => rate(true)}>Heard it</button>
              <button type="button" class={btn} onclick={() => rate(false)}>Missed it</button>
            {/if}
          </div>
        {:else if answer === "voice"}
          <div class="grid grid-cols-[minmax(0,1fr)] items-center gap-4 {p.drill === 'interval' ? '' : 'md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]'}">
            <!-- The wheel lights the degree you are singing, relative to this prompt's tonic. -->
            {#if p.drill !== "interval"}
            <DegreeWheel
              available={levelDegrees(level)}
              {labels}
              center={noteName(tonicOf(p), "flat", false)}
              lit={step === "answer" ? vocalDegree : null}
              expected={showAnswer ? p.answer : null}
              answered={showAnswer && rec && !rec.correct && p.drill === "scale-degree" ? (rec.answered ?? null) : null}
            />
            {/if}
            <div class="voice rounded-2xl p-4" aria-label="Microphone">
              <p class="text-sm text-ws-stage-soft">
                {step === "playing" ? "Listen first. The mic opens when the prompt ends." : step === "answer" ? "Sing now. Hold the note until it locks." : "Got it."}
              </p>
              <div class="meter mt-2" aria-hidden="true"><span style:width="{Math.max(0, Math.min(100, ((mic.level + 60) / 60) * 100))}%"></span></div>
              <p class="mt-2 font-display text-2xl font-semibold tnum">
                {#if mic.pitch && p.drill === "interval"}{noteName(mic.pitch.midi, "flat")}{:else if mic.pitch && vocalDegree}{noteName(mic.pitch.midi, "flat")}, {tokenLabel("scale-degree", vocalDegree, labels)}{:else}No pitch yet{/if}
              </p>
              {#if p.drill === "bass-line"}{@render progressionSlots(p)}{/if}
              {#if p.drill === "melody-dictation" || p.drill === "scale"}
                <p class="mt-1 text-sm text-ws-stage-soft">
                  Sung: {played.length ? played.map((m) => tokenLabel("scale-degree", SCALE_DEGREES[pc(m - tonicOf(p))].label, labels)).join(", ") : "nothing yet"}
                  {#if step === "answer" && played.length}<button type="button" class="{btnStage} ml-2" onclick={() => (played = [])}>Start over</button>{/if}
                </p>
              {/if}
              {#if sungCents.length}<p class="text-sm text-ws-stage-soft">Last note: {centsText(sungCents.at(-1)!)}{tune < 50 ? `, within ${tune} counts` : ""}.</p>{/if}
              {#if mic.advice}<p class="text-sm text-ws-stage-soft">{mic.advice.label}</p>{/if}
            </div>
          </div>
        {:else}
          {#if p.drill === "progression" || p.drill === "loop" || p.drill === "bass-line"}{@render progressionSlots(p)}{/if}
          <InstrumentStage line={earLine} low={48} high={84} marks={pianoMarks} {flashes} names={mode === "check" ? "none" : "c"} />
          <div class="mt-2 flex flex-wrap items-center gap-3 text-sm text-ws-stage-soft">
            <span>You played: {played.length ? played.map((m) => noteName(m, "flat")).join(", ") : "nothing yet"}</span>
            {#if step === "answer" && played.length}
              <button type="button" class={btnStage} onclick={() => (played = [])}>Clear</button>
              {#if p.drill === "chord-quality" || p.drill === "chord-function" || p.drill === "progression" || p.drill === "loop" || p.drill === "inversion"}<button type="button" class={btnStage} onclick={submitChord}>That's my chord</button>{/if}
            {/if}
            {#if (p.drill === "progression" || p.drill === "loop" || p.drill === "bass-line") && step === "answer" && slots.length}
              <button type="button" class={btnStage} onclick={() => (slots = slots.slice(0, -1))}>Undo last chord</button>
            {/if}
          </div>
        {/if}
      </div>
    {:else if phase === "results" && answer === "listen-along"}
      <p class="font-display text-xl font-semibold">You listened to {listened} prompts.</p>
      <p class="text-ws-stage-soft">Listening along is never scored. Switch to Choice or Pocket recall when you want to answer.</p>
    {:else if slug === "repertoire-transfer" && songCount !== null && planPhrases.length === 0}
      <div class="py-6 text-center">
        <p class="font-display text-xl font-semibold">No saved songs to lift phrases from yet.</p>
        <p class="mt-1 text-ws-stage-soft">Phrases come from the melody of songs in your Library.</p>
        <a class="{btnPrimary} mt-4" href="/music/library?tab=import">Import a score in the Library</a>
      </div>
    {:else}
      <div class="grid grid-cols-[minmax(0,1fr)] items-center gap-5 {slug === 'scale-degrees' ? 'md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]' : ''}">
        {#if slug === "scale-degrees"}
          <div>
            <DegreeWheel available={levelDegrees(level)} {labels} center={noteName(droneTonic, "flat", false)} lit={litDegree} onpick={compare} />
          </div>
          <div class="space-y-3">
            <p class="font-display text-xl font-semibold">Free-play warmup</p>
            <p class="text-sm text-ws-stage-soft">Hold the tonic as a drone and tap any degree to hear it against home. Nothing here is scored or saved.</p>
            <div class="flex flex-wrap items-end gap-2">
              <div class="flex flex-col gap-1 text-sm">
                <span>Tonic</span>
                <KeyPicker class="min-w-24" tone="stage" label="Tonic" value={droneTonic - 48} name={(pc) => noteName(48 + pc, "flat", false)} onchange={(pc) => { droneTonic = 48 + pc; if (droneOn) { audio.drone.stop(); audio.drone.start(droneTonic, "sine", 0.3); } }} />
              </div>
              <button type="button" class={btnStage} aria-pressed={droneOn} onclick={toggleDrone}>{droneOn ? "Stop drone" : "Start drone"}</button>
            </div>
            {#if demo}<p class="text-sm">Demo: {tokenLabel(demo.kind, demo.answer, labels)}</p>{/if}
          </div>
        {:else}
          <div class="space-y-2">
            <p class="font-display text-xl font-semibold">{entry.blurb}</p>
            {#if slug === "repertoire-transfer"}
              <ul class="mt-2 grid gap-2 sm:grid-cols-2">
                {#each [["Warm-up", plan.warmup], ["Review", plan.review], ["New", plan.new], ["Stretch", plan.stretch]] as const as [name, list] (name)}
                  {#if list.length}
                    <li class="rounded-xl bg-ws-stage-ink/8 p-3">
                      <p class="text-sm font-semibold">{name}</p>
                      {#each list as ph (ph.id)}
                        <p class="text-sm text-ws-stage-soft">{ph.title}, {ph.degrees.map((d) => tokenLabel("scale-degree", d, labels)).join(" ")} <span class="text-xs">({ph.tag})</span></p>
                      {/each}
                    </li>
                  {/if}
                {/each}
              </ul>
            {:else}
              <p class="text-sm text-ws-stage-soft">
                {answer === "choice" ? "Answer with the buttons." : answer === "play-back" ? "Answer on the keys or your MIDI keyboard." : answer === "voice" ? "Answer by singing the note." : answer === "listen" ? "Answer in your head, then rate yourself." : "Just listen."}
                Press Hear it first for an example.
              </p>
            {/if}
            {#if demo}<p class="font-semibold">That was {tokenLabel(demo.kind, demo.answer, labels)}.</p>{/if}
          </div>
          <InstrumentStage line={earLine} low={48} high={84} marks={pianoMarks} interactive={isPlayback} />
        {/if}
      </div>
    {/if}
  {/snippet}

  {#snippet results()}
    {#if summary}
      <Results {summary}>
        {#snippet actions()}
          {#if retryCount}
            <button type="button" class={btn} onclick={retry}>Retry my confusions ({retryCount})</button>
          {/if}
        {/snippet}
      </Results>
      {#if confused.length}
        <section class="mt-3 rounded-2xl border border-ws-line bg-ws-surface p-4" aria-labelledby="confusions-title">
          <h3 id="confusions-title" class="font-display text-lg font-semibold">What you mixed up</h3>
          <ul class="mt-2 grid gap-1 sm:grid-cols-2">
            {#each confused as c (c.kind + c.expected + c.answered)}
              <li class="flex items-baseline justify-between gap-3 text-sm">
                <span>Expected <strong>{shortLabel(c.kind, c.expected, labels)}</strong>, answered <strong>{shortLabel(c.kind, c.answered, labels)}</strong></span>
                <span class="tnum text-ws-soft">{c.count}×</span>
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    {/if}
  {/snippet}
</DrillShell>

<style>
  .prompt {
    background: color-mix(in oklch, var(--ws-stage-ink) 7%, transparent);
    border: 1px solid color-mix(in oklch, var(--instr) 30%, transparent);
  }
  .choice {
    background: color-mix(in oklch, var(--ws-stage-ink) 9%, transparent);
    border: 2px solid transparent;
  }
  .choice:not(:disabled):hover {
    background: color-mix(in oklch, var(--instr) 22%, transparent);
  }
  .choice[data-state="expected"] {
    border-color: var(--success);
  }
  .choice[data-state="answered"] {
    border-color: var(--destructive);
    border-style: dashed;
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
  .phrase-note {
    display: grid;
    justify-items: center;
    min-width: 3.2rem;
    padding: 0.4rem 0.6rem;
    border-radius: 0.8rem;
    background: var(--deg);
    color: oklch(0.2 0.04 287);
  }
  .written-note {
    display: grid;
    justify-items: center;
    min-width: 3.2rem;
    min-height: 3.2rem;
    padding: 0.4rem 0.6rem;
    border-radius: 0.8rem;
    border: 2px solid transparent;
    background: var(--deg);
    color: oklch(0.2 0.04 287);
  }
  .written-note:not(:disabled):hover {
    filter: brightness(1.1);
  }
  .written-note[data-state="expected"] {
    border-color: var(--success);
  }
  .written-note[data-state="answered"] {
    border-color: var(--destructive);
    border-style: dashed;
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

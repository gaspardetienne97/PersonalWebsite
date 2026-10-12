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
    EAR_DEFAULT_CONFIG,
    EAR_DRILLS,
    EAR_INTERVALS,
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
  import { rng } from "@repo/music-core/content/random";
  import { intervalBySemitones } from "@repo/music-core/theory/intervals";
  import {
    classifyChord,
    gradeChoice,
    gradeChordQualityPlayback,
    gradeIntervalPlayback,
    gradeMelodyDictation,
    gradeScaleDegree,
  } from "@repo/music-core/scoring/ear";
  import type { Graded } from "@repo/music-core/scoring/grade";
  import { skillSummaries } from "@repo/music-core/progress/analytics";
  import { decayMastery, isDueForReview } from "@repo/music-core/progress/mastery";
  import type { Score, ScoringEvent } from "@repo/music-core";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "$lib/music/components/DrillShell.svelte";
  import Piano from "$lib/music/components/Piano.svelte";
  import Choice from "$lib/music/components/Choice.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { type RunSummary } from "$lib/music/components/Results.svelte";
  import { Flashes, type CellMarks } from "$lib/music/components/feedback.svelte";
  import { btn, btnPrimary, btnStage } from "$lib/music/components/ui";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { assistanceFor, capture, pct, runInstrument, runSource, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { audio, db, getSetting, mic, putSetting } from "$lib/music/runtime";
  import DegreeWheel from "./DegreeWheel.svelte";
  import EarVisual from "./EarVisual.svelte";
  import { degreeColor } from "./degrees";
  import Picker from "$lib/music/components/Picker.svelte";
  import {
    buildSession,
    confusions,
    KIND_LABEL,
    levelDegrees,
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
  type Prompt = EarPrompt & { direction?: "ascending" | "descending" | "harmonic"; phrase?: RankedPhrase };

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
  const KIND_OF: Record<string, EarKind> = {
    intervals: "interval",
    "interval-compare": "interval-compare",
    "chord-qualities": "chord-quality",
    cadences: "cadence",
    "scale-degrees": "scale-degree",
    "melody-dictation": "melody-dictation",
  };

  const cfg = new DrillSetup(`ear-${slug}`, {
    answer: def.answerModes[0] as string,
    level: EAR_DEFAULT_CONFIG.scaleDegreeSet as string,
    labels: EAR_DEFAULT_CONFIG.scaleDegreeLabelMode as string,
    drill: "all" as string,
    // Intervals drill: which intervals (comma list, empty for the twelve) and which way.
    intervals: "M3,P5,P8" as string,
    qualities: "major,minor" as string,
    cadences: "authentic,plagal" as string,
    direction: "auto" as string,
    root: "random" as string,
  });
  const s = $derived(cfg.value);
  const answer = $derived<AnswerMode>(modes.includes(s.answer as AnswerMode) ? (s.answer as AnswerMode) : modes[0]);
  const labels = $derived<LabelMode>(s.labels === "solfege" ? "solfege" : "degree");
  const level = $derived(SCALE_DEGREE_LEVELS.some((l) => l.id === s.level) ? s.level : "anchor");
  const kinds = $derived.by((): EarKind[] => {
    if (slug !== "mixed") return KIND_OF[slug] ? [KIND_OF[slug]] : [];
    if (answer === "voice") return ["scale-degree"];
    const all: EarKind[] = ["interval", "chord-quality", "scale-degree", "cadence"];
    const picked = all.includes(s.drill as EarKind) ? [s.drill as EarKind] : all;
    // Cadences have no play-back answer.
    return answer === "play-back" ? picked.filter((k) => k !== "cadence") : picked;
  });

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
    key: "intervals" | "qualities" | "cadences";
    title: string;
    /** "intervals", and one of them: "interval". */
    unit: string;
    one: string;
    /** How the next item is offered: "the perfect 4th", "diminished chords". */
    phrase: (name: string) => string;
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
          phrase: (name) => `the ${name.toLowerCase()}`,
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
            phrase: (name) => `${name.toLowerCase()} chords`,
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
              phrase: (name) => `${name.toLowerCase()} cadences`,
              items: CADENCES.map((c) => ({ token: c.token, short: c.romanProgression.join("-"), name: c.label })),
              fallback: CADENCES.map((c) => c.token),
              sets: [
                { label: "Authentic and plagal", tokens: ["authentic", "plagal"] },
                { label: "Ending or pausing", tokens: ["authentic", "half"] },
                { label: "All four", tokens: CADENCES.map((c) => c.token) },
              ],
              ladder: ["authentic", "plagal", "half", "deceptive"],
            }
          : null;
  const itemName = (t: string) => SETS?.items.find((i) => i.token === t)?.name ?? t;
  const picked = $derived.by(() => {
    if (!SETS) return [];
    const listed = s[SETS.key].split(",").filter((t) => SETS.items.some((i) => i.token === t));
    return listed.length ? SETS.items.map((i) => i.token).filter((t) => listed.includes(t)) : SETS.fallback;
  });
  function setItems(tokens: string[]) {
    if (SETS) cfg.set({ [SETS.key]: SETS.items.map((i) => i.token).filter((t) => tokens.includes(t)).join(",") });
  }
  function toggleItem(t: string) {
    const on = picked.includes(t);
    if (on && picked.length === 1) return; // keep at least one
    setItems(on ? picked.filter((x) => x !== t) : [...picked, t]);
  }
  const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

  const ROOTS = [{ value: "random", label: "Random" }, ...Array.from({ length: 24 }, (_, i) => ({ value: String(48 + i), label: noteName(48 + i, "flat") }))];
  const DIRECTIONS = [
    { value: "auto", label: "Mixed" },
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
  const focus = $derived(
    SETS
      ? {
          tokens: picked,
          direction: slug === "intervals" && s.direction !== "auto" ? (s.direction as "ascending" | "descending" | "harmonic") : undefined,
          root: slug === "intervals" && s.root !== "random" ? Number(s.root) : undefined,
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
      const shift = Number(/(-?\d+)$/.exec(p.id)?.[1] ?? 0);
      return c ? c.playback.map((e) => ({ midi: e.midiNotes.map((m) => m + shift), time: e.offsetSeconds, duration: e.durationSeconds })) : null;
    }
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
    mistake = {
      token,
      chosen: { ...p, id: `${p.id}-chose-${token}`, answer: token, playback: chosen },
      both: { ...p, id: `${p.id}-vs-${token}`, playback: [...p.playback, ...chosen.map((e) => ({ ...e, time: e.time + after }))] },
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
  let songCount = $state<number | null>(slug === "repertoire-transfer" ? null : 0);
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
  if (slug === "repertoire-transfer") void loadSongs();

  // ---------------------------------------------------------------------------
  // Prompt helpers

  const tonicOf = (p: Prompt) => p.playback[0].midi[0];
  const keyLine = (p: Prompt) => {
    if (p.drill === "cadence") {
      const shift = Number(/(-?\d+)$/.exec(p.id)?.[1] ?? 0);
      return `Key of ${noteName(48 + shift, "flat", false)} major`;
    }
    if (p.drill === "scale-degree" || p.drill === "melody-dictation" || p.drill === "repertoire-transfer")
      return `Tonic ${noteName(tonicOf(p), "flat", false)}${p.phrase ? `, from ${p.phrase.title}` : ""}`;
    return p.drill === "interval" ? "Two notes" : p.drill === "interval-compare" ? "Two intervals, one after the other" : "One chord";
  };
  const ask = (p: Prompt) =>
    p.drill === "interval"
      ? "What interval was that?"
      : p.drill === "interval-compare"
        ? "Which interval was bigger?"
      : p.drill === "chord-quality"
        ? "What quality is the chord?"
        : p.drill === "cadence"
          ? "Which cadence ends the phrase?"
          : p.drill === "scale-degree"
            ? answer === "voice"
              ? "Sing the second note back."
              : isPlayback
                ? "Play the second note back."
                : "Which degree was the second note?"
            : "Play the phrase back in order.";

  function notesOf(p: Prompt) {
    return p.playback.flatMap((ev) => ev.midi.map((m) => ({ midi: m, time: ev.time, duration: ev.duration })));
  }

  let playToken = 0;
  function playPrompt(p: Prompt, opts: { light?: boolean; onend?: () => void } = {}) {
    seq?.stop();
    const token = ++playToken;
    const notes = notesOf(p);
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
          sounding = p.playback.findIndex((ev) => Math.abs(ev.time - t) < 1e-6);
          if (!opts.light) return;
          lit = notes.filter((n) => n.time === t).map((n) => n.midi);
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
    playPrompt(p, { light: true, onend: () => (demoPlaying = false) });
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

  function makeSession(): Prompt[] {
    if (slug === "repertoire-transfer") return planPhrases.slice(0, 10).map((ph) => ({ ...repertoirePrompt(ph), phrase: ph }));
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
            setupKey: `${slug}|${answer}|${def.usesScaleDegreeLevel ? level : "-"}|${slug === "mixed" ? kinds.join(",") : "-"}`,
            skillIds: entry.skillIds,
            capabilities: ["ear"],
            modality,
            assistance: runAssistance,
            difficulty: prompts.reduce((a, p) => a + p.difficulty, 0) / prompts.length,
            instrument: answer === "voice" ? "voice" : undefined,
            params: { answer, level, labels, drill: s.drill },
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
    hinted = false;
    mistake = null;
    flashes.clear();
    step = "playing";
    openAt = Infinity;
    promptAt = 0;
    const p = prompts[i];
    status = `Question ${i + 1} of ${prompts.length}. Listen.`;
    replay(p, true);
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
      const tonic = tonicOf(p);
      const g = gradeScaleDegree(tonic, (p.expectedMidi?.[0] ?? tonic) - tonic, { midi: e.midi, cents: e.cents });
      void commit(g, SCALE_DEGREES[pc(e.midi - tonic)].label, e.midi, [e]);
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
      const g = gradeIntervalPlayback({ semitones: semis, direction: p.direction ?? "ascending" }, played);
      const d = Math.abs(g.playedSemitones ?? 0);
      const heard = (intervalBySemitones(d)?.token ?? `${d} semitones`) + (p.direction !== "harmonic" && (g.playedSemitones ?? 0) * (p.direction === "descending" ? -1 : 1) < 0 ? " (wrong way)" : "");
      void commit(g, heard, played.slice(0, 2), notes, [{ kind: "choice", expected: p.answer, actual: heard }]);
    } else if (p.drill === "chord-quality") {
      clearTimeout(chordTimer);
      if (new Set(played.map(pc)).size >= (p.expectedMidi?.length ?? 3)) chordTimer = setTimeout(() => submitChord(), 350);
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
    const g = gradeChordQualityPlayback(p.answer, played);
    const heard = g.detected ?? classifyChord(played)?.token ?? "another chord";
    const notes = cap?.notes.filter((n) => n.kind === "noteon" && n.at >= openAt) ?? [];
    void commit(g, heard, played, notes, [{ kind: "choice", expected: p.answer, actual: heard }]);
  }

  function choose(token: string) {
    if (phase !== "running" || (step !== "answer" && step !== "playing")) return;
    void commit(gradeChoice(current.answer, token), token, token, []);
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
    if (mode === "practice") {
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
    next();
  }

  function useHint() {
    hinted = true;
    status = `Hint: listen for ${tokenLabel(current.drill, current.answer, labels)}. This answer now counts as hinted.`;
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
      rows: itemRows(done) ?? byKind.map((k) => ({ label: KIND_LABEL[k.kind as EarKind] ?? "Repertoire phrases", value: k.total ? k.correct / k.total : 0, text: `${k.correct} of ${k.total}` })),
      routine: page.url.searchParams.get("routine") ? { label: "Back to today's plan", href: "/music" } : undefined,
    };
    status = summary.headline;
    if ((SETS || levelSteps) && answer !== "listen" && !pocket) void checkUnlock(done);
  }

  /** One results row per answer asked (an interval, a quality, a degree): this run and overall. */
  function itemRows(done: AnswerRecord[]) {
    if (kinds.length !== 1 || slug === "repertoire-transfer" || kinds[0] === "melody-dictation") return null;
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
  // the next step: one more item in a set, or the next degree level.
  const RECENT_KEY = `music.ear-${slug}.recent`;
  const LEVEL_LADDER = ["anchor", "major-pentachord", "major-diatonic", "minor-diatonic", "chromatic-color"];
  const levelSteps = def.usesScaleDegreeLevel && slug !== "mixed" && slug !== "repertoire-transfer";
  let offer = $state<{ region: string; text: string; button: string; apply: () => void } | null>(null);
  async function checkUnlock(done: AnswerRecord[]) {
    const set = SETS ? picked.join(",") : `level:${level}`;
    const saved = await getSetting<{ set: string; results: boolean[] }>(RECENT_KEY, { set, results: [] });
    const results = [...(saved.set === set ? saved.results : []), ...done.map((r) => r.correct)].slice(-20);
    await putSetting(RECENT_KEY, { set, results });
    const easy = results.length >= 20 && results.filter(Boolean).length / results.length >= 0.9;
    offer = null;
    if (!easy) return;
    if (SETS) {
      const next = SETS.ladder.find((t) => !picked.includes(t));
      if (!next) return;
      const phrase = SETS.phrase(itemName(next));
      offer = {
        region: `Ready for the next ${SETS.one}`,
        text: `Ready for ${phrase}?`,
        button: `Add ${phrase}`,
        apply: () => {
          const all = [...picked, next];
          setItems(all);
          status = `Added ${phrase}. ${all.length} ${SETS.unit} now.`;
        },
      };
    } else {
      const next = SCALE_DEGREE_LEVELS.find((l) => l.id === LEVEL_LADDER[LEVEL_LADDER.indexOf(level) + 1]);
      if (!next) return;
      offer = {
        region: "Ready for the next level",
        text: `Ready for the next level, ${next.title}? ${next.summary}`,
        button: `Move up to ${next.title}`,
        apply: () => {
          cfg.set({ level: next.id });
          status = `Moved up to ${next.title}: ${levelDegrees(next.id).join(", ")}.`;
        },
      };
    }
  }

  function stop() {
    teardown();
    phase = "ready";
    status = answer === "listen-along" ? "Stopped." : `Stopped after ${records.filter(Boolean).length} answers. Answers already given are saved.`;
  }

  function retry() {
    const r = retryPrompts(lastEvents, slug === "mixed" ? kinds : [KIND_OF[slug] ?? "scale-degree"], rand);
    if (!r.length) return;
    queued = r;
    phase = "running";
    void start({ mode, downbeat: performance.now(), beatMs: 0, bpm: 0, stopClock() {} });
  }
  let lastEvents = $state.raw<ScoringEvent[]>([]);
  const retryCount = $derived(phase === "results" ? retryPrompts(lastEvents, slug === "mixed" ? kinds : [KIND_OF[slug] ?? "scale-degree"], rand).length : 0);

  onDestroy(() => {
    teardown();
    stopWarmup();
  });

  // ---------------------------------------------------------------------------
  // Surfaces

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
  const summaryLine = $derived(
    [
      MODE_LABEL[answer],
      slug === "mixed" ? (kinds.length === 4 ? "all four drills" : kinds.map((k) => KIND_LABEL[k].toLowerCase()).join(", ")) : null,
      SETS
        ? `${SETS.sets.find((x) => sameSet(x.tokens, picked))?.label.toLowerCase() ?? picked.map((t) => SETS.items.find((i) => i.token === t)?.short ?? t).join(" ")}${slug === "intervals" && s.direction !== "auto" ? `, ${DIRECTIONS.find((d) => d.value === s.direction)?.label.toLowerCase()}` : ""}`
        : null,
      def.usesScaleDegreeLevel ? SCALE_DEGREE_LEVELS.find((l) => l.id === level)?.title : null,
      def.usesLabels ? (labels === "solfege" ? "solfège labels" : "degree labels") : null,
      "10 prompts",
    ]
      .filter(Boolean)
      .join(", "),
  );
  const blocked = $derived(
    slug === "repertoire-transfer" && songCount !== null && planPhrases.length === 0
      ? "Save a song with a score first."
      : answer === "voice" && mic.state === "denied"
        ? "Allow the microphone to sing answers."
        : null,
  );
  const vocalDegree = $derived(current && mic.pitch ? SCALE_DEGREES[pc(mic.pitch.midi - tonicOf(current))].label : null);
</script>

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
  {demoPlaying}
  onstart={start}
  onstop={stop}
  {blocked}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2">
      {#if modes.length > 1}
        <Choice label="Answer by" options={modes.map((m) => ({ value: m, label: MODE_LABEL[m] }))} value={answer} onchange={(v) => cfg.set({ answer: v })} />
      {/if}
      {#if slug === "mixed" && answer !== "voice"}
        <Choice
          label="Drills in the mix"
          select
          options={[{ value: "all", label: "All four" }, ...(["interval", "chord-quality", "scale-degree", "cadence"] as const).map((k) => ({ value: k, label: KIND_LABEL[k] }))]}
          value={s.drill}
          onchange={(v) => cfg.set({ drill: v })}
        />
      {/if}
      {#if SETS}
        <div class="flex min-w-0 flex-col gap-2 text-sm sm:col-span-2" role="group" aria-labelledby="items-label">
          <span id="items-label" class="font-medium">{SETS.title}</span>
          <div class="flex flex-wrap gap-1.5" role="group" aria-label="{SETS.one.replace(/^./, (c) => c.toUpperCase())} sets">
            {#each SETS.sets as set (set.label)}
              {@const on = sameSet(set.tokens, picked)}
              <button type="button" class="min-h-10 rounded-full border px-3 text-sm {on ? 'border-instr bg-instr-wash font-semibold' : 'border-ws-line hover:bg-ws-raised'}" aria-pressed={on} onclick={() => setItems(set.tokens)}>{set.label}</button>
            {/each}
          </div>
          <div class="flex flex-wrap gap-1.5">
            {#each SETS.items as it (it.token)}
              {@const on = picked.includes(it.token)}
              <button
                type="button"
                class="flex min-h-11 flex-col items-start justify-center rounded-lg border px-3 py-1 text-left {on ? 'border-transparent bg-instr text-ws-stage' : 'border-ws-line bg-ws-surface text-ws-soft hover:bg-ws-raised'}"
                aria-pressed={on}
                aria-label={it.name}
                onclick={() => toggleItem(it.token)}
              >
                <span class="font-semibold leading-tight">{it.short}</span>
                <span class="text-xs leading-tight">{it.name}</span>
              </button>
            {/each}
          </div>
          <span class="text-ws-soft">{picked.length === 1 ? `One picked: every prompt is this one, among all the answers.` : `${picked.length} ${SETS.unit}: only these play, and only these are the answers.`}</span>
        </div>
      {/if}
      {#if slug === "intervals"}
        <Choice label="Direction" options={DIRECTIONS} value={s.direction} onchange={(v) => cfg.set({ direction: v })} />
        <div class="flex min-w-0 flex-col gap-1 text-sm">
          <span class="font-medium">Starting note</span>
          <Picker label="Starting note" value={s.root} options={ROOTS} onchange={(v) => cfg.set({ root: v })} />
          <span class="text-ws-soft">{s.root === "random" ? "A new first note each time." : "Every interval starts on this note, so only the distance changes."}</span>
        </div>
      {/if}
      {#if def.usesScaleDegreeLevel}
        <Choice label="Degree level" select options={SCALE_DEGREE_LEVELS.map((l) => ({ value: l.id, label: `${l.title}: ${l.summary}` }))} value={level} onchange={(v) => cfg.set({ level: v })} />
      {/if}
      {#if def.usesLabels}
        <Choice label="Labels" options={[{ value: "degree", label: "Degree (3 / mi)" }, { value: "solfege", label: "Solfège (mi)" }]} value={labels} onchange={(v) => cfg.set({ labels: v })} />
      {/if}
    </div>
    <p class="mt-3 text-sm text-ws-soft">
      {#if answer === "listen"}Pocket recall: think or sing, reveal, then rate yourself. Self-rated answers are saved but never move mastery.
      {:else if answer === "listen-along"}Listen along: the answers are shown and the prompts move on by themselves. Nothing is scored.
      {:else if answer === "voice"}Sing it: the microphone starts when you press Start and stops at the end. Headphones keep the prompt out of the mic.
      {:else}Practice gives feedback after each answer and waits for Continue. Check gives none and moves on.{/if}
    </p>
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
        data-step={step}
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-sm text-ws-stage-soft">{keyLine(p)}</p>
            <p class="font-display text-xl font-semibold sm:text-2xl">{ask(p)}</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" class={btnStage} onclick={() => replay()} disabled={step === "feedback" && mode === "check"}>Hear it again</button>
            {#if mode === "practice" && answer !== "listen" && answer !== "listen-along" && step !== "feedback" && !hinted}
              <button type="button" class={btnStage} onclick={useHint}>Hint</button>
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
            <Piano low={48} high={84} marks={pianoMarks} interactive={false} label="Piano, lit as the prompt sounds" />
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
          <div class="grid grid-cols-[minmax(0,1fr)] items-center gap-4 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
            <!-- The wheel lights the degree you are singing, relative to this prompt's tonic. -->
            <DegreeWheel
              available={levelDegrees(level)}
              {labels}
              center={noteName(tonicOf(p), "flat", false)}
              lit={step === "answer" ? vocalDegree : null}
              expected={showAnswer ? p.answer : null}
              answered={showAnswer && rec && !rec.correct ? (rec.answered ?? null) : null}
            />
            <div class="voice rounded-2xl p-4" aria-label="Microphone">
              <p class="text-sm text-ws-stage-soft">
                {step === "playing" ? "Listen first. The mic opens when the prompt ends." : step === "answer" ? "Sing now. Hold the note until it locks." : "Got it."}
              </p>
              <div class="meter mt-2" aria-hidden="true"><span style:width="{Math.max(0, Math.min(100, ((mic.level + 60) / 60) * 100))}%"></span></div>
              <p class="mt-2 font-display text-2xl font-semibold tnum">
                {#if mic.pitch && vocalDegree}{noteName(mic.pitch.midi, "flat")}, {tokenLabel("scale-degree", vocalDegree, labels)}{:else}No pitch yet{/if}
              </p>
              {#if mic.advice}<p class="text-sm text-ws-stage-soft">{mic.advice.label}</p>{/if}
            </div>
          </div>
        {:else}
          <Piano low={48} high={84} marks={pianoMarks} {flashes} names={mode === "check" ? "none" : "c"} label="Piano keyboard, play your answer" />
          <div class="mt-2 flex flex-wrap items-center gap-3 text-sm text-ws-stage-soft">
            <span>You played: {played.length ? played.map((m) => noteName(m, "flat")).join(", ") : "nothing yet"}</span>
            {#if step === "answer" && played.length}
              <button type="button" class={btnStage} onclick={() => (played = [])}>Clear</button>
              {#if p.drill === "chord-quality"}<button type="button" class={btnStage} onclick={submitChord}>That's my chord</button>{/if}
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
                <Picker class="min-w-24" tone="stage" label="Tonic" value={String(droneTonic)} options={Array.from({ length: 12 }, (_, i) => ({ value: String(48 + i), label: noteName(48 + i, "flat", false) }))} onchange={(v) => { droneTonic = Number(v); if (droneOn) { audio.drone.stop(); audio.drone.start(droneTonic, "sine", 0.3); } }} />
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
          <Piano low={48} high={84} marks={pianoMarks} interactive={isPlayback} names="c" label="Piano, lit as the demo sounds" />
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
      {#if offer}
        {@const o = offer}
        <section class="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-instr bg-instr-wash p-4" aria-label={o.region}>
          <p class="min-w-0 flex-1 basis-60"><strong>This is sounding easy:</strong> at least 18 of your last 20 answers were right. {o.text}</p>
          <button type="button" class={btnPrimary} onclick={() => { o.apply(); offer = null; }}>{o.button}</button>
          <button type="button" class={btn} onclick={() => (offer = null)}>Not yet</button>
        </section>
      {/if}
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

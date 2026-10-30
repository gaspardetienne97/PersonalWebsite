<script lang="ts">
  import { onDestroy } from "svelte";
  import type { NoteEvent } from "@repo/music-core";
  import { noteName, pc } from "@repo/music-core";
  import { SCALE_GROUPS } from "@repo/music-core/theory/scales";
  import { conceptCard, hasThumbUnder } from "@repo/music-core/lessons/cards";
  import {
    ABRSM_SPEEDS,
    CHORD_KINDS,
    HANDS_APART,
    SCALE_PATTERNS,
    HANDS_TOGETHER_PRESET,
    SCALE_TEMPO,
    isScaleLine,
    gradeSpeed,
    scaleDrillTargets,
    scaleSetupKey,
    scaleSkills,
    type ChordKind,
    type DrillScaleKind,
    type HandsApart,
    type ScalePattern,
  } from "@repo/music-core/content/technique";
  import {
    gradeLine,
    ladderAfterRun,
    ladderProjection,
    mergeLadders,
    type LadderState,
    type LineResult,
  } from "@repo/music-core/scoring/technique";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "$lib/music/components/DrillShell.svelte";
  import InstrumentStage, { fitShift, fretTuning, linePositions } from "$lib/music/components/InstrumentStage.svelte";
  import LineNotation from "$lib/music/notation/LineNotation.svelte";
  import FallingKeys from "$lib/music/notation/FallingKeys.svelte";
  import { lineScore, NOTE_VIEWS } from "$lib/music/notation/falling";
  import HubTabs from "$lib/music/components/HubTabs.svelte";
  import { page } from "$app/state";
  import type { GroupState } from "$lib/music/notation/NotationFrame.svelte";
  import { signatureFor } from "@repo/music-core/theory/circle";
  import { nearMiss } from "@repo/music-core/signal/pitch";
  import { scaleFingerMap } from "@repo/music-core/content/piano-fingering";
  import Choice from "$lib/music/components/Choice.svelte";
  import KeyPicker from "$lib/music/components/KeyPicker.svelte";
  import Picker from "$lib/music/components/Picker.svelte";
  import type { SetupClause } from "$lib/music/components/DrillShell.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { type RunSummary } from "$lib/music/components/Results.svelte";
  import { Flashes, type CellMarks } from "$lib/music/components/feedback.svelte";
  import { btn } from "$lib/music/components/ui";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { assistanceFor, assistanceText, capture, pct, readKeyed, runInstrument, runSource, tuningText, writeKeyed, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { benchFromUrl, Transport } from "$lib/music/drills/piano/transport.svelte";
  import { audio, settings } from "$lib/music/runtime";
  import { nextRun, tempoAnd } from "$lib/music/advance.svelte";

  const LADDER_KEY = "technique.tempo-ladder.v1";
  const cfg = new DrillSetup("scales", {
    kind: "major" as string,
    tonic: 60,
    span: "one-octave" as string,
    motion: "up-down" as string,
    hands: "right" as string,
    preset: false as boolean,
    pattern: "scale" as string,
    chord: "major" as string,
    perBeat: 1,
    /** An ABRSM grade whose speed was picked ("" for none). */
    grade: "" as string,
    /** Both hands: an octave apart, contrary motion, a third or a sixth apart. */
    apart: "octave" as string,
    /** Arpeggios: from the root (0), the 3rd (1), the 5th (2) or the 7th (3). */
    inversion: 0,
    /** After a clean checked run, move the tonic up a fifth round the circle. */
    rotate: false as boolean,
  });
  const PATTERNS = SCALE_PATTERNS.map((p) => ({ value: p.id, label: p.label, hint: p.hint }));
  const s = $derived(cfg.value);
  const pattern = $derived((PATTERNS.some((p) => p.value === s.pattern) ? s.pattern : "scale") as ScalePattern);
  const perBeat = $derived(([1, 2, 3, 4, 6].includes(s.perBeat) ? s.perBeat : 1) as 1 | 2 | 3 | 4 | 6);
  /** Three or six a click is compound time: written in 12/8, a click to each dotted quarter. */
  const quartersPerClick = $derived(perBeat % 3 === 0 ? 1.5 : 1);
  const inst = $derived(settings.value.activeInstrument);
  const onPiano = $derived(inst === "piano");
  const scaleSetup = $derived({
    pattern,
    chord: (pattern === "triad-pairs" && s.chord !== "minor" ? "major" : s.chord) as ChordKind,
    perBeat,
    kind: s.kind as DrillScaleKind,
    tonic: s.tonic,
    apart: (HANDS_APART.some((a) => a.id === s.apart) ? s.apart : "octave") as HandsApart,
    inversion: pattern === "arpeggio" ? s.inversion : 0,
    span: (!isScaleLine(pattern) && s.span === "pentascale" ? "one-octave" : s.span) as "pentascale" | "one-octave" | "two-octave",
    motion: s.motion as "up" | "down" | "up-down",
    // One line off the piano: hands are a keyboard idea.
    hands: (onPiano ? s.hands : "right") as "right" | "left" | "both",
    bpm: bpm(),
    minEvenness: s.preset && onPiano ? HANDS_TOGETHER_PRESET.minEvenness : undefined,
  });
  // Up an octave when the instrument can't reach the line's low notes (ukulele, Aerophone).
  const steps = $derived.by(() => {
    const raw = scaleDrillTargets(scaleSetup);
    const shift = fitShift(raw.flatMap((st) => st.notes.map((n) => n.midi)), inst);
    return shift ? raw.map((st) => ({ ...st, notes: st.notes.map((n) => ({ ...n, midi: n.midi + shift })) })) : raw;
  });
  const key = $derived(scaleSetupKey(scaleSetup));
  // Cards for a scale line, shown the first time Check is chosen: the formula (major, minor), and on the piano where the thumb passes under.
  const cards = $derived(
    !isScaleLine(pattern)
      ? []
      : [
          ...(s.kind === "major" ? ["scales.major-formula"] : ["natural-minor", "harmonic-minor", "melodic-minor"].includes(s.kind) ? ["scales.minor-forms"] : []),
          ...(onPiano && scaleSetup.span !== "pentascale" && hasThumbUnder(s.kind) ? ["scales.thumb-under"] : []),
        ],
  );

  function bpm() {
    return Math.min(SCALE_TEMPO.max, Math.max(SCALE_TEMPO.min, settings.value.bpm));
  }
  /** One note's time: the click divided by the notes to a click. */
  const stepMs = () => 60000 / bpm() / perBeat;
  const target = $derived(s.grade ? gradeSpeed(s.grade, pattern) : undefined);
  const PER = { 1: "one note a click", 2: "two notes a click", 3: "three notes a click", 4: "four notes a click", 6: "six notes a click" } as const;
  const PER_NAME: Record<number, string> = { 1: "quarters", 2: "eighths", 3: "triplets", 4: "sixteenths", 6: "sextuplets" };
  /** One menu for the setups that set tempo and notes a click together: the hands-together preset, a plain start, or an ABRSM grade's speed. */
  function pickPreset(v: string) {
    if (v === "together") {
      cfg.set({ pattern: "scale", perBeat: 1, grade: "", span: HANDS_TOGETHER_PRESET.span, motion: HANDS_TOGETHER_PRESET.motion, hands: HANDS_TOGETHER_PRESET.hands, preset: true });
      settings.update({ bpm: HANDS_TOGETHER_PRESET.bpm });
    } else if (v === "plain") cfg.set({ perBeat: 1, grade: "", preset: false });
    else {
      const sp = gradeSpeed(v, pattern);
      cfg.set({ grade: v, ...(sp ? { perBeat: sp[1] } : {}), preset: false });
      if (sp) settings.update({ bpm: sp[0] });
    }
  }
  const presetOptions = $derived([
    ...(onPiano ? [{ value: "together", label: "Hands together, one octave, up, 80" }] : []),
    { value: "plain", label: "One note a click, no grade target" },
    ...ABRSM_SPEEDS.map((g) => {
      const sp = gradeSpeed(g.grade, pattern);
      return { value: g.grade, label: sp ? `${g.grade}: ${sp[0]}, ${PER[sp[1]]}` : `${g.grade} (no speed for blocked chords)`, group: "ABRSM grade speeds", disabled: !sp };
    }),
  ]);

  // Keyboard spans the line, snapped out to whole octaves from C.
  const all = $derived(steps.flatMap((st) => st.notes.map((n) => n.midi)));
  const low = $derived(Math.floor((Math.min(...all) - 2) / 12) * 12);
  const high = $derived(Math.ceil((Math.max(...all) + 2) / 12) * 12);
  // Falling notes run on their own beat clock, in quarters, from the run's downbeat or the demo's start.
  const falling = $derived(onPiano && page.url.searchParams.get("view") === "falling");
  const clock = new Transport();
  const quarterMs = () => 60000 / bpm() / quartersPerClick;

  let phase = $state<Phase>("ready");
  // Path links carry the tempo (and Check): apply them once.
  let mode = $state<DrillMode>(benchFromUrl(SCALE_TEMPO));
  let status = $state("");
  let stepIndex = $state(0);
  let demoStep = $state<number | null>(null);
  let demo: { stop(): void; playing: boolean } | null = $state(null);
  let summary = $state<RunSummary | null>(null);
  let result = $state<LineResult | null>(null);
  let ladders = $state<Record<string, LadderState>>({});
  const flashes = new Flashes();
  let cap: Capture | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let run: ReturnType<typeof practice.beginRun> | null = null;

  void readKeyed<LadderState>(LADDER_KEY).then((l) => (ladders = l));

  // Piano scales carry the standard fingering for each hand, on the keys and the staff.
  const fingerOf = $derived.by(() => {
    const out = new Map<string, number>();
    if (!onPiano || pattern !== "scale") return out;
    for (const hand of ["right", "left"] as const) {
      const ms = steps.flatMap((st) => st.notes.filter((n) => n.hand === hand).map((n) => n.midi));
      if (!ms.length) continue;
      // From the tonic at or below the hand's lowest note: a hand a third or a sixth off the tonic keeps the scale's fingering.
      const lo = Math.min(...ms) - pc(Math.min(...ms) - s.tonic);
      const span = (Math.max(...ms) - lo) / 12;
      const map = scaleFingerMap(s.kind, lo, hand === "right" ? "rh" : "lh", scaleSetup.span === "pentascale" ? "pentascale" : Math.max(1, Number.isInteger(span) ? span : Math.ceil(span)));
      map?.forEach((f, m) => out.set(`${hand}:${m}`, f));
    }
    return out;
  });
  const fingerFor = (n: { midi: number; hand: "left" | "right" }) => fingerOf.get(`${n.hand}:${n.midi}`);
  /** The key's label: its finger, else L or R when both hands play. */
  const keyLabel = (n: { midi: number; hand: "left" | "right" }) => fingerFor(n)?.toString() ?? (scaleSetup.hands === "both" ? (n.hand === "left" ? "L" : "R") : undefined);

  const marks = $derived.by(() => {
    const out: Record<number, CellMarks> = {};
    const both = scaleSetup.hands === "both";
    // Before a run: every note of the line at once, by hand when both play.
    if (demoStep === null && phase === "ready" && mode === "practice") {
      for (const st of steps)
        for (const n of st.notes) {
          const prev = out[n.midi];
          const mine = keyLabel(n);
          // A key both hands play (the middle octave of two): both fingers, left then right.
          out[n.midi] =
            both && prev && prev.role !== n.hand && prev.label && mine && !prev.label.includes("/")
              ? { target: true, label: n.hand === "left" ? `${mine}/${prev.label}` : `${prev.label}/${mine}` }
              : { target: true, label: mine, role: both ? n.hand : "scale" };
        }
      return out;
    }
    const show = demoStep ?? (mode === "practice" && phase !== "results" ? stepIndex : null);
    if (show === null || !steps[show]) return out;
    for (const n of steps[show].notes)
      out[n.midi] = demoStep !== null ? { demo: true, label: fingerFor(n)?.toString() } : { target: true, label: keyLabel(n), role: scaleSetup.hands === "both" ? n.hand : undefined };
    return out;
  });

  const scaleLabel = (k: string) => k.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
  const chordLabel = $derived(CHORD_KINDS.find((c) => c.id === s.chord)?.label.toLowerCase() ?? "major");
  const tonicName = (p: number) => noteName(p, "flat", false);
  const INVERSIONS = ["root", "3rd", "5th", "7th"];
  const what = $derived(
    isScaleLine(pattern)
      ? `${tonicName(s.tonic)} ${scaleLabel(s.kind).toLowerCase()} scale${pattern === "thirds" ? " in double thirds" : pattern === "octaves" ? " in octaves" : ""}`
      : pattern === "arpeggio"
        ? `${tonicName(s.tonic)} ${chordLabel} arpeggio${scaleSetup.inversion ? ` from the ${INVERSIONS[scaleSetup.inversion]}` : ""}`
        : pattern === "triad-pairs"
          ? `${tonicName(s.tonic)} and ${tonicName(s.tonic + 2)} ${s.chord === "minor" ? "minor" : "major"} triad pairs`
          : `${tonicName(s.tonic)} ${chordLabel} ${pattern} chords`,
  );
  const apartLabel = $derived(HANDS_APART.find((a) => a.id === scaleSetup.apart)!.label.toLowerCase());
  const setupLine = $derived<SetupClause[]>([
    { text: what, focus: "kind" },
    { text: scaleSetup.span === "pentascale" ? "five notes" : scaleSetup.span.replace("-", " "), focus: "span" },
    { text: s.motion === "up-down" ? "up and down" : s.motion, focus: "motion" },
    onPiano ? { text: scaleSetup.hands === "both" ? (scaleSetup.apart === "octave" ? "hands together" : `hands together, ${apartLabel}`) : `${scaleSetup.hands} hand`, focus: "hands" } : { text: `on ${inst}` },
    ...(s.rotate ? [{ text: "round the circle of keys", focus: "rotate" }] : []),
    ...(perBeat > 1 ? [{ text: PER[perBeat], focus: "per" }] : []),
    ...(target ? [{ text: `aiming for ${s.grade} speed (${target[0]}, ${PER[target[1]]})`, focus: "preset" }] : []),
  ]);

  function stopDemo() {
    clock.stop();
    demo?.stop();
    demo = null;
    demoStep = null;
  }

  async function playDemo() {
    if (demo?.playing) return stopDemo();
    await audio.unlock();
    const beatS = stepMs() / 1000;
    const notes = steps.flatMap((st, i) => st.notes.map((n) => ({ midi: n.midi, time: i * beatS, duration: beatS * 0.9 })));
    const handle = audio.playSequence(notes, {
      onNote: (i: number) => {
        const idx = Math.floor(notes[i].time / beatS + 1e-6);
        demoStep = idx;
      },
    });
    demo = handle;
    clock.follow(handle.startPerf, quarterMs());
    status = "Listen: the whole line at tempo, lit as it sounds.";
    void handle.done.then(() => {
      if (demo === handle) stopDemo();
    });
  }

  function onNote(e: NoteEvent) {
    if (e.kind !== "noteon" || phase !== "running") return;
    const step = steps[stepIndex];
    if (!step) return;
    const expected = step.notes.map((n) => n.midi);
    if (expected.includes(e.midi)) {
      if (mode === "practice") flashes.add(e.midi, "correct");
      const hit = new Set(cap!.notes.filter((n) => n.kind === "noteon" && n.at >= stepStart).map((n) => n.midi));
      if (expected.every((m) => hit.has(m))) {
        stepIndex += 1;
        stepStart = e.at - 60;
        if (stepIndex >= steps.length) void finish();
      }
    } else {
      if (mode === "practice") flashes.add(e.midi, "wrong");
      // A quarter tone off rounds to the next note: say it is the tuning, not the playing.
      const miss = e.source === "audio" ? nearMiss(e.midi, e.cents, expected) : null;
      if (miss) {
        detuned = [...detuned, miss];
        status = tuningText(miss, e.midi, inst);
        // Practice moves on past a single out-of-tune note (it still scores as missed); Check waits.
        if (mode === "practice" && expected.length === 1) {
          stepIndex += 1;
          stepStart = e.at - 60;
          if (stepIndex >= steps.length) void finish();
        }
      }
    }
  }
  let stepStart = 0;
  /** Notes heard close to the target but out of tune, this run. */
  let detuned: { midi: number; cents: number }[] = [];

  // The line written out above the instrument (tab on guitar and ukulele, a staff otherwise), its cursor on the step.
  const frets = $derived(linePositions(inst, all));
  const written = $derived(steps.flatMap((st) => st.notes.map((n) => ({ midi: n.midi, startBeat: st.atBeat * quartersPerClick, durationBeats: quartersPerClick / perBeat, hand: onPiano ? n.hand : undefined, finger: fingerFor(n), ...frets.get(n.midi) }))));
  // A triad pair is written in the key it belongs to: a major pair is IV and V a 4th up, a minor pair ii and iii a step down.
  const signature = $derived(pattern === "triad-pairs" ? signatureFor((s.tonic + (s.chord === "minor" ? 10 : 5)) % 12, "major") : isScaleLine(pattern) ? signatureFor(s.tonic % 12, s.kind === "chromatic" ? "major" : s.kind) : s.chord === "minor" ? signatureFor(s.tonic % 12, "natural-minor") : s.chord === "major" ? signatureFor(s.tonic % 12, "major") : 0);
  const cursorClick = $derived(demoStep !== null ? (steps[demoStep]?.atBeat ?? null) : phase === "running" ? (steps[Math.min(stepIndex, steps.length - 1)]?.atBeat ?? null) : null);
  const cursor = $derived(cursorClick === null ? null : cursorClick * quartersPerClick);
  const lineStates = $derived.by(() => {
    const out: Record<number, GroupState> = {};
    if (phase !== "running") return out;
    for (let i = 0; i < Math.min(stepIndex, steps.length); i++) out[i] = "correct";
    if (stepIndex < steps.length) out[stepIndex] = "active";
    return out;
  });

  async function start(ctx: RunContext) {
    stopDemo();
    summary = null;
    result = null;
    stepIndex = 0;
    detuned = [];
    flashes.clear();
    const beatMs = ctx.beatMs;
    stepStart = ctx.downbeat - beatMs / 2;
    run = practice.beginRun({
      exerciseId: "technique.scale",
      setupKey: key,
      skillIds: scaleSkills(scaleSetup.kind, pattern),
      capabilities: ["technique"],
      modality: "played",
      assistance: assistanceFor(mode),
      difficulty: Math.min(1, (s.span === "two-octave" ? 0.6 : scaleSetup.hands === "both" ? 0.5 : 0.35) + (perBeat - 1) * 0.05 + (pattern === "scale" ? 0 : 0.05)),
      instrument: settings.value.activeInstrument,
      params: { bpm: ctx.bpm, kind: s.kind, tonic: s.tonic, span: scaleSetup.span, motion: s.motion, hands: scaleSetup.hands, pattern, chord: s.chord, perBeat, apart: scaleSetup.hands === "both" ? scaleSetup.apart : "octave", inversion: scaleSetup.inversion },
    });
    // Input is scored only after the count-in, so speakers can't bleed into the take.
    cap = capture(ctx.downbeat - beatMs / 2, (e) => e.kind === "noteon" && onNote(e));
    clock.follow(ctx.downbeat, quarterMs());
    timer = setTimeout(() => void finish(), Math.max(0, ctx.downbeat - performance.now()) + steps.length * stepMs() + 4 * beatMs);
    stopClockRef = ctx.stopClock;
  }
  let stopClockRef: (() => void) | null = null;

  async function finish() {
    if (phase !== "running" && phase !== "countin") return;
    clearTimeout(timer);
    stopClockRef?.();
    clock.stop();
    cap?.stop();
    const notes = cap?.notes ?? [];
    const r = gradeLine({
      beats: steps.map((st) => st.notes),
      beatMs: stepMs(),
      notes,
      handsTogether: scaleSetup.hands === "both",
      minEvenness: scaleSetup.minEvenness,
    });
    result = r;
    phase = "results";
    const instrument = runInstrument(notes);
    await run!.attempt({
      promptId: key,
      correct: r.correct,
      partialCredit: r.score,
      metrics: r.metrics,
      source: runSource(notes),
      instrument: instrument ?? null,
      target: steps.flatMap((st) => st.notes.map((n) => n.midi)),
      response: notes.filter((n) => n.kind === "noteon").map((n) => n.midi),
    });
    const fin = await run!.finish({ score: r.score, correct: r.correct, headline: `${pct(r.score)} at ${bpm()} BPM` });
    // The tempo ladder climbs one note a click; faster subdivisions are judged against the grade speed instead.
    const laddered = perBeat === 1;
    const before = ladders[key];
    const after = laddered ? ladderAfterRun(before, { bpm: bpm(), correct: r.correct && mode === "check" }) : before;
    if (laddered && after) ladders = await writeKeyed(LADDER_KEY, key, after, (a, b) => mergeLadders({ k: a }, { k: b }).k);
    const proj = laddered && after ? ladderProjection(after, bpm()) : null;
    const promoted = !!after && after.unlockedBpm > (before?.unlockedBpm ?? 100);
    const atSpeed = target ? bpm() * perBeat >= target[0] * target[1] : null;
    summary = {
      headline: r.correct && !laddered
        ? target
          ? atSpeed
            ? `Clean and even at ${s.grade} speed.`
            : `Clean and even at ${bpm()} BPM. ${s.grade} speed is ${target[0]} with ${PER[target[1]]}.`
          : `Clean and even at ${bpm()} BPM, ${PER[perBeat]}.`
        : r.correct && after
        ? promoted
          ? `Clean and even. ${after.unlockedBpm} BPM is unlocked.`
          : mode === "check"
            ? bpm() < after.unlockedBpm
              ? `Clean and even at ${bpm()} BPM. The ladder counts checks at ${after.unlockedBpm} BPM or faster.`
              : `Clean and even at ${bpm()} BPM. One more clean check here unlocks ${Math.min(180, after.unlockedBpm + 10)}.`
            : `Clean at ${bpm()} BPM. Try it in Check to count it.`
        : r.pitch < 0.9
          ? detuned.length
            ? `${r.clean} of ${r.total} notes right. ${[...new Set(detuned.map((d) => noteName(d.midi, "flat", false)))].join(" and ")} sounded about ${Math.round(detuned.reduce((a, d) => a + Math.abs(d.cents), 0) / detuned.length)} cents out: tune your ${inst} in Tuner, then try again.`
            : `${r.clean} of ${r.total} notes right. Slow down and let the pitch settle first.`
          : `Every note right, but the spacing wandered by ${Math.round(r.evennessErrorMs)} ms. Keep it even.`,
      metric: pct(r.score),
      metricLabel: "score",
      delta: fin.delta,
      best: fin.best,
      clean: r.correct && mode === "check",
      xp: fin.xp,
      assistance: assistanceText(mode),
      rows: [
        { label: "Notes right", value: r.pitch, text: `${r.clean} of ${r.total}` },
        { label: "Evenness", value: r.evenness, text: `${pct(r.evenness)}, ${Math.round(r.evennessErrorMs)} ms off` },
        ...(pattern === "blocked"
          ? [
              r.chordTogether
                ? { label: "Chord notes together (40 ms)", value: r.chordTogether.chords ? r.chordTogether.count / r.chordTogether.chords : 0, text: `${r.chordTogether.count} of ${r.chordTogether.chords}, ${Math.round(r.chordTogether.meanSpreadMs)} ms apart on average` }
                : { label: "Chord notes together", notMeasured: true },
            ]
          : []),
        ...(target ? [{ label: `${s.grade} speed (ABRSM, ${target[0]} with ${PER[target[1]]})`, value: atSpeed ? 1 : (bpm() * perBeat) / (target[0] * target[1]), text: atSpeed ? "reached" : `${Math.round(((bpm() * perBeat) / (target[0] * target[1])) * 100)}% of it` }] : []),
        ...(scaleSetup.hands === "both"
          ? [
              r.together
                ? { label: "Hands together (40 ms)", value: r.together.beats ? r.together.count / r.together.beats : 0, text: `${r.together.count} of ${r.together.beats} beats` }
                : { label: "Hands together", notMeasured: true },
            ]
          : []),
      ],
      advance: notes.some((n) => n.kind === "noteon") ? await advanceAfter(r.score, r.correct) : undefined,
      ladder: proj?.rungs.map((rg) => ({ bpm: rg.bpm, state: rg.status === "next" ? ("next" as const) : rg.status })),
    };
    // Round the circle: a clean check moves on to the key a fifth up.
    if (s.rotate && r.correct && mode === "check") {
      const next = 60 + pc(s.tonic + 7);
      cfg.set({ tonic: next });
      summary.rows = [...(summary.rows ?? []), { label: "Next key", text: `${tonicName(next)}, a fifth up` }];
    }
    status = summary.headline;
  }

  /** Notes a click as steps; goals are the fastest ABRSM speed for two and four (blocked chords have none). */
  function advanceAfter(score: number, correct: boolean) {
    const col = (n: 2 | 4) => Math.max(...ABRSM_SPEEDS.map((g) => (isScaleLine(pattern) ? g.scale : g.arpeggio)).filter((x) => x[1] === n).map((x) => x[0]));
    const goals = pattern === "blocked" ? [120, 100, 80] : [120, col(2), col(4)];
    const steps = ([1, 2, 4] as const).map((n, i) => ({ label: PER[n].replace(/^./, (c) => c.toUpperCase()), goal: goals[i] }));
    const id = `scales.${pattern}.${isScaleLine(pattern) ? s.kind : s.chord}.${scaleSetup.span}.${s.motion}.${scaleSetup.hands}${scaleSetup.hands === "both" && scaleSetup.apart !== "octave" ? `-${scaleSetup.apart}` : ""}.${s.tonic}`;
    // Three or six a click sits outside the ABRSM ladder: the next run moves the tempo only.
    const laddered = ([1, 2, 4] as number[]).includes(perBeat);
    return nextRun(id, { bpm: bpm(), tempo: { min: SCALE_TEMPO.min, goal: 120, max: SCALE_TEMPO.max }, ...(laddered ? { steps, step: [1, 2, 4].indexOf(perBeat) } : {}) }, { score, correct }, tempoAnd((i) => cfg.set({ perBeat: [1, 2, 4][i], preset: false })));
  }

  function stop() {
    clearTimeout(timer);
    clock.stop();
    cap?.stop();
    phase = "ready";
    status = "Stopped. Nothing was recorded.";
  }

  function retempo(delta: number) {
    settings.update({ bpm: Math.min(SCALE_TEMPO.max, Math.max(SCALE_TEMPO.min, bpm() + delta)) });
    phase = "ready";
    summary = null;
  }

  onDestroy(() => {
    clearTimeout(timer);
    cap?.stop();
    stopDemo();
  });

  const scaleOptions = [
    ...SCALE_GROUPS.modes.map((k) => ({ value: k as string, label: scaleLabel(k), group: "Modes" })),
    { value: "chromatic", label: "Chromatic", group: "Modes" },
    ...SCALE_GROUPS.jazz.map((k) => ({ value: k as string, label: scaleLabel(k), group: "Jazz" })),
  ];
</script>

<svelte:head><title>Scales | Woodshed</title></svelte:head>

<DrillShell
  lesson={cards.length ? { lessons: cards.flatMap((c) => conceptCard(c)), trigger: "check" } : null}
  title="Scales"
  hue="piano"
  blurb="Scales, arpeggios and chords through their inversions, evenly at the click. Clean checks climb the tempo ladder, or aim for an ABRSM grade's speed."
  summary={setupLine}
  bind:phase
  bind:mode
  bind:status
  progress={steps.length ? stepIndex / steps.length : 0}
  clock={{ bpm: bpm(), beatsPerBar: 4 }}
  ondemo={playDemo}
  demoPlaying={!!demo?.playing}
  onstart={start}
  onstop={stop}
>
  {#snippet actions()}
    {#if onPiano && (mode === "practice" || phase === "results")}<div class="ml-auto"><HubTabs param="view" tabs={NOTE_VIEWS} label="Notes view" /></div>{/if}
  {/snippet}

  {#snippet setup()}
    <div class="flex flex-col gap-5">
      <fieldset class="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <legend class="mb-2 text-xs font-semibold uppercase tracking-wide text-ws-soft">What</legend>
        <Choice label="Play" options={PATTERNS} value={pattern} onchange={(v) => cfg.set({ pattern: v, preset: false })} />
        {#if isScaleLine(pattern)}
          <Choice label="Scale" setupKey="kind" options={scaleOptions} value={s.kind} onchange={(v) => cfg.set({ kind: v, preset: false })} />
        {:else}
          <Choice label="Chord" setupKey="kind" options={CHORD_KINDS.filter((c) => pattern !== "triad-pairs" || c.id === "major" || c.id === "minor").map((c) => ({ value: c.id as string, label: c.label }))} value={scaleSetup.chord} onchange={(v) => cfg.set({ chord: v, inversion: 0 })} />
          {#if pattern === "arpeggio"}
            <Choice
              label="Start on"
              setupKey="inversion"
              options={INVERSIONS.slice(0, CHORD_KINDS.find((c) => c.id === s.chord)?.intervals.length ?? 3).map((label, i) => ({ value: i, label: i ? `The ${label}` : "The root", hint: i ? `An arpeggio in ${["", "first", "second", "third"][i]} inversion, from the ${label} to the ${label}.` : undefined }))}
              value={scaleSetup.inversion}
              onchange={(v) => cfg.set({ inversion: v })}
            />
          {/if}
        {/if}
        <div class="flex min-w-0 flex-col gap-1 text-sm" data-setup="tonic">
          <span class="font-medium">Tonic</span>
          <KeyPicker label="Tonic" value={s.tonic % 12} name={tonicName} onchange={(p) => cfg.set({ tonic: 60 + p })} />
        </div>
      </fieldset>
      <fieldset class="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <legend class="mb-2 text-xs font-semibold uppercase tracking-wide text-ws-soft">How</legend>
        <Choice
          label="Span"
          setupKey="span"
          options={[
            ...(isScaleLine(pattern) ? [{ value: "pentascale", label: "Five notes" }] : []),
            { value: "one-octave", label: "One octave" },
            { value: "two-octave", label: "Two octaves" },
          ]}
          value={scaleSetup.span}
          onchange={(v) => cfg.set({ span: v, preset: false })}
        />
        <Choice
          label="Direction"
          setupKey="motion"
          options={[
            { value: "up", label: "Up" },
            { value: "down", label: "Down" },
            { value: "up-down", label: "Up and down" },
          ]}
          value={s.motion}
          onchange={(v) => cfg.set({ motion: v, preset: false })}
        />
        {#if onPiano}
          <Choice
            label="Hands"
            setupKey="hands"
            options={[
              { value: "right", label: "Right" },
              { value: "left", label: "Left" },
              { value: "both", label: "Both" },
            ]}
            value={scaleSetup.hands}
            onchange={(v) => cfg.set({ hands: v, preset: false })}
          />
          {#if scaleSetup.hands === "both" && isScaleLine(pattern)}
            <Choice label="Hands apart" setupKey="apart" options={HANDS_APART.map((a) => ({ value: a.id as string, label: a.label, hint: a.hint }))} value={scaleSetup.apart} onchange={(v) => cfg.set({ apart: v, preset: false })} />
          {/if}
        {/if}
        <Choice
          label="Keys"
          setupKey="rotate"
          options={[
            { value: "one", label: "This key" },
            { value: "circle", label: "Round the circle", hint: "After a clean checked run the tonic moves up a fifth: C, G, D and on through all 12." },
          ]}
          value={s.rotate ? "circle" : "one"}
          onchange={(v) => cfg.set({ rotate: v === "circle" })}
        />
        <Choice label="Notes a click" setupKey="per" options={[1, 2, 3, 4, 6].map((n) => ({ value: n, label: String(n), detail: PER_NAME[n] }))} value={perBeat} onchange={(v) => cfg.set({ perBeat: v, grade: "", preset: false })} />
        <div class="flex min-w-0 flex-col gap-1 text-sm" data-setup="preset">
          <span class="font-medium">Preset</span>
          <Picker label="Preset" action placeholder="Tempo and notes a click" options={presetOptions} onchange={pickPreset} />
        </div>
      </fieldset>
      <p class="text-sm text-ws-soft">Tempo comes from the practice strip (40 to 180). After a clean run the ladder moves you from one note a click to two, then four. ABRSM's speeds are "a general guide".</p>
    </div>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running"}
      <Stat label="Step" value="{Math.min(stepIndex + 1, steps.length)} of {steps.length}" />
      {#if mode === "practice" && steps[stepIndex]}<Stat label="Next note" value={steps[stepIndex].notes.map((n) => noteName(n.midi)).join(" + ")} />{/if}
    {:else if result}
      <Stat label="Notes right" value="{result.clean}/{result.total}" tone={result.pitch >= 0.9 ? "success" : "warn"} />
      <Stat label="Evenness" value={pct(result.evenness)} />
    {/if}
  {/snippet}

  {#snippet stage()}
    {#if falling && (mode === "practice" || phase === "results")}
      <FallingKeys score={lineScore(written, quartersPerClick > 1 ? { beats: 12, beatUnit: 8 } : undefined)} {low} {high} beat={clock.beat} groupStates={lineStates} {marks} {flashes} />
    {:else}
      {#if mode === "practice" || phase === "results"}
        <div class="mb-3">
          <LineNotation notes={written} tuning={fretTuning(inst)} title={key} cursorBeat={cursor} groupStates={lineStates} keyFifths={signature} meter={quartersPerClick > 1 ? [12, 8] : undefined} />
        </div>
      {/if}
      <InstrumentStage line={all} {low} {high} {marks} {flashes} />
    {/if}
    {#if mode === "check" && phase !== "results"}
      <p class="mt-3 text-sm text-ws-stage-soft">Check mode: no targets. Held keys still light.</p>
    {:else if onPiano && pattern === "scale" && phase === "ready"}
      <p class="mt-3 text-sm text-ws-stage-soft">
        {fingerOf.size ? "Numbers are fingers, 1 thumb to 5 little finger, as the scale books print them." : "No standard fingering for this scale here: keep the thumb off the black keys and cross it under after 3 or 4."}
      </p>
    {/if}
  {/snippet}

  {#snippet results()}
    {#if summary}
      <Results {summary}>
        {#snippet actions()}
          <button type="button" class={btn} onclick={() => retempo(-10)}>Slower</button>
        {/snippet}
      </Results>
    {/if}
  {/snippet}
</DrillShell>

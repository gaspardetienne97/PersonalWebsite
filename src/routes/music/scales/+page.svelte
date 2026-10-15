<script lang="ts">
  import { onDestroy } from "svelte";
  import type { NoteEvent } from "@repo/music-core";
  import { noteName } from "@repo/music-core";
  import { SCALE_GROUPS, type ScaleKind } from "@repo/music-core/theory/scales";
  import {
    ABRSM_SPEEDS,
    CHORD_KINDS,
    HANDS_TOGETHER_PRESET,
    SCALE_TEMPO,
    gradeSpeed,
    scaleDrillTargets,
    scaleSetupKey,
    scaleSkills,
    type ChordKind,
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
  import type { GroupState } from "$lib/music/notation/NotationFrame.svelte";
  import { signatureFor } from "@repo/music-core/theory/circle";
  import { nearMiss } from "@repo/music-core/signal/pitch";
  import Choice from "$lib/music/components/Choice.svelte";
  import KeyPicker from "$lib/music/components/KeyPicker.svelte";
  import Picker from "$lib/music/components/Picker.svelte";
  import type { SetupClause } from "$lib/music/components/DrillShell.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { type RunSummary } from "$lib/music/components/Results.svelte";
  import { Flashes, type CellMarks } from "$lib/music/components/feedback.svelte";
  import { btn } from "$lib/music/components/ui";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { assistanceFor, assistanceText, capture, pct, readKeyed, runInstrument, runSource, writeKeyed, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { benchFromUrl } from "$lib/music/drills/piano/transport.svelte";
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
  });
  const PATTERNS: { value: ScalePattern; label: string; hint?: string }[] = [
    { value: "scale", label: "Scale" },
    { value: "arpeggio", label: "Arpeggio" },
    { value: "broken", label: "Broken", hint: "Broken chords through the inversions" },
    { value: "blocked", label: "Blocked", hint: "Blocked chords through the inversions" },
  ];
  const s = $derived(cfg.value);
  const pattern = $derived((PATTERNS.some((p) => p.value === s.pattern) ? s.pattern : "scale") as ScalePattern);
  const perBeat = $derived(([1, 2, 4].includes(s.perBeat) ? s.perBeat : 1) as 1 | 2 | 4);
  const inst = $derived(settings.value.activeInstrument);
  const onPiano = $derived(inst === "piano");
  const scaleSetup = $derived({
    pattern,
    chord: s.chord as ChordKind,
    perBeat,
    kind: s.kind as ScaleKind,
    tonic: s.tonic,
    span: (pattern !== "scale" && s.span === "pentascale" ? "one-octave" : s.span) as "pentascale" | "one-octave" | "two-octave",
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

  function bpm() {
    return Math.min(SCALE_TEMPO.max, Math.max(SCALE_TEMPO.min, settings.value.bpm));
  }
  /** One note's time: the click divided by the notes to a click. */
  const stepMs = () => 60000 / bpm() / perBeat;
  const target = $derived(s.grade ? gradeSpeed(s.grade, pattern) : undefined);
  const PER = { 1: "one note a click", 2: "two notes a click", 4: "four notes a click" } as const;
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

  const marks = $derived.by(() => {
    const out: Record<number, CellMarks> = {};
    const both = scaleSetup.hands === "both";
    // Before a run: every note of the line at once, by hand when both play.
    if (demoStep === null && phase === "ready" && mode === "practice") {
      for (const st of steps) for (const n of st.notes) out[n.midi] = { target: true, label: both ? (n.hand === "left" ? "L" : "R") : undefined, role: both ? n.hand : "scale" };
      return out;
    }
    const show = demoStep ?? (mode === "practice" && phase !== "results" ? stepIndex : null);
    if (show === null || !steps[show]) return out;
    for (const n of steps[show].notes)
      out[n.midi] = demoStep !== null ? { demo: true } : { target: true, label: scaleSetup.hands === "both" ? (n.hand === "left" ? "L" : "R") : undefined, role: scaleSetup.hands === "both" ? n.hand : undefined };
    return out;
  });

  const scaleLabel = (k: string) => k.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
  const chordLabel = $derived(CHORD_KINDS.find((c) => c.id === s.chord)?.label.toLowerCase() ?? "major");
  const tonicName = (p: number) => noteName(p, "flat", false);
  const what = $derived(
    pattern === "scale"
      ? `${tonicName(s.tonic)} ${scaleLabel(s.kind).toLowerCase()} scale`
      : pattern === "arpeggio"
        ? `${tonicName(s.tonic)} ${chordLabel} arpeggio`
        : `${tonicName(s.tonic)} ${chordLabel} ${pattern} chords`,
  );
  const setupLine = $derived<SetupClause[]>([
    { text: what, focus: "kind" },
    { text: scaleSetup.span === "pentascale" ? "five notes" : scaleSetup.span.replace("-", " "), focus: "span" },
    { text: s.motion === "up-down" ? "up and down" : s.motion, focus: "motion" },
    onPiano ? { text: scaleSetup.hands === "both" ? "hands together" : `${scaleSetup.hands} hand`, focus: "hands" } : { text: `on ${inst}` },
    ...(perBeat > 1 ? [{ text: PER[perBeat], focus: "preset" }] : []),
    ...(target ? [{ text: `aiming for ${s.grade} speed (${target[0]}, ${PER[target[1]]})`, focus: "preset" }] : []),
  ]);

  function stopDemo() {
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
        status = `That ${noteName(miss.midi, "flat", false)} is ${Math.abs(miss.cents)} cents ${miss.cents > 0 ? "sharp" : "flat"}, so it reads as ${noteName(e.midi, "flat", false)}. Your ${inst} may need tuning.`;
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
  const written = $derived(steps.flatMap((st) => st.notes.map((n) => ({ midi: n.midi, startBeat: st.atBeat, durationBeats: 1 / perBeat, hand: onPiano ? n.hand : undefined, ...frets.get(n.midi) }))));
  const signature = $derived(pattern === "scale" ? signatureFor(s.tonic % 12, s.kind) : s.chord === "minor" ? signatureFor(s.tonic % 12, "natural-minor") : s.chord === "major" ? signatureFor(s.tonic % 12, "major") : 0);
  const cursor = $derived(demoStep !== null ? (steps[demoStep]?.atBeat ?? null) : phase === "running" ? (steps[Math.min(stepIndex, steps.length - 1)]?.atBeat ?? null) : null);
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
      params: { bpm: ctx.bpm, kind: s.kind, tonic: s.tonic, span: scaleSetup.span, motion: s.motion, hands: scaleSetup.hands, pattern, chord: s.chord, perBeat },
    });
    // Input is scored only after the count-in, so speakers can't bleed into the take.
    cap = capture(ctx.downbeat - beatMs / 2, (e) => e.kind === "noteon" && onNote(e));
    timer = setTimeout(() => void finish(), Math.max(0, ctx.downbeat - performance.now()) + steps.length * stepMs() + 4 * beatMs);
    stopClockRef = ctx.stopClock;
  }
  let stopClockRef: (() => void) | null = null;

  async function finish() {
    if (phase !== "running" && phase !== "countin") return;
    clearTimeout(timer);
    stopClockRef?.();
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
    status = summary.headline;
  }

  /** Notes a click as steps; goals are the fastest ABRSM speed for two and four (blocked chords have none). */
  function advanceAfter(score: number, correct: boolean) {
    const col = (n: 2 | 4) => Math.max(...ABRSM_SPEEDS.map((g) => (pattern === "scale" ? g.scale : g.arpeggio)).filter((x) => x[1] === n).map((x) => x[0]));
    const goals = pattern === "blocked" ? [120, 100, 80] : [120, col(2), col(4)];
    const steps = ([1, 2, 4] as const).map((n, i) => ({ label: PER[n].replace(/^./, (c) => c.toUpperCase()), goal: goals[i] }));
    const id = `scales.${pattern}.${pattern === "scale" ? s.kind : s.chord}.${scaleSetup.span}.${s.motion}.${scaleSetup.hands}.${s.tonic}`;
    return nextRun(id, { bpm: bpm(), tempo: { min: SCALE_TEMPO.min, goal: 120, max: SCALE_TEMPO.max }, steps, step: [1, 2, 4].indexOf(perBeat) }, { score, correct }, tempoAnd((i) => cfg.set({ perBeat: [1, 2, 4][i], preset: false })));
  }

  function stop() {
    clearTimeout(timer);
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

  const scaleOptions = [...SCALE_GROUPS.modes.map((k) => ({ value: k, label: scaleLabel(k), group: "Modes" })), ...SCALE_GROUPS.jazz.map((k) => ({ value: k, label: scaleLabel(k), group: "Jazz" }))];
</script>

<svelte:head><title>Scales | Woodshed</title></svelte:head>

<DrillShell
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
  {#snippet setup()}
    <div class="flex flex-col gap-5">
      <fieldset class="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <legend class="mb-2 text-xs font-semibold uppercase tracking-wide text-ws-soft">What</legend>
        <Choice label="Play" options={PATTERNS} value={pattern} onchange={(v) => cfg.set({ pattern: v, preset: false })} />
        {#if pattern === "scale"}
          <Choice label="Scale" setupKey="kind" options={scaleOptions} value={s.kind} onchange={(v) => cfg.set({ kind: v, preset: false })} />
        {:else}
          <Choice label="Chord" setupKey="kind" options={CHORD_KINDS.map((c) => ({ value: c.id as string, label: c.label }))} value={s.chord} onchange={(v) => cfg.set({ chord: v })} />
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
            ...(pattern === "scale" ? [{ value: "pentascale", label: "Five notes" }] : []),
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
        {/if}
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
    {#if mode === "practice" || phase === "results"}
      <div class="mb-3">
        <LineNotation notes={written} tuning={fretTuning(inst)} title={key} cursorBeat={cursor} groupStates={lineStates} keyFifths={signature} />
      </div>
    {/if}
    <InstrumentStage line={all} {low} {high} {marks} {flashes} />
    {#if mode === "check" && phase !== "results"}
      <p class="mt-3 text-sm text-ws-stage-soft">Check mode: no targets. Held keys still light.</p>
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

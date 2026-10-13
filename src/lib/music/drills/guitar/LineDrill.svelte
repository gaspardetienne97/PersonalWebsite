<script lang="ts">
  // Spider and Positions: a fretted line played one note per beat after the
  // count-in, graded pitch x 0.85 + evenness x 0.15 (scoring rules 7).
  // Input: on-screen frets (which also carry the string), MIDI, or the microphone.
  import { onDestroy } from "svelte";
  import type { NoteEvent } from "@repo/music-core";
  import { noteName } from "@repo/music-core";
  import { TUNINGS } from "@repo/music-core/data/index";
  import { catalogEntry } from "@repo/music-core/content/catalog";
  import {
    POSITION_PATTERNS,
    positionRootFretMax,
    positionTargets,
    SPIDER_PATTERNS,
    SPIDER_SPANS,
    SPIDER_TEMPOS,
    GUITAR_GRADE_TEMPOS,
    spiderMaxStartFret,
    spiderTargets,
    type FretTarget,
  } from "@repo/music-core/content/technique";
  import { gradeLine, type LineResult } from "@repo/music-core/scoring/technique";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "$lib/music/components/DrillShell.svelte";
  import Fretboard, { type FretMark } from "$lib/music/components/Fretboard.svelte";
  import Choice from "$lib/music/components/Choice.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { type RunSummary } from "$lib/music/components/Results.svelte";
  import { Flashes } from "$lib/music/components/feedback.svelte";
  import { btn, btnStage } from "$lib/music/components/ui";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { assistanceFor, assistanceText, capture, pct, runInstrument, runSource, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { audio, mic, settings } from "$lib/music/runtime";
  import { exerciseFor, skillsFor } from "./fretted";
  import { fretted, tunings } from "./instrument.svelte";
  import MicPanel from "./MicPanel.svelte";
  import ModeTabs from "./ModeTabs.svelte";
  import TuningPicker from "./TuningPicker.svelte";
  import { FRETBOARD_MODES } from "./modes";

  let { kind }: { kind: "spider" | "positions" } = $props();

  // svelte-ignore state_referenced_locally
  const isSpider = kind === "spider";
  const cfg = new DrillSetup(isSpider ? "fretboard-spider" : "fretboard-positions", {
    pattern: isSpider ? "ascending-1234" : "minor-pentatonic-box-1",
    tuning: "guitar.standard",
    string: 6,
    span: "single",
    startFret: 5,
    crossing: false as boolean,
    rootFret: 5,
    perBeat: 1,
    /** A grade whose exam click was picked ("" for none). */
    grade: "" as string,
  });
  const s = $derived(cfg.value);
  const entry = catalogEntry("fretboard")!.modes.find((m) => m.id === (isSpider ? "spider" : "positions"))!;

  const instr = $derived(fretted());
  // Box and CAGED shapes are written for standard guitar tuning, root on string 6.
  const tuning = $derived(isSpider ? tunings.pick(s.tuning, instr) : TUNINGS.guitar[0]);
  const unavailable = $derived(!isSpider && instr === "ukulele");
  const bpm = () => Math.min(200, Math.max(40, settings.value.bpm));
  const perBeat = $derived([1, 2, 4].includes(s.perBeat) ? s.perBeat : 1);
  /** One note's time: the click divided by the notes to a click. */
  const stepMs = () => 60000 / bpm() / perBeat;
  const target = $derived(GUITAR_GRADE_TEMPOS.find((g) => g.id === s.grade));
  const PER: Record<number, string> = { 1: "one note a click", 2: "two notes a click", 4: "four notes a click" };

  const spiderPattern = $derived(SPIDER_PATTERNS.find((p) => p.id === s.pattern) ?? SPIDER_PATTERNS[0]);
  const box = $derived(POSITION_PATTERNS.find((p) => p.id === s.pattern) ?? POSITION_PATTERNS[0]);
  const stringCount = $derived(tuning.openStrings.length);
  const startFret = $derived(Math.min(s.startFret, spiderMaxStartFret(tuning)));
  const rootFret = $derived(Math.min(s.rootFret, positionRootFretMax(box, tuning)));

  const steps = $derived.by((): FretTarget[] => {
    if (isSpider)
      return spiderTargets({ patternId: spiderPattern.id, tuning, string: Math.min(s.string, stringCount), span: s.span as never, startFret, crossing: s.crossing });
    const line = positionTargets({ patternId: box.id, tuning, rootFret });
    const low = Math.max(1, Math.min(...line.map((t) => t.fret)));
    // ponytail: one finger per fret from the lowest fretted note, capped at the pinky; authored box fingerings would replace this.
    return line.map((t) => ({ ...t, finger: t.fret === 0 ? 0 : Math.min(4, t.fret - low + 1) }));
  });
  const key = $derived(
    isSpider
      ? `spider:${spiderPattern.id}:${tuning.id}:s${Math.min(s.string, stringCount)}:${s.span}:f${startFret}:${s.crossing ? "x" : "-"}:${bpm()}${perBeat > 1 ? `x${perBeat}` : ""}`
      : `positions:${box.id}:r${rootFret}:${bpm()}${perBeat > 1 ? `x${perBeat}` : ""}`,
  );
  const frets = $derived(steps.map((t) => t.fret));
  const from = $derived(Math.min(...frets) <= 1 ? 0 : Math.min(...frets) - 1);
  const to = $derived(Math.min(tuning.fretCount, Math.max(from + 4, Math.max(...frets) + 1)));

  let phase = $state<Phase>("ready");
  let mode = $state<DrillMode>("practice");
  let status = $state("");
  let stepIndex = $state(0);
  let demoStep = $state<number | null>(null);
  let demo: { stop(): void; playing: boolean } | null = $state(null);
  let summary = $state<RunSummary | null>(null);
  let result = $state<LineResult | null>(null);
  const flashes = new Flashes();
  let cap: Capture | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let stopClockRef: (() => void) | null = null;

  const finger = (t: FretTarget) => (t.finger ? String(t.finger) : undefined);
  const marks = $derived.by((): FretMark[] => {
    if (demoStep !== null && steps[demoStep]) return [{ string: steps[demoStep].string, fret: steps[demoStep].fret, label: finger(steps[demoStep]), demo: true }];
    if (mode !== "practice" || phase === "results") return [];
    if (phase === "running" || phase === "countin") {
      const t = steps[stepIndex];
      return t ? [{ string: t.string, fret: t.fret, label: finger(t) }] : [];
    }
    const seen = new Set<number>();
    return steps.flatMap((t) => (seen.has(t.string * 100 + t.fret) ? [] : (seen.add(t.string * 100 + t.fret), [{ string: t.string, fret: t.fret, label: finger(t) }])));
  });

  const summaryLine = $derived(
    isSpider
      ? `${spiderPattern.label}, ${tuning.name}, string ${Math.min(s.string, stringCount)}, ${SPIDER_SPANS.find((x) => x.id === s.span)?.label.toLowerCase()}, from fret ${startFret}${s.crossing ? ", crossing strings" : ""}, ${bpm()} BPM${perBeat > 1 ? `, ${PER[perBeat]}` : ""}`
      : `${box.label}, root at fret ${rootFret} (${noteName(tuning.openStrings[5] + rootFret, "sharp", false)}), ${bpm()} BPM${perBeat > 1 ? `, ${PER[perBeat]}` : ""}`,
  );

  function stopDemo() {
    demo?.stop();
    demo = null;
    demoStep = null;
  }

  async function playDemo() {
    if (demo?.playing) return stopDemo();
    await audio.unlock();
    const beatS = stepMs() / 1000;
    const handle = audio.playSequence(
      steps.map((t, i) => ({ midi: t.midi, time: i * beatS, duration: beatS * 0.9 })),
      { onNote: (i: number) => (demoStep = i) },
    );
    demo = handle;
    status = "Listen: the line at tempo, lit as it sounds.";
    void handle.done.then(() => {
      if (demo === handle) stopDemo();
    });
  }

  function onNote(e: NoteEvent) {
    if (e.kind !== "noteon" || phase !== "running") return;
    // Follow the order, allowing a skipped note or two, like the grader does.
    const k = steps.findIndex((t, i) => i >= stepIndex && i <= stepIndex + 2 && t.midi === e.midi);
    if (k >= 0) {
      if (mode === "practice") flashes.add(steps[k].string * 100 + steps[k].fret, "correct");
      stepIndex = k + 1;
      if (stepIndex >= steps.length) void finish();
    } else if (mode === "practice" && e.string !== undefined && e.fret !== undefined) {
      flashes.add(e.string * 100 + e.fret, "wrong");
    }
  }

  async function start(ctx: RunContext) {
    stopDemo();
    summary = null;
    result = null;
    stepIndex = 0;
    flashes.clear();
    run = practice.beginRun({
      exerciseId: exerciseFor(entry.exerciseId, instr),
      setupKey: key,
      skillIds: skillsFor(entry.skillIds, instr),
      capabilities: ["technique"],
      modality: "played",
      assistance: assistanceFor(mode),
      difficulty: isSpider ? (spiderPattern.group === "classic" ? 0.3 : 0.4) + (s.crossing ? 0.15 : 0) + (s.span === "single" ? 0 : 0.1) : box.family === "caged-major" ? 0.5 : 0.45,
      instrument: instr,
      params: isSpider
        ? { bpm: ctx.bpm, perBeat, pattern: spiderPattern.id, tuning: tuning.id, string: s.string, span: s.span, startFret, crossing: s.crossing }
        : { bpm: ctx.bpm, perBeat, pattern: box.id, rootFret },
    });
    // Scored only after the count-in, so the speakers can't bleed into the take.
    cap = capture(ctx.downbeat - ctx.beatMs / 2, (e) => e.kind === "noteon" && onNote(e));
    timer = setTimeout(() => void finish(), Math.max(0, ctx.downbeat - performance.now()) + steps.length * stepMs() + 4 * ctx.beatMs);
    stopClockRef = ctx.stopClock;
  }

  async function finish() {
    if (phase !== "running" && phase !== "countin") return;
    clearTimeout(timer);
    stopClockRef?.();
    cap?.stop();
    mic.stop();
    const notes = cap?.notes ?? [];
    const r = gradeLine({ beats: steps.map((t) => [{ midi: t.midi }]), beatMs: stepMs(), notes });
    result = r;
    phase = "results";
    await run!.attempt({
      promptId: key,
      correct: r.correct,
      partialCredit: r.score,
      metrics: r.metrics,
      source: runSource(notes),
      instrument: runInstrument(notes, instr) ?? null,
      target: steps.map((t) => t.midi),
      response: notes.filter((n) => n.kind === "noteon").map((n) => n.midi),
    });
    const fin = await run!.finish({ score: r.score, correct: r.correct, headline: `${pct(r.score)} at ${bpm()} BPM` });
    // The string is only known for on-screen taps; MIDI and the microphone carry pitch.
    const ons = notes.filter((n) => n.kind === "noteon");
    const taps = ons.filter((n) => n.source === "onscreen" && n.string !== undefined);
    const onString = taps.filter((n) => steps.some((t) => t.midi === n.midi && t.string === n.string && t.fret === n.fret)).length;
    const clean = r.correct && mode === "check";
    summary = {
      headline: r.correct
        ? mode === "check"
          ? `Clean and even at ${bpm()} BPM. Every finger landed.`
          : `Clean at ${bpm()} BPM. Try it in Check to count it.`
        : !ons.length
          ? "Nothing was heard during the run. Tap the frets, play into the microphone, or connect MIDI, then try again."
          : r.pitch < 0.9
            ? `${r.clean} of ${r.total} notes right. Slow down until each finger lands before the next.`
            : `Every note right, but the spacing wandered by ${Math.round(r.evennessErrorMs)} ms. Keep it even.`,
      metric: pct(r.score),
      metricLabel: "score",
      delta: fin.delta,
      best: fin.best,
      clean,
      xp: fin.xp,
      assistance: assistanceText(mode),
      rows: [
        { label: "Notes right", value: r.pitch, text: `${r.clean} of ${r.total}` },
        { label: "Evenness", value: r.evenness, text: `${pct(r.evenness)}, ${Math.round(r.evennessErrorMs)} ms off` },
        taps.length && taps.length === ons.length
          ? { label: "On the written string and fret", value: taps.length ? onString / taps.length : 0, text: `${onString} of ${taps.length} taps` }
          : { label: "String and fret", notMeasured: true },
        ...(target
          ? [
              {
                label: `${target.label} click, ${target.bpm} BPM`,
                value: Math.min(1, bpm() / target.bpm),
                text: bpm() >= target.bpm ? (r.correct ? "reached, clean" : "at tempo, not clean yet") : `${bpm()} of ${target.bpm} BPM`,
              },
            ]
          : []),
      ],
    };
    status = summary.headline;
  }

  function stop() {
    clearTimeout(timer);
    cap?.stop();
    mic.stop();
    phase = "ready";
    status = "Stopped. Nothing was recorded.";
  }

  function again(patch: { bpm?: number; next?: boolean }) {
    if (patch.bpm) settings.update({ bpm: Math.min(200, Math.max(40, patch.bpm)) });
    if (patch.next) {
      const list = isSpider ? SPIDER_PATTERNS : POSITION_PATTERNS;
      const i = list.findIndex((p) => p.id === (isSpider ? spiderPattern.id : box.id));
      cfg.set({ pattern: list[(i + 1) % list.length].id });
    }
    phase = "ready";
    summary = null;
  }

  onDestroy(() => {
    clearTimeout(timer);
    cap?.stop();
    stopDemo();
    mic.stop();
  });

  const stringOptions = $derived(tuning.openStrings.map((m, i) => ({ value: i + 1, label: `${i + 1} (${noteName(m, "flat", false)})` })));
  const maxStart = $derived(spiderMaxStartFret(tuning));
  const rootMax = $derived(positionRootFretMax(box, tuning));
</script>

<DrillShell
  title={isSpider ? "Spider" : "Positions"}
  hue={instr}
  blurb={isSpider
    ? "One finger per fret, one note per click. The pattern walks your fingers until each lands on its own."
    : "A pentatonic box or CAGED shape, played low string to high, one note per click."}
  summary={summaryLine}
  bind:phase
  bind:mode
  bind:status
  progress={steps.length ? stepIndex / steps.length : 0}
  clock={{ bpm: bpm(), beatsPerBar: 4 }}
  ondemo={playDemo}
  demoPlaying={!!demo?.playing}
  onstart={start}
  onstop={stop}
  blocked={unavailable ? "Positions are guitar shapes. Switch the practice strip to guitar." : null}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#if isSpider}
        <Choice
          label="Pattern"
          select
          options={SPIDER_PATTERNS.map((p) => ({ value: p.id, label: p.group === "classic" ? p.label : `All finger orders: ${p.label}` }))}
          value={spiderPattern.id}
          onchange={(v) => cfg.set({ pattern: v })}
        />
        <TuningPicker instrument={instr} value={tuning.id} onchange={(id) => cfg.set({ tuning: id })} />
        <Choice label="String" options={stringOptions} value={Math.min(s.string, stringCount)} onchange={(v) => cfg.set({ string: v })} />
        <Choice label="Span" select options={SPIDER_SPANS.map((x) => ({ value: x.id, label: x.label }))} value={s.span} onchange={(v) => cfg.set({ span: v })} />
        <Choice
          label="Start fret"
          select
          options={Array.from({ length: maxStart + 1 }, (_, f) => ({ value: f, label: f === 0 ? "Open strings" : `Fret ${f}` }))}
          value={startFret}
          onchange={(v) => cfg.set({ startFret: v })}
        />
        <Choice
          label="String crossing"
          options={[
            { value: 0, label: "One string at a time" },
            { value: 1, label: "Cross each step" },
          ]}
          value={s.crossing ? 1 : 0}
          onchange={(v) => cfg.set({ crossing: v === 1 })}
        />
      {:else}
        <Choice label="Shape" select options={POSITION_PATTERNS.map((p) => ({ value: p.id, label: p.label }))} value={box.id} onchange={(v) => cfg.set({ pattern: v })} />
        <Choice
          label="Root fret (string 6)"
          select
          options={Array.from({ length: rootMax + 1 }, (_, f) => ({ value: f, label: `Fret ${f}, ${noteName(tuning.openStrings[5] + f, "sharp", false)}` }))}
          value={rootFret}
          onchange={(v) => cfg.set({ rootFret: v })}
        />
        <p class="text-sm text-ws-soft sm:col-span-2 lg:col-span-1">Shapes are written for standard tuning with the root on string 6.</p>
      {/if}
      <Choice label="Tempo" options={SPIDER_TEMPOS.map((t) => ({ value: t, label: `${t}` }))} value={bpm()} onchange={(v) => settings.update({ bpm: v })} />
      <Choice
        label="Notes a click"
        options={[
          { value: 1, label: "One" },
          { value: 2, label: "Two" },
          { value: 4, label: "Four" },
        ]}
        value={perBeat}
        onchange={(v) => cfg.set({ perBeat: v })}
      />
      <Choice
        label="Grade tempo"
        select
        options={[{ value: "", label: "None" }, ...GUITAR_GRADE_TEMPOS.map((g) => ({ value: g.id, label: `${g.label}: ${g.bpm} BPM` }))]}
        value={s.grade}
        onchange={(v) => {
          cfg.set({ grade: v });
          const g = GUITAR_GRADE_TEMPOS.find((x) => x.id === v);
          if (g) settings.update({ bpm: g.bpm });
        }}
      />
      <p class="text-sm text-ws-soft sm:col-span-2 lg:col-span-3">Grade tempos are the exam click (Rockschool Electric 2018, Trinity classical minimums); the syllabi extracts don't say how many notes fall on a click, so pick that yourself.</p>
    </div>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running"}
      <Stat label="Note" value="{Math.min(stepIndex + 1, steps.length)} of {steps.length}" />
      {#if mode === "practice" && steps[stepIndex]}<Stat label="Next" value="String {steps[stepIndex].string}, fret {steps[stepIndex].fret}" />{/if}
    {:else if result}
      <Stat label="Notes right" value="{result.clean}/{result.total}" tone={result.pitch >= 0.9 ? "success" : "warn"} />
      <Stat label="Evenness" value={pct(result.evenness)} />
    {/if}
  {/snippet}

  {#snippet stage()}
    {#if phase === "ready" || phase === "results"}<ModeTabs tabs={FRETBOARD_MODES} label="Fretboard drills" />{/if}
    {#if unavailable}
      <div class="grid min-h-48 place-items-center gap-3 text-center">
        <p class="max-w-md text-ws-stage-soft">Box and CAGED shapes are guitar shapes with the root on string 6, so they have no ukulele version here. Spider and Note finder work on the ukulele.</p>
        <button type="button" class={btnStage} onclick={() => settings.update({ activeInstrument: "guitar" })}>Switch to guitar</button>
      </div>
    {:else}
      <Fretboard openStrings={tuning.openStrings} {from} {to} {marks} {flashes} label="{instr === 'ukulele' ? 'Ukulele' : 'Guitar'} fretboard" />
      <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ws-stage-soft">
        {#if mode === "check" && phase !== "results"}<p>Check mode: no targets. The frets you play still light.</p>{:else if phase === "ready"}<p>Numbers are fingers: 1 index to 4 pinky.</p>{/if}
      </div>
              <div class="mt-3"><MicPanel disabled={phase === "running" || phase === "countin"} hint="Optional: play on your {instr} into the microphone, or tap the frets here." /></div>
    {/if}
  {/snippet}

  {#snippet results()}
    {#if summary}
      <Results {summary}>
        {#snippet actions()}
          <button type="button" class={btn} onclick={() => again({ bpm: bpm() + 10 })}>Faster, {bpm() + 10} BPM</button>
          <button type="button" class={btn} onclick={() => again({ bpm: bpm() - 10 })}>Slower</button>
          <button type="button" class={btn} onclick={() => again({ next: true })}>Next {isSpider ? "pattern" : "shape"}</button>
        {/snippet}
      </Results>
    {/if}
  {/snippet}
</DrillShell>

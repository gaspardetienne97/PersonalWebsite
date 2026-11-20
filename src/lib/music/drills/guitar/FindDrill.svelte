<script lang="ts">
  // Note finder and Interval recall: find a note inside a five-fret window.
  // Binary per question; no timing or fingering is assessed. The string and fret
  // are verified only for on-screen taps (MIDI and the microphone carry pitch).
  import { onDestroy } from "svelte";
  import type { NoteEvent } from "@repo/music-core";
  import { noteName } from "@repo/music-core";
  import { catalogEntry } from "@repo/music-core/content/catalog";
  import { rng } from "@repo/music-core/content/random";
  import {
    intervalRecallPrompt,
    noteFinderPrompt,
    RECALL_INTERVALS,
    RECALL_REGIONS,
  } from "@repo/music-core/content/technique";
  import { midiAt } from "@repo/music-core/theory/fretboard";
  import { gradeFretFind } from "@repo/music-core/scoring/technique";
  import { fretboardLessons } from "@repo/music-core/lessons/fretboard";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "#lib/music/components/DrillShell.svelte";
  import Fretboard, { type FretMark } from "#lib/music/components/Fretboard.svelte";
  import Choice from "#lib/music/components/Choice.svelte";
  import Stat from "#lib/music/components/Stat.svelte";
  import Results, { silentRun, type RunSummary } from "#lib/music/components/Results.svelte";
  import { Flashes } from "#lib/music/components/feedback.svelte.ts";
  import { DrillSetup } from "#lib/music/setup.svelte.ts";
  import { assistanceFor, assistanceText, capture, runInstrument, tuningText, type Capture } from "#lib/music/drill.svelte.ts";
  import { nearMiss } from "@repo/music-core/signal/pitch";
  import { nextRun } from "#lib/music/advance.svelte.ts";
  import { practice } from "#lib/music/practice.svelte.ts";
  import { mic } from "#lib/music/runtime/index.ts";
  import { exerciseFor, skillsFor } from "./fretted";
  import { fretted, tuningFor } from "./instrument.svelte";
  import MicPanel from "./MicPanel.svelte";
  import { FRETBOARD_MODES, openMode } from "./modes";

  let { kind }: { kind: "note-finder" | "interval-recall" } = $props();
  // svelte-ignore state_referenced_locally
  const isRecall = kind === "interval-recall";

  const REVEAL_MS = 900;
  const cfg = new DrillSetup(isRecall ? "fretboard-interval-recall" : "fretboard-note-finder", {
    region: 0,
    interval: 7,
    questions: 8,
  });
  const s = $derived(cfg.value);
  const entry = catalogEntry("fretboard")!.modes.find((m) => m.id === (isRecall ? "interval-recall" : "note-finder"))!;
  const instr = $derived(fretted());
  const tuning = $derived(tuningFor(instr));
  const regionIdx = $derived(Math.min(Math.max(0, s.region), RECALL_REGIONS.length - 1));
  const region = $derived(RECALL_REGIONS[regionIdx]);
  const to = $derived(Math.min(tuning.fretCount, region.end));
  const intervalLabel = (st: number) => RECALL_INTERVALS.find((i) => i.semitones === st)?.label ?? `${st} semitones`;
  /** "a major third", "an octave". */
  const aOrAn = (label: string) => `${/^[aeiou]/i.test(label) ? "an" : "a"} ${label.toLowerCase()}`;
  const key = $derived(isRecall ? `interval-recall:${tuning.id}:r${regionIdx}:i${s.interval}` : `note-finder:${tuning.id}:r${regionIdx}`);

  interface Question {
    id: string;
    label: string;
    anchor?: { string: number; fret: number; midi: number };
    acceptable: { string: number; fret: number; midi: number }[];
    skillIds: string[];
    semitones?: number;
  }
  interface Answer {
    q: Question;
    correct: boolean;
    positionVerified: boolean | null;
    midi: number;
    ms: number;
  }

  let phase = $state<Phase>("ready");
  let mode = $state<DrillMode>("practice");
  let status = $state("");
  let question = $state<Question | null>(null);
  let revealing = $state(false);
  let answers = $state<Answer[]>([]);
  let summary = $state<RunSummary | null>(null);
  const flashes = new Flashes();
  let cap: Capture | null = null;
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let rand = rng(Date.now());
  let askedAt = 0;
  let pending: Promise<unknown> = Promise.resolve();
  let revealTimer: ReturnType<typeof setTimeout> | undefined;

  function nextQuestion(): Question {
    const acceptable = (ps: { string: number; fret: number }[]) => ps.map((p) => ({ ...p, midi: midiAt(tuning, p.string, p.fret) }));
    if (!isRecall) {
      const p = noteFinderPrompt(rand, { tuning, region: { start: region.start, end: to } });
      return { id: p.id, label: p.name, acceptable: acceptable(p.answers), skillIds: skillsFor(entry.skillIds, instr) };
    }
    const semitones = s.interval || RECALL_INTERVALS[Math.floor(rand() * RECALL_INTERVALS.length)].semitones;
    const p = intervalRecallPrompt(rand, { tuning, region: regionIdx, semitones });
    return { id: p.id, label: intervalLabel(semitones), anchor: p.anchor, acceptable: acceptable(p.answers), skillIds: skillsFor(p.skillIds, instr), semitones };
  }

  const marks = $derived.by((): FretMark[] => {
    const out: FretMark[] = [];
    if (!question || phase === "results") return out;
    if (question.anchor) out.push({ string: question.anchor.string, fret: question.anchor.fret, role: "root", spoken: "starting note" });
    if (revealing || (mode === "practice" && phase === "running"))
      for (const a of question.acceptable) out.push({ string: a.string, fret: a.fret, label: revealing ? noteName(a.midi, "sharp", false) : undefined });
    return out;
  });

  const summaryLine = $derived(
    [
      ...(isRecall ? [{ text: s.interval ? intervalLabel(s.interval) : "Mixed intervals", focus: "interval" }] : [{ text: "Named notes" }]),
      { text: `frets ${region.start} to ${to}`, focus: "region" },
      { text: `${s.questions} questions`, focus: "questions" },
    ],
  );

  function ask() {
    question = nextQuestion();
    revealing = false;
    askedAt = performance.now();
    status = `Question ${answers.length + 1}: ${isRecall ? `find ${aOrAn(question.label)} above the square` : `find ${question.label}`}.`;
  }

  function onNote(e: NoteEvent) {
    if (e.kind !== "noteon" || phase !== "running" || !question || revealing) return;
    // Sounding the anchor first to hear it is not an answer.
    if (question.anchor && e.midi === question.anchor.midi) return;
    const q = question;
    // A quarter tone off rounds to the next note: that is the tuning, not a wrong answer, so ask again.
    if (e.source === "audio" && !q.acceptable.some((a) => a.midi === e.midi)) {
      const miss = nearMiss(e.midi, e.cents, [...new Set(q.acceptable.map((a) => a.midi))]);
      if (miss) return void (status = `${tuningText(miss, e.midi, instr)} Play it again.`);
    }
    const g = gradeFretFind(q.acceptable, e);
    // Taps know their string; a correct pitch from MIDI or the microphone lights where it lives.
    const at = e.string !== undefined && e.fret !== undefined ? e : g.correct ? q.acceptable.find((a) => a.midi === e.midi) : undefined;
    if (at) flashes.add(at.string! * 100 + at.fret!, g.correct ? "correct" : "wrong", REVEAL_MS);
    const ms = Math.round(e.at - askedAt);
    answers = [...answers, { q, correct: g.correct, positionVerified: g.positionVerified, midi: e.midi, ms }];
    const r = run!;
    pending = pending.then(() =>
      r.attempt({
        promptId: q.id,
        correct: g.correct,
        partialCredit: g.score,
        metrics: g.metrics,
        source: e.source,
        instrument: runInstrument([e], instr) ?? null,
        skillIds: q.skillIds,
        target: q.acceptable.map((a) => a.midi),
        response: [e.midi],
        latencyMs: ms,
      }),
    );
    revealing = true;
    status = g.correct
      ? `Yes, ${noteName(e.midi, "sharp")}.`
      : `That was ${noteName(e.midi, "sharp")}. ${q.acceptable.length > 1 ? "The lit frets are" : "The lit fret is"} ${isRecall ? `${aOrAn(q.label)} up` : q.label}.`;
    revealTimer = setTimeout(() => {
      if (phase !== "running") return;
      if (answers.length >= s.questions) void finish();
      else ask();
    }, REVEAL_MS);
  }

  async function start(ctx: RunContext) {
    summary = null;
    answers = [];
    flashes.clear();
    rand = rng(Date.now());
    pending = Promise.resolve();
    run = practice.beginRun({
      exerciseId: exerciseFor(entry.exerciseId, instr),
      setupKey: key,
      skillIds: skillsFor(entry.skillIds, instr),
      capabilities: ["technique"],
      modality: "played",
      assistance: assistanceFor(mode),
      difficulty: (isRecall ? 0.35 : 0.3) + regionIdx * 0.1,
      instrument: instr,
      params: { tuning: tuning.id, region: regionIdx, questions: s.questions, ...(isRecall ? { interval: s.interval } : {}) },
    });
    cap = capture(ctx.downbeat, (e) => e.kind === "noteon" && onNote(e));
    ask();
  }

  async function finish() {
    if (phase !== "running") return;
    clearTimeout(revealTimer);
    cap?.stop();
    question = null;
    phase = "results";
    await pending;
    const right = answers.filter((a) => a.correct).length;
    const score = answers.length ? right / answers.length : 0;
    const correct = right === answers.length && answers.length > 0;
    const fin = await run!.finish({ score, correct, headline: `${right} of ${answers.length} found` });
    if (!fin.heard) {
      summary = silentRun();
      status = summary.headline;
      return;
    }
    const taps = answers.filter((a) => a.positionVerified !== null);
    const meanMs = answers.length ? answers.reduce((n, a) => n + a.ms, 0) / answers.length : 0;
    const perInterval = isRecall && !s.interval
      ? RECALL_INTERVALS.flatMap((iv) => {
          const mine = answers.filter((a) => a.q.semitones === iv.semitones);
          return mine.length ? [{ label: iv.label, value: mine.filter((a) => a.correct).length / mine.length, text: `${mine.filter((a) => a.correct).length} of ${mine.length}` }] : [];
        })
      : [];
    summary = {
      headline:
        right === answers.length
          ? `All ${right} found${isRecall ? "" : ` between frets ${region.start} and ${to}`}.${mode === "check" ? "" : " Try it in Check, with the frets hidden."}`
          : `${right} of ${answers.length} found. The misses are listed on the stage, so look again before the next round.`,
      metric: `${right}/${answers.length}`,
      metricLabel: "found",
      delta: fin.delta,
      best: fin.best,
      clean: mode === "check" && right === answers.length && answers.length > 0,
      xp: fin.xp,
      assistance:
        assistanceText(mode) + (isRecall && instr === "ukulele" ? " The skill map has no ukulele interval skill yet, so this run is kept as practice history only." : ""),
      rows: [
        { label: "Found", value: score, text: `${right} of ${answers.length}` },
        ...perInterval,
        { label: "Mean time to answer", text: `${(meanMs / 1000).toFixed(1)} s` },
        taps.length === answers.length && taps.length
          ? { label: "On a lit string and fret", value: taps.filter((a) => a.positionVerified).length / taps.length, text: `${taps.filter((a) => a.positionVerified).length} of ${taps.length}` }
          : { label: "String and fret", notMeasured: true },
        { label: "Timing and fingering", notMeasured: true },
      ],
      // The regions up the neck, low to high.
      advance: answers.length
        ? await nextRun(`${instr}.${kind}.${tuning.id}${isRecall ? `.i${s.interval}` : ""}`, { steps: RECALL_REGIONS.map((r) => ({ label: `frets ${r.start} to ${r.end}` })), step: regionIdx }, { score, correct }, ({ step }) => step !== undefined && cfg.set({ region: step }))
        : undefined,
    };
    status = summary.headline;
  }

  function stop() {
    clearTimeout(revealTimer);
    cap?.stop();
    question = null;
    phase = "ready";
    status = "Stopped. Answers so far were kept.";
    void pending.then(() => (answers.length ? run?.finish({}) : undefined));
  }

  onDestroy(() => {
    clearTimeout(revealTimer);
    cap?.stop();
    mic.stop();
  });

  const missed = $derived(answers.filter((a) => !a.correct));
</script>

<DrillShell
  lesson={{ lessons: fretboardLessons(kind, instr, tuning.openStrings) }}
  title={isRecall ? "Interval recall" : "Note finder"}
  hue={instr}
  blurb={isRecall
    ? "From the square, find the note a set interval up, inside a five-fret window. No timing, no fingering, just where it lives."
    : "A note is named. Find it on the neck inside a five-fret window, on any string."}
  summary={summaryLine}
  tabs={FRETBOARD_MODES}
  tab={kind}
  ontab={(id) => openMode(FRETBOARD_MODES, id)}
  bind:phase
  bind:mode
  bind:status
  progress={s.questions ? answers.length / s.questions : 0}
  onstart={start}
  onstop={stop}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Choice label="Region" setupKey="region" options={RECALL_REGIONS.map((r, i) => ({ value: i, label: `Frets ${r.start} to ${r.end}` }))} value={regionIdx} onchange={(v) => cfg.set({ region: v })} />
      {#if isRecall}
        <Choice
          label="Interval"
          setupKey="interval"
          options={[...RECALL_INTERVALS.map((i) => ({ value: i.semitones as number, label: i.label })), { value: 0, label: "Mixed" }]}
          value={s.interval}
          onchange={(v) => cfg.set({ interval: v })}
        />
      {/if}
      <Choice
        label="Questions"
        setupKey="questions"
        options={[
          { value: 5, label: "5" },
          { value: 8, label: "8" },
          { value: 12, label: "12" },
        ]}
        value={s.questions}
        onchange={(v) => cfg.set({ questions: v })}
      />
    </div>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running"}
      <Stat label="Question" value="{Math.min(answers.length + 1, s.questions)} of {s.questions}" />
      <Stat label="Found" value={answers.filter((a) => a.correct).length} />
    {/if}
  {/snippet}

  {#snippet stage()}
    <div class="mb-3 flex min-h-20 flex-wrap items-end gap-x-4 gap-y-1">
      {#if question}
        <p class="font-display text-5xl font-bold leading-none sm:text-6xl" aria-hidden="true">{question.label}</p>
        <p class="pb-1 text-ws-stage-soft">{isRecall ? "up from the square, on any string" : `anywhere from fret ${region.start} to ${to}`}</p>
      {:else if phase === "results" && missed.length}
        <p class="text-sm text-ws-stage-soft">Missed: {missed.map((a) => (isRecall ? `${a.q.label.toLowerCase()} from ${noteName(a.q.anchor!.midi, "sharp")}` : a.q.label)).join(", ")}.</p>
      {:else}
        <p class="max-w-prose text-ws-stage-soft">
          {isRecall ? "A square marks the starting note. Find the interval above it; sounding the square first is fine." : "A note name appears here. Tap it on the neck, or play it."}
          {mode === "check" ? " Check hides the answers." : " Practice lights the answers."}
        </p>
      {/if}
    </div>
    <Fretboard openStrings={tuning.openStrings} from={region.start} {to} {marks} {flashes} label="{instr === 'ukulele' ? 'Ukulele' : 'Guitar'} fretboard" />
    <div class="mt-3"><MicPanel disabled={phase === "running"} hint="Optional: answer on your instrument into the microphone, or tap the neck here." /></div>
  {/snippet}

  {#snippet results()}
    {#if summary}
      <Results {summary} />
    {/if}
  {/snippet}
</DrillShell>

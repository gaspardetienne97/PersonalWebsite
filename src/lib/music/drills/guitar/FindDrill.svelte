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
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "$lib/music/components/DrillShell.svelte";
  import Fretboard, { type FretMark } from "$lib/music/components/Fretboard.svelte";
  import Choice from "$lib/music/components/Choice.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { silentRun, type RunSummary } from "$lib/music/components/Results.svelte";
  import { Flashes } from "$lib/music/components/feedback.svelte";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { assistanceFor, capture, runInstrument, tuningText, type Capture } from "$lib/music/drill.svelte";
  import { nearMiss } from "@repo/music-core/signal/pitch";
  import { nextRun } from "$lib/music/advance.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { mic } from "$lib/music/runtime";
  import { exerciseFor, skillsFor } from "./fretted";
  import { fretted, tuningFor } from "./instrument.svelte";
  import MicPanel from "./MicPanel.svelte";
  import Verdict from "$lib/music/components/Verdict.svelte";
  import { btnPrimary } from "$lib/music/components/ui";
  import X from "lucide-svelte/icons/x";
  import { FRETBOARD_MODES, openMode } from "./modes";

  let { kind }: { kind: "note-finder" | "interval-recall" } = $props();
  // svelte-ignore state_referenced_locally
  const isRecall = kind === "interval-recall";

  const REVEAL_MS = 900;
  /** After a wrong answer the lit places stay long enough to read; Next skips the wait. */
  const WRONG_MS = 2000;
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
    /** Where it was played, when the input knows (an on-screen tap). */
    string?: number;
    fret?: number;
  }
  /** A string by the letter the neck shows beside it ("A string"); two strings with one letter say high or low. */
  const stringName = (n: number) => {
    const letter = (m: number) => noteName(m, "flat", false);
    const open = tuning.openStrings;
    const twin = open.findIndex((m, i) => i !== n - 1 && letter(m) === letter(open[n - 1]));
    return `${twin < 0 ? "" : open[n - 1] > open[twin] ? "high " : "low "}${letter(open[n - 1])} string`;
  };
  /** What was played, in plain words: the note without its octave, and where on the neck when known. */
  const playedText = (a: { midi: number; string?: number; fret?: number }) =>
    `${noteName(a.midi, "sharp", false)}${a.string !== undefined && a.fret !== undefined ? ` (${stringName(a.string)}, ${a.fret ? `fret ${a.fret}` : "open"})` : ""}`;
  /** The answer that was wanted, as lit on the neck. */
  const wantedText = (q: Question) => `${isRecall ? `${aOrAn(q.label)} up` : q.label} is lit`;

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
      for (const a of question.acceptable)
        // After a right answer the places turn green with a tick in the name; after a wrong one they stay rings, beside the red cross.
        out.push({ string: a.string, fret: a.fret, label: revealing ? noteName(a.midi, "sharp", false) : undefined, state: revealing && answers.at(-1)?.correct ? "correct" : undefined });
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
    answers = [...answers, { q, correct: g.correct, positionVerified: g.positionVerified, midi: e.midi, ms, string: e.string, fret: e.fret }];
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
    const said = playedText({ midi: e.midi, string: e.string, fret: e.fret });
    status = g.correct ? `Yes, ${said}.` : `That was ${said}. ${wantedText(q)}.`;
    revealTimer = setTimeout(goOn, g.correct ? REVEAL_MS : WRONG_MS);
  }

  /** The next question (or the results), when the reveal ends or Next is pressed. */
  function goOn() {
    clearTimeout(revealTimer);
    if (phase !== "running" || !revealing) return;
    if (answers.length >= s.questions) void finish();
    else ask();
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
          ? `All ${right} found${isRecall ? "" : ` between frets ${region.start} and ${to}`}.`
          : `${right} of ${answers.length} found. Look again at the misses below before the next round.`,
      metric: `${right}/${answers.length}`,
      metricLabel: "found",
      delta: fin.delta,
      best: fin.best,
      clean: mode === "check" && right === answers.length && answers.length > 0,
      cleanMeans: "every note found",
      xp: fin.xp,
      // The skill map has no ukulele interval skill yet: say that instead of the mode's line, which would claim it counts.
      ...(isRecall && instr === "ukulele" ? { assistance: "No ukulele interval skill yet: this run is kept as practice history, not counted toward your skill scores." } : { mode }),
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
  /** Beside Stop on a phone: what to find now. */
  const cue = $derived(phase === "running" && question && !revealing ? (isRecall ? `Find ${aOrAn(question.label)} up from the square` : `Find ${question.label}, frets ${region.start} to ${to}`) : "");
  const wrongShown = $derived(phase === "running" && revealing && answers.at(-1)?.correct === false);
</script>

<DrillShell
  lesson={{ lessons: fretboardLessons(kind, instr, tuning.openStrings) }}
  title={isRecall ? "Interval recall" : "Note finder"}
  hue={instr}
  blurb={isRecall
    ? "From the square, find the note a set interval up, inside a five-fret window."
    : "A note is named. Find it on the neck inside a five-fret window, on any string."}
  summary={summaryLine}
  tabs={FRETBOARD_MODES}
  tab={kind}
  ontab={(id) => openMode(FRETBOARD_MODES, id)}
  bind:phase
  bind:mode
  bind:status
  progress={s.questions ? (phase === "running" ? Math.min(1, (answers.length + 1) / s.questions) : answers.length / s.questions) : 0}
  onstart={start}
  onstop={stop}
  {cue}
  step={wrongShown ? { label: "Next", run: goOn } : null}
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
      <Stat label="Found" value="✓ {answers.filter((a) => a.correct).length}  ✕ {missed.length}" />
    {/if}
  {/snippet}

  {#snippet stage()}
    <!-- The prompt fills the room above the neck, centred like a flash card. -->
    <div class="mb-3 flex flex-wrap content-center items-end gap-x-4 gap-y-1 {question ? 'min-h-20' : 'sm:min-h-20'}" data-dock="music">
      {#if question}
        {@const last = revealing ? answers.at(-1) : undefined}
        <p class="font-display text-5xl font-bold leading-none sm:text-6xl" aria-hidden="true">{question.label}</p>
        <p class="pb-1 text-ws-stage-soft">{isRecall ? "up from the square, on any string" : `anywhere from fret ${region.start} to ${to}`}</p>
        {#if last && !last.correct}
          <!-- A miss stays up to be read, so it is a sentence in stage ink beside a cross (not small type on a red pill),
               and Next, the one thing to press, is the filled button. The next question also comes by itself. -->
          <p class="mb-0.5 flex min-h-11 items-center gap-2 rounded-xl border border-destructive/60 bg-destructive/15 px-3 py-1 font-semibold text-ws-stage-ink" aria-live="polite" data-testid="verdict" data-verdict="wrong" data-verdict-key={answers.length}>
            <span class="grid size-6 flex-none place-items-center rounded-full bg-destructive text-[color:var(--on-destructive)]" aria-hidden="true"><X class="size-4" strokeWidth={3} /></span>
            That was {playedText(last)}. {wantedText(last.q)}.
          </p>
          <button type="button" class="{btnPrimary} mb-0.5 max-sm:hidden" onclick={goOn}>Next</button>
        {:else}
          <Verdict kind={last ? "right" : null} text={last ? `Yes, ${playedText(last)}` : undefined} key={answers.length} class="pb-1" />
        {/if}
      {:else}
        <!-- On a phone the blurb above says this: the whole neck fits above Start instead. -->
        <p class="max-w-prose text-ws-stage-soft max-sm:hidden">
          {isRecall ? "A square marks the starting note. Find the interval above it; sounding the square first is fine." : "A note name appears here. Tap it on the neck, or play it."}
          {mode === "check" ? " Check hides the answers." : " Practice lights the answers."}
        </p>
      {/if}
    </div>
    <!-- Where the window sits on the whole neck: the nut at the left, the five frets lit. -->
    <div class="mb-2 flex items-center gap-3 text-sm text-ws-stage-soft {phase === 'ready' ? 'max-sm:hidden' : ''}" data-testid="neck-map">
      <span class="shrink-0">Frets {region.start} to {to} of {tuning.fretCount}</span>
      <div class="relative h-3 max-w-72 flex-1 rounded-full bg-ws-stage-ink/15" aria-hidden="true">
        <span class="absolute inset-y-0 left-0 w-1 rounded-l-full bg-ws-stage-ink/60"></span>
        {#each [3, 5, 7, 9, 12, 15].filter((f) => f <= tuning.fretCount) as f (f)}
          <span class="absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ws-stage-ink/50" style:left="{((f - 0.5) / tuning.fretCount) * 100}%"></span>
        {/each}
        <span class="absolute inset-y-0 rounded-full bg-instr" style:left="{(Math.max(0, region.start - 1) / tuning.fretCount) * 100}%" style:width="{((to - Math.max(0, region.start - 1)) / tuning.fretCount) * 100}%"></span>
      </div>
    </div>
    <div class="flex flex-col justify-end" data-dock="instrument"><Fretboard openStrings={tuning.openStrings} from={region.start} {to} {marks} {flashes} compact={phase !== "running"} label="{instr === 'ukulele' ? 'Ukulele' : 'Guitar'} fretboard" /></div>
    <div class="mt-3"><MicPanel disabled={phase === "running"} offer={phase !== "ready"} hint="Optional: answer on your instrument into the microphone, or tap the neck here." /></div>
  {/snippet}

  {#snippet results()}
    {#if summary}
      <!-- The misses, each with what was played instead: the round to look at again. -->
      {#snippet figure()}
        <div class="flex flex-col gap-2" data-testid="finder-misses">
          <p class="text-sm font-semibold">Missed</p>
          <ul class="flex flex-col gap-1.5 text-sm">
            {#each missed as a, i (i)}
              <li class="flex flex-wrap items-baseline gap-x-2">
                <span class="font-semibold">{isRecall ? `${a.q.label} from ${noteName(a.q.anchor!.midi, "sharp", false)}` : a.q.label}</span>
                <span class="text-ws-soft">you played {playedText(a)}</span>
              </li>
            {/each}
          </ul>
        </div>
      {/snippet}
      <Results {summary} figure={missed.length ? figure : undefined} />
    {/if}
  {/snippet}
</DrillShell>

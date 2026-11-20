<script lang="ts">
  // Note finder and Interval recall: find a note inside a five-fret window.
  // Binary per question; no timing or fingering is assessed. The string and fret
  // are verified only for on-screen taps (MIDI and the microphone carry pitch).
  import { m } from "@repo/i18n/messages.js";
  import { onDestroy } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
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
  import { assistanceFor, capture, runInstrument, tuningText, type Capture } from "#lib/music/drill.svelte.ts";
  import { nearMiss } from "@repo/music-core/signal/pitch";
  import { nextRun } from "#lib/music/advance.svelte.ts";
  import { practice } from "#lib/music/practice.svelte.ts";
  import { mic } from "#lib/music/runtime/index.ts";
  import { exerciseFor, skillsFor } from "./fretted";
  import { fretted, tuningFor } from "./instrument.svelte";
  import MicPanel from "./MicPanel.svelte";
  import Verdict from "#lib/music/components/Verdict.svelte";
  import { btnPrimary } from "#lib/music/components/ui.ts";
  import X from "@lucide/svelte/icons/x";
  import { FRETBOARD_MODES, openMode } from "./modes";
  import { formatNumber } from "@repo/i18n/format";

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
  const intervalLabel = (st: number) => RECALL_INTERVALS.find((i) => i.semitones === st)?.label ?? m.music_strings_semitones({ count: st });
  /** The interval inside a sentence, with its article: "a major third", "an octave". */
  const IV_TEXT: Record<number, () => string> = {
    3: m.music_strings_find_iv_minor_third,
    4: m.music_strings_find_iv_major_third,
    7: m.music_strings_find_iv_perfect_fifth,
    12: m.music_strings_find_iv_octave,
  };
  const ivPhrase = (q: { semitones?: number; label: string }) => (q.semitones !== undefined && IV_TEXT[q.semitones]?.()) || q.label.toLowerCase();
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
    const name = letter(open[n - 1]);
    return twin < 0 ? m.music_strings_string_letter({ letter: name }) : open[n - 1] > open[twin] ? m.music_strings_string_letter_high({ letter: name }) : m.music_strings_string_letter_low({ letter: name });
  };
  /** What was played, in plain words: the note without its octave, and where on the neck when known. */
  const playedText = (a: { midi: number; string?: number; fret?: number }) => {
    const note = noteName(a.midi, "sharp", false);
    if (a.string === undefined || a.fret === undefined) return note;
    return a.fret ? m.music_strings_find_played_fret({ note, string: stringName(a.string), fret: a.fret }) : m.music_strings_find_played_open({ note, string: stringName(a.string) });
  };
  /** What was played, then the answer that was wanted, as lit on the neck. */
  const wrongText = (a: { midi: number; string?: number; fret?: number }, q: Question) =>
    isRecall ? m.music_strings_find_wrong_recall({ played: playedText(a), interval: ivPhrase(q) }) : m.music_strings_find_wrong_note({ played: playedText(a), note: q.label });
  /** One decimal, in the player's language. */
  const dec1 = (x: number) => formatNumber(x, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

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
    if (question.anchor) out.push({ string: question.anchor.string, fret: question.anchor.fret, role: "root", spoken: m.music_strings_find_starting_note() });
    if (revealing || (mode === "practice" && phase === "running"))
      for (const a of question.acceptable)
        // After a right answer the places turn green with a tick in the name; after a wrong one they stay rings, beside the red cross.
        out.push({ string: a.string, fret: a.fret, label: revealing ? noteName(a.midi, "sharp", false) : undefined, state: revealing && answers.at(-1)?.correct ? "correct" : undefined });
    return out;
  });

  const summaryLine = $derived(
    [
      ...(isRecall ? [{ text: s.interval ? intervalLabel(s.interval) : m.music_strings_find_mixed_intervals(), focus: "interval" }] : [{ text: m.music_strings_find_named_notes() }]),
      { text: m.music_strings_frets_range({ start: region.start, end: to }), focus: "region" },
      { text: m.music_strings_n_questions({ n: s.questions }), focus: "questions" },
    ],
  );

  function ask() {
    question = nextQuestion();
    revealing = false;
    askedAt = performance.now();
    status = isRecall ? m.music_strings_find_question_recall({ n: answers.length + 1, interval: ivPhrase(question) }) : m.music_strings_find_question_note({ n: answers.length + 1, note: question.label });
  }

  function onNote(e: NoteEvent) {
    if (e.kind !== "noteon" || phase !== "running" || !question || revealing) return;
    // Sounding the anchor first to hear it is not an answer.
    if (question.anchor && e.midi === question.anchor.midi) return;
    const q = question;
    // A quarter tone off rounds to the next note: that is the tuning, not a wrong answer, so ask again.
    if (e.source === "audio" && !q.acceptable.some((a) => a.midi === e.midi)) {
      const miss = nearMiss(e.midi, e.cents, [...new Set(q.acceptable.map((a) => a.midi))]);
      if (miss) return void (status = m.music_strings_find_play_again({ tuning: tuningText(miss, e.midi, instr) }));
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
    const played = { midi: e.midi, string: e.string, fret: e.fret };
    status = g.correct ? m.music_strings_find_yes({ played: playedText(played) }) : wrongText(played, q);
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
    const fin = await run!.finish({ score, correct, headline: m.music_strings_find_run_headline({ n: right, total: answers.length }) });
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
          return mine.length ? [{ label: iv.label, value: mine.filter((a) => a.correct).length / mine.length, text: m.music_strings_n_of_total({ n: mine.filter((a) => a.correct).length, total: mine.length }) }] : [];
        })
      : [];
    summary = {
      headline:
        right === answers.length
          ? isRecall
            ? m.music_strings_find_all({ n: right })
            : m.music_strings_find_all_between({ n: right, start: region.start, end: to })
          : m.music_strings_find_some({ n: right, total: answers.length }),
      metric: `${right}/${answers.length}`,
      metricLabel: m.music_strings_found_lower(),
      delta: fin.delta,
      best: fin.best,
      clean: mode === "check" && right === answers.length && answers.length > 0,
      cleanMeans: m.music_strings_find_clean_means(),
      xp: fin.xp,
      // The skill map has no ukulele interval skill yet: say that instead of the mode's line, which would claim it counts.
      ...(isRecall && instr === "ukulele" ? { assistance: m.music_strings_find_ukulele_no_skill() } : { mode }),
      rows: [
        { label: m.music_strings_found(), value: score, text: m.music_strings_n_of_total({ n: right, total: answers.length }) },
        ...perInterval,
        { label: m.music_strings_find_mean_time(), text: m.music_strings_seconds_short({ s: dec1(meanMs / 1000) }) },
        taps.length === answers.length && taps.length
          ? { label: m.music_strings_find_on_lit(), value: taps.filter((a) => a.positionVerified).length / taps.length, text: m.music_strings_n_of_total({ n: taps.filter((a) => a.positionVerified).length, total: taps.length }) }
          : { label: m.music_strings_find_string_fret(), notMeasured: true },
        { label: m.music_strings_find_timing_fingering(), notMeasured: true },
      ],
      // The regions up the neck, low to high.
      advance: answers.length
        ? await nextRun(`${instr}.${kind}.${tuning.id}${isRecall ? `.i${s.interval}` : ""}`, { steps: RECALL_REGIONS.map((r) => ({ label: m.music_strings_frets_range({ start: r.start, end: r.end }) })), step: regionIdx }, { score, correct }, ({ step }) => step !== undefined && cfg.set({ region: step }))
        : undefined,
    };
    status = summary.headline;
  }

  function stop() {
    clearTimeout(revealTimer);
    cap?.stop();
    question = null;
    phase = "ready";
    status = m.music_strings_find_stopped();
    void pending.then(() => (answers.length ? run?.finish({}) : undefined));
  }

  onDestroy(() => {
    clearTimeout(revealTimer);
    cap?.stop();
    mic.stop();
  });

  const missed = $derived(answers.filter((a) => !a.correct));
  /** Beside Stop on a phone: what to find now. */
  const cue = $derived(phase === "running" && question && !revealing ? (isRecall ? m.music_strings_find_cue_recall({ interval: ivPhrase(question) }) : m.music_strings_find_cue_note({ note: question.label, start: region.start, end: to })) : "");
  /** Laptop and tablet landscape: the neck is the stage's growing region and takes the free height. */
  const wide = new MediaQuery("(min-width: 64rem)");
  const wrongShown = $derived(phase === "running" && revealing && answers.at(-1)?.correct === false);
</script>

<DrillShell
  lesson={{ lessons: fretboardLessons(kind, instr, tuning.openStrings) }}
  title={isRecall ? m.music_strings_find_title_recall() : m.music_strings_find_title_note()}
  hue={instr}
  blurb={isRecall
    ? m.music_strings_find_blurb_recall()
    : m.music_strings_find_blurb_note()}
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
  step={wrongShown ? { label: m.music_strings_next_cap(), run: goOn } : null}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Choice label={m.music_strings_find_region()} setupKey="region" options={RECALL_REGIONS.map((r, i) => ({ value: i, label: m.music_strings_frets_range_cap({ start: r.start, end: r.end }) }))} value={regionIdx} onchange={(v) => cfg.set({ region: v })} />
      {#if isRecall}
        <Choice
          label={m.music_strings_interval()}
          setupKey="interval"
          options={[...RECALL_INTERVALS.map((i) => ({ value: i.semitones as number, label: i.label })), { value: 0, label: m.music_strings_mixed() }]}
          value={s.interval}
          onchange={(v) => cfg.set({ interval: v })}
        />
      {/if}
      <Choice
        label={m.music_strings_questions()}
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
      <Stat label={m.music_strings_question()} value={m.music_strings_n_of_total({ n: Math.min(answers.length + 1, s.questions), total: s.questions })} />
      <Stat label={m.music_strings_found()} value="✓ {answers.filter((a) => a.correct).length}  ✕ {missed.length}" />
    {/if}
  {/snippet}

  {#snippet stage()}
    <!-- The prompt fills the room above the neck, centred like a flash card. -->
    <div class="mb-3 flex flex-wrap content-center items-end gap-x-4 gap-y-1 {question ? 'min-h-20' : 'sm:min-h-20'}" data-dock="music">
      {#if question}
        {@const last = revealing ? answers.at(-1) : undefined}
        <p class="font-display text-5xl font-bold leading-none sm:text-6xl" aria-hidden="true">{question.label}</p>
        <p class="pb-1 text-ws-stage-soft">{isRecall ? m.music_strings_find_up_any() : m.music_strings_find_anywhere({ start: region.start, end: to })}</p>
        {#if last && !last.correct}
          <!-- A miss stays up to be read, so it is a sentence in stage ink beside a cross (not small type on a red pill),
               and Next, the one thing to press, is the filled button. The next question also comes by itself. -->
          <p class="mb-0.5 flex min-h-11 items-center gap-2 rounded-xl border border-destructive/60 bg-destructive/15 px-3 py-1 font-semibold text-ws-stage-ink" aria-live="polite" data-testid="verdict" data-verdict="wrong" data-verdict-key={answers.length}>
            <span class="grid size-6 flex-none place-items-center rounded-full bg-destructive text-[color:var(--on-destructive)]" aria-hidden="true"><X class="size-4" strokeWidth={3} /></span>
            {wrongText(last, last.q)}
          </p>
          <button type="button" class="{btnPrimary} mb-0.5 max-sm:hidden" onclick={goOn}>{m.music_strings_next_cap()}</button>
        {:else}
          <Verdict kind={last ? "right" : null} text={last ? m.music_strings_find_yes_verdict({ played: playedText(last) }) : undefined} key={answers.length} class="pb-1" />
        {/if}
      {:else}
        <!-- On a phone the blurb above says this: the whole neck fits above Start instead. -->
        <p class="max-w-prose text-ws-stage-soft max-sm:hidden">
          {isRecall ? m.music_strings_find_intro_recall() : m.music_strings_find_intro_note()}
          {mode === "check" ? ` ${m.music_strings_find_check_hides()}` : ` ${m.music_strings_find_practice_lights()}`}
        </p>
      {/if}
    </div>
    <!-- Where the window sits on the whole neck: the nut at the left, the five frets lit. -->
    <div class="mb-2 flex items-center gap-3 text-sm text-ws-stage-soft {phase === 'ready' ? 'max-sm:hidden' : ''}" data-testid="neck-map">
      <span class="shrink-0">{m.music_strings_find_window({ start: region.start, end: to, total: tuning.fretCount })}</span>
      <div class="relative h-3 max-w-72 flex-1 rounded-full bg-ws-stage-ink/15" aria-hidden="true">
        <span class="absolute inset-y-0 left-0 w-1 rounded-l-full bg-ws-stage-ink/60"></span>
        {#each [3, 5, 7, 9, 12, 15].filter((f) => f <= tuning.fretCount) as f (f)}
          <span class="absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ws-stage-ink/50" style:left="{((f - 0.5) / tuning.fretCount) * 100}%"></span>
        {/each}
        <span class="absolute inset-y-0 rounded-full bg-instr" style:left="{(Math.max(0, region.start - 1) / tuning.fretCount) * 100}%" style:width="{((to - Math.max(0, region.start - 1)) / tuning.fretCount) * 100}%"></span>
      </div>
    </div>
    <div class="flex flex-col justify-end" data-dock="instrument" data-grow={wide.current ? "" : undefined}><Fretboard openStrings={tuning.openStrings} from={region.start} {to} {marks} {flashes} compact={phase !== "running"} grow={wide.current} label={instr === "ukulele" ? m.music_strings_board_ukulele() : m.music_strings_board_guitar()} /></div>
    <div class="mt-3"><MicPanel disabled={phase === "running"} offer={phase !== "ready"} hint={m.music_strings_find_mic_hint()} /></div>
  {/snippet}

  {#snippet results()}
    {#if summary}
      <!-- The misses, each with what was played instead: the round to look at again. -->
      {#snippet figure()}
        <div class="flex flex-col gap-2" data-testid="finder-misses">
          <p class="text-sm font-semibold">{m.music_strings_missed()}</p>
          <ul class="flex flex-col gap-1.5 text-sm">
            {#each missed as a, i (i)}
              <li class="flex flex-wrap items-baseline gap-x-2">
                <span class="font-semibold">{isRecall ? m.music_strings_find_interval_from({ interval: a.q.label, note: noteName(a.q.anchor!.midi, "sharp", false) }) : a.q.label}</span>
                <span class="text-ws-soft">{m.music_strings_find_you_played({ played: playedText(a) })}</span>
              </li>
            {/each}
          </ul>
        </div>
      {/snippet}
      <Results {summary} figure={missed.length ? figure : undefined} />
    {/if}
  {/snippet}
</DrillShell>

<script lang="ts">
  // Note-reading flashcards: a note (or triad) on the staff, named by choice or
  // played. Enharmonic spellings are both right. A wrong answer is drawn beside
  // the right one on the staff before the next card.
  import { onDestroy } from "svelte";
  import type { Assistance, InputSource, NoteEvent } from "@repo/music-core";
  import { noteName, parseNote, pc } from "@repo/music-core";
  import { flashcardCorrect, flashcardPrompt, READING_LEVELS, readingLevel, type Clef, type FlashcardPrompt } from "@repo/music-core/content/reading";
  import { CHOICE_NAMES, keyByName, KEY_SIGNATURES } from "@repo/music-core/theory/spelling";
  import { gradeFlashcard } from "@repo/music-core/scoring/reading";
  import { rng } from "@repo/music-core/content/random";
  import type { ReadingLevelId, Tuning } from "@repo/music-core/data/index";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "$lib/music/components/DrillShell.svelte";
  import Piano from "$lib/music/components/Piano.svelte";
  import InstrumentStage from "$lib/music/components/InstrumentStage.svelte";
  import { AEROPHONE_RANGE } from "@repo/music-core/content/winds-pads";
  import Fretboard from "$lib/music/components/Fretboard.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { type RunSummary } from "$lib/music/components/Results.svelte";
  import { Flashes } from "$lib/music/components/feedback.svelte";
  import { btn, btnStage } from "$lib/music/components/ui";
  import Staff from "$lib/music/notation/Staff.svelte";
  import type { DrillSetup } from "$lib/music/setup.svelte";
  import { assistanceFor, assistanceText, capture, pct, runInstrument, runSource, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { nextRun } from "$lib/music/advance.svelte";
  import { mic } from "$lib/music/runtime";
  import { catalogEntry } from "@repo/music-core/content/catalog";
  import { clampRange, comparisonScore, flashcardScore, playableWrittenRange, type ReadingSetup } from "./reading";
  import SetupFields from "./SetupFields.svelte";

  interface Props {
    cfg: DrillSetup<ReadingSetup>;
    instrument: "piano" | "guitar" | "ukulele" | "aerophone";
    tuning: Tuning | null;
  }
  let { cfg, instrument, tuning }: Props = $props();

  const s = $derived(cfg.value);
  const key = $derived(keyByName(s.key) ?? KEY_SIGNATURES[0]);
  const level = $derived(readingLevel((["primer", "level-1", "level-2", "level-3"].includes(s.level) ? s.level : "primer") as ReadingLevelId));
  const fretted = $derived(instrument !== "piano" && !!tuning);
  // The Aerophone reads one treble line in its own written range, by exact pitch like the piano.
  const aero = $derived(instrument === "aerophone");
  const clefs = $derived<Clef[]>(fretted || aero ? ["treble"] : s.clefs.split(",").filter((c): c is Clef => c === "treble" || c === "bass"));
  const range = $derived(fretted ? clampRange([s.low, s.high], playableWrittenRange(tuning!)) : aero ? clampRange([s.low, s.high], [AEROPHONE_RANGE.lowestMidi, AEROPHONE_RANGE.highestMidi]) : clampRange([s.low, s.high], [21, 108]));
  const transpose = $derived(fretted ? tuning!.notationTransposition : 0);
  const byPlay = $derived(s.answer === "play");
  const useMic = $derived(byPlay && fretted && s.input === "mic");
  const kind = $derived<"note" | "chord">(s.kind === "chord" ? "chord" : "note");

  const LENGTH = 10;
  const rand = rng(Math.floor(Math.random() * 2 ** 31));
  const entry = catalogEntry("reading")!;
  const modeDef = entry.modes.find((m) => m.id === "flashcards")!;

  let phase = $state<Phase>("ready");
  let mode = $state<DrillMode>("practice");
  let status = $state("");
  let cards = $state.raw<FlashcardPrompt[]>([]);
  let qi = $state(0);
  let answered = $state<{ correct: boolean; submitted: number[]; name: string } | null>(null);
  let answers = $state<{ prompt: FlashcardPrompt; correct: boolean }[]>([]);
  let hinted = $state(false);
  let anyHint = false;
  let summary = $state<RunSummary | null>(null);
  let queued: FlashcardPrompt[] | null = null;
  let retrying = false;
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let cap: Capture | null = null;
  let shownAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let chordTimer: ReturnType<typeof setTimeout> | undefined;
  let played: number[] = [];
  const flashes = new Flashes();

  const preview = $derived(flashcardPrompt(rng(7), { kind, clefs: clefs.length ? clefs : ["treble"], key: key.name, range, difficulty: level.recommendedDifficulty }));
  const card = $derived(phase === "running" ? cards[qi] : preview);
  const staffScore = $derived(card ? (answered && !answered.correct ? comparisonScore(card, answered.submitted, key.fifths) : flashcardScore(card, key.fifths)) : null);
  const choices = $derived(card ? (kind === "note" ? [...CHOICE_NAMES] : card.choices) : []);
  // Written-to-sounding for the surfaces (guitar reads an octave up).
  const low = $derived(Math.floor((range[0] + transpose - 2) / 12) * 12);
  const high = $derived(Math.max(low + 24, Math.ceil((range[1] + transpose + 2) / 12) * 12));

  // With the octave when the answer was played (the staff names an octave).
  const fullName = (p: FlashcardPrompt) => (byPlay ? p.midi.map((m) => noteName(m, key.fifths < 0 ? "flat" : "sharp")).join("-") : p.answer);
  const expectedName = $derived(card ? fullName(card) : "");

  function makeCards() {
    return Array.from({ length: LENGTH }, () => flashcardPrompt(rand, { kind, clefs: clefs.length ? clefs : ["treble"], key: key.name, range, difficulty: level.recommendedDifficulty }));
  }

  async function start(_ctx: RunContext) {
    clearTimeout(timer);
    summary = null;
    answers = [];
    anyHint = false;
    retrying = !!queued;
    cards = queued ?? makeCards();
    queued = null;
    if (useMic && !(await mic.start())) {
      phase = "ready";
      status = mic.error || "The microphone could not start.";
      return;
    }
    run = practice.beginRun({
      exerciseId: modeDef.exerciseId,
      setupKey: `flash|${instrument}|${kind}|${clefs.join(",")}|${key.name}|${range.join("-")}|${s.answer}`,
      skillIds: modeDef.skillIds,
      capabilities: ["reading"],
      modality: "read",
      assistance: assistanceFor(mode),
      difficulty: level.recommendedDifficulty,
      instrument: byPlay ? instrument : undefined,
      params: { instrument, kind, key: key.name, answer: s.answer, low: range[0], high: range[1] },
    });
    cap = capture(performance.now(), (e) => e.kind === "noteon" && onNote(e));
    show(0);
  }

  function show(i: number) {
    qi = i;
    answered = null;
    hinted = false;
    played = [];
    shownAt = performance.now();
    status = `Card ${i + 1} of ${cards.length}. ${byPlay ? "Play it." : "Name it."}`;
  }

  function onNote(e: NoteEvent) {
    if (phase !== "running" || answered || !byPlay || e.at < shownAt) return;
    if (useMic ? e.source !== "audio" : e.source === "audio") return;
    played.push(e.midi - transpose);
    if (e.string && e.fret !== undefined) flashes.add(e.string * 100 + e.fret, cards[qi].midi.some((m) => pc(m) === pc(e.midi - transpose)) ? "correct" : "wrong");
    else flashes.add(e.midi, cards[qi].midi.map((m) => m + transpose).includes(e.midi) ? "correct" : "wrong");
    clearTimeout(chordTimer);
    const need = cards[qi].midi.length;
    if (need === 1) void answer(played.slice(0, 1));
    else if (new Set(played.map(pc)).size >= need) chordTimer = setTimeout(() => void answer([...played]), 300);
  }

  async function answer(response: string | number[]) {
    const p = cards[qi];
    if (!p || answered) return;
    const g = gradeFlashcard(p.midi, response);
    // Played on piano: the exact key (the staff names an octave). Fretted: pitch class,
    // since the same note sits in several places and the mic can slip an octave.
    const correct = typeof response === "string" || instrument === "piano" || aero ? g.correct : flashcardCorrect(p, response);
    const submitted = typeof response === "string" ? response.split("-").map((n) => parseNote(n) ?? 60) : response;
    const name = typeof response === "string" ? response : response.map((m) => noteName(m, key.fifths < 0 ? "flat" : "sharp")).join("-");
    answered = { correct, submitted, name };
    answers = [...answers, { prompt: p, correct }];
    const notes = cap?.notes.filter((n) => n.kind === "noteon" && n.at >= shownAt) ?? [];
    const src: InputSource | "mixed" = typeof response === "string" ? "click" : runSource(notes);
    const assistance: Assistance | undefined = hinted ? "hinted" : undefined;
    status = correct ? `Right: ${p.answer}.` : `You ${typeof response === "string" ? "answered" : "played"} ${name}. It was ${fullName(p)}.`;
    await run?.attempt({
      promptId: p.id,
      correct,
      partialCredit: correct ? 1 : 0,
      metrics: g.metrics,
      source: src,
      target: p.midi,
      response: typeof response === "string" ? response : response,
      latencyMs: Math.round(performance.now() - shownAt),
      skillIds: p.skillIds,
      assistance,
      instrument: typeof response === "string" ? null : (runInstrument(notes, instrument) ?? null),
    });
    timer = setTimeout(next, correct ? 550 : 1800);
  }

  function next() {
    if (phase !== "running") return;
    if (qi + 1 < cards.length) show(qi + 1);
    else void finish();
  }

  function teardown() {
    clearTimeout(timer);
    clearTimeout(chordTimer);
    cap?.stop();
    cap = null;
    if (mic.state === "on") mic.stop();
  }

  const missed = $derived(answers.filter((r) => !r.correct).map((r) => r.prompt));

  async function finish() {
    teardown();
    phase = "results";
    const right = answers.filter((r) => r.correct).length;
    const score = answers.length ? right / answers.length : 0;
    const fin = await run!.finish({ score, correct: right === answers.length, headline: `${right} of ${answers.length}` });
    const byClef = (c: Clef) => answers.filter((r) => r.prompt.clef === c);
    summary = {
      headline:
        right === answers.length
          ? `All ${answers.length} read right.`
          : `${right} of ${answers.length} read right. Missed: ${missed.map((m) => m.answer).join(", ")}.`,
      metric: pct(score),
      metricLabel: "read right",
      delta: fin.delta,
      best: fin.best,
      clean: mode === "check" && right === answers.length,
      xp: fin.xp,
      assistance: assistanceText(mode, anyHint),
      rows: (["treble", "bass"] as const)
        .filter((c) => byClef(c).length)
        .map((c) => ({ label: c === "treble" ? "Treble clef" : "Bass clef", value: byClef(c).filter((r) => r.correct).length / byClef(c).length, text: `${byClef(c).filter((r) => r.correct).length} of ${byClef(c).length}` })),
      // A retry of the missed cards is not the level's run.
      advance: retrying ? undefined : await advanceAfter(score, right === answers.length),
    };
    status = summary.headline;
  }

  /** Untimed: up through the reading levels, each at its own range. */
  function advanceAfter(score: number, correct: boolean) {
    return nextRun(
      `reading.flash.${instrument}.${clefs.join(",")}.${kind}.${s.answer}`,
      { steps: READING_LEVELS.map((l) => ({ label: l.label })), step: READING_LEVELS.findIndex((l) => l.id === level.id) },
      { score, correct },
      ({ step }) => {
        const l = step !== undefined && READING_LEVELS[step];
        if (l) cfg.set({ level: l.id, low: l.recommendedRange.lowestMidi, high: l.recommendedRange.highestMidi });
      },
    );
  }

  function stop() {
    teardown();
    phase = "ready";
    status = "Stopped. Answers already given are saved.";
  }

  function retryMissed() {
    if (!missed.length) return;
    queued = [...missed];
    phase = "running";
    void start({ mode, downbeat: performance.now(), beatMs: 0, bpm: 0, stopClock() {} });
  }

  onDestroy(teardown);

  const summaryLine = $derived(
    `${kind === "note" ? "Single notes" : "Triads"}, ${clefs.join(" and ")} clef, ${key.name}, ${noteName(range[0])} to ${noteName(range[1])}, ${byPlay ? (useMic ? "play into the mic" : "play it") : "name it"}, ${instrument}`,
  );
  const fretMarks = $derived(
    ((mode === "practice" && hinted) || (answered && !answered.correct)) && card && tuning
      ? card.midi.flatMap((m) =>
          tuning.openStrings.flatMap((open, i) => (m + transpose - open >= 0 && m + transpose - open <= 12 ? [{ string: i + 1, fret: m + transpose - open }] : [])),
        )
      : [],
  );
  // A hint, or a wrong answer, lights the right key(s).
  const pianoMarks = $derived(card && ((mode === "practice" && hinted) || (answered && !answered.correct)) ? Object.fromEntries(card.midi.map((m) => [m + transpose, { target: true }])) : {});
</script>

<DrillShell
  title="Note reading"
  hue="reading"
  blurb="Read the note on the staff, then name it or play it."
  summary={summaryLine}
  bind:phase
  bind:mode
  bind:status
  progress={cards.length ? (qi + (answered ? 1 : 0)) / cards.length : 0}
  onstart={start}
  onstop={stop}
>
  {#snippet setup()}
    <SetupFields {cfg} activity="flashcards" {fretted} oneLine={fretted || aero} />
  {/snippet}

  {#snippet hud()}
    {#if phase === "running"}
      <Stat label="Card" value="{qi + 1} of {cards.length}" />
      <Stat label="Right so far" value={answers.filter((r) => r.correct).length} />
    {/if}
  {/snippet}

  {#snippet stage()}
    <div class="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
      <div class="card rounded-2xl p-3" data-answer={card?.answer} data-midi={card?.midi.join(",")} data-state={answered ? (answered.correct ? "right" : "wrong") : "open"}>
        {#if staffScore}
          <!-- One bar engraves at its natural size; zoom makes the card readable at arm's length. -->
          <div class="zoom">
            {#key staffScore.id}
              <Staff score={staffScore} revealLabels={!!answered && !answered.correct} maxHeight="12rem" />
            {/key}
          </div>
        {/if}
        <p class="min-h-7 px-1 text-base font-semibold">
          {#if answered && !answered.correct}
            <span class="glyph wrong" aria-hidden="true">✕</span> You {byPlay ? "played" : "answered"} {answered.name}, it was {expectedName}
          {:else if answered}
            <span class="glyph right" aria-hidden="true">✓</span> {card?.answer}
          {:else if hinted}
            Hint: {card?.answer}
          {:else if phase !== "running"}
            <span class="font-normal text-ws-stage-soft">An example card. Start for ten.</span>
          {/if}
        </p>
      </div>

      <div class="min-w-0">
        {#if !byPlay}
          <div class="grid grid-cols-4 gap-1.5 sm:grid-cols-6" role="group" aria-label="Note names">
            {#each choices as c (c)}
              <button
                type="button"
                class="name min-h-12 rounded-xl text-base font-semibold"
                data-state={answered && c === card?.answer ? "expected" : answered && !answered.correct && c === answered.name ? "answered" : null}
                disabled={phase !== "running" || !!answered}
                onclick={() => void answer(c)}>{c}</button
              >
            {/each}
          </div>
        {:else if useMic}
          <div class="rounded-2xl bg-ws-stage-ink/8 p-4">
            <p class="text-sm text-ws-stage-soft">Play the note on your {instrument}; the microphone listens.</p>
            <p class="mt-1 font-display text-2xl font-semibold tnum">{mic.pitch ? noteName(mic.pitch.midi) : "No pitch yet"}</p>
          </div>
        {:else if fretted && tuning}
          <Fretboard openStrings={tuning.openStrings} from={0} to={12} marks={fretMarks} {flashes} label="{instrument} fretboard" />
        {:else if aero}
          <InstrumentStage instrument="aerophone" line={card?.midi ?? []} marks={pianoMarks} {flashes} />
        {:else}
          <Piano {low} {high} marks={pianoMarks} {flashes} names={mode === "check" ? "none" : "c"} label="Piano keyboard, {noteName(low)} to {noteName(high)}" />
        {/if}
        {#if phase === "running" && mode === "practice" && !answered && !hinted}
          <button type="button" class="{btnStage} mt-3" onclick={() => (hinted = anyHint = true)}>Hint</button>
        {/if}
      </div>
    </div>
  {/snippet}

  {#snippet results()}
    {#if summary}
      <Results {summary}>
        {#snippet actions()}
          {#if missed.length}
            <button type="button" class={btn} onclick={retryMissed}>Practice the notes you missed ({missed.length})</button>
          {/if}
        {/snippet}
      </Results>
    {/if}
  {/snippet}
</DrillShell>

<style>
  .card {
    border: 2px solid transparent;
  }
  .card[data-state="wrong"] {
    border-color: var(--destructive);
  }
  .card[data-state="right"] {
    border-color: var(--success);
  }
  .zoom {
    zoom: 1.7;
  }
  .name {
    background: color-mix(in oklch, var(--ws-stage-ink) 9%, transparent);
    border: 2px solid transparent;
  }
  .name:not(:disabled):hover {
    background: color-mix(in oklch, var(--instr) 25%, transparent);
  }
  .name[data-state="expected"] {
    border-color: var(--success);
  }
  .name[data-state="answered"] {
    border-color: var(--destructive);
    border-style: dashed;
  }
  .glyph {
    display: inline-grid;
    place-items: center;
    width: 1.4rem;
    height: 1.4rem;
    border-radius: 999px;
    color: white;
    font-size: 0.8rem;
  }
  .glyph.wrong {
    background: var(--destructive);
  }
  .glyph.right {
    background: var(--success);
  }
</style>

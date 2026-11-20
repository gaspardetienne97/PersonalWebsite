<script lang="ts">
  // Note-reading flashcards: a note (or triad) on the staff, named by choice or
  // played. Enharmonic spellings are both right. A wrong answer is drawn beside
  // the right one on the staff (marked with a cross) and stays until Next.
  import { onDestroy } from "svelte";
  import type { Assistance, InputSource, NoteEvent } from "@repo/music-core";
  import { noteName, parseNote, pc } from "@repo/music-core";
  import { flashcardCorrect, flashcardDeck, flashcardPrompt, levelsFor, readingLevel, readingLevelId, readingRange, type Clef, type FlashcardKind, type FlashcardPrompt } from "@repo/music-core/content/reading";
  import { keyByName, KEY_SIGNATURES } from "@repo/music-core/theory/spelling";
  import { gradeFlashcard } from "@repo/music-core/scoring/reading";
  import { rng } from "@repo/music-core/content/random";
  import type { Tuning } from "@repo/music-core/data/index";
  import DrillShell, { type DrillMode, type Phase, type RunContext, type SetupClause } from "#lib/music/components/DrillShell.svelte";
  import Piano from "#lib/music/components/Piano.svelte";
  import InstrumentStage from "#lib/music/components/InstrumentStage.svelte";
  import { AEROPHONE_RANGE } from "@repo/music-core/content/winds-pads";
  import { writtenOffset } from "@repo/music-core/theory/transposition";
  import Fretboard from "#lib/music/components/Fretboard.svelte";
  import Stat from "#lib/music/components/Stat.svelte";
  import Results, { silentRun, type RunSummary } from "#lib/music/components/Results.svelte";
  import { Flashes, type CellMarks } from "#lib/music/components/feedback.svelte.ts";
  import { btnPrimary, btnStage } from "#lib/music/components/ui.ts";
  import Staff from "#lib/music/notation/Staff.svelte";
  import type { DrillSetup } from "#lib/music/setup.svelte.ts";
  import { assistanceFor, capture, pct, runInstrument, runSource, type Capture } from "#lib/music/drill.svelte.ts";
  import { practice } from "#lib/music/practice.svelte.ts";
  import { nextRun } from "#lib/music/advance.svelte.ts";
  import { mic, settings } from "#lib/music/runtime/index.ts";
  import { catalogEntry } from "@repo/music-core/content/catalog";
  import { m } from "@repo/i18n/messages.js";
  import { clampRange, clefClause, comparisonScore, flashcardScore, instrumentName, keyboardSpan, keyLabel, missMarks, playableWrittenRange, READING_TABS, type ReadingSetup } from "./reading";
  import SetupFields from "./SetupFields.svelte";
  import { readingLessons } from "@repo/music-core/lessons/reading";

  interface Props {
    cfg: DrillSetup<ReadingSetup>;
    instrument: "piano" | "guitar" | "ukulele" | "aerophone";
    tuning: Tuning | null;
  }
  let { cfg, instrument, tuning }: Props = $props();

  const s = $derived(cfg.value);
  const key = $derived(keyByName(s.key) ?? KEY_SIGNATURES[0]);
  const level = $derived(readingLevel(readingLevelId(s.level)));
  const fretted = $derived(instrument !== "piano" && !!tuning);
  // The Aerophone reads one treble line in its own written range, by exact pitch like the piano.
  const aero = $derived(instrument === "aerophone");
  // Crossed: either clef shows the notes around middle C (the left hand reading treble, the right bass).
  const crossed = $derived(!fretted && !aero && s.clefs === "crossed");
  const clefs = $derived<Clef[]>(fretted || aero ? ["treble"] : crossed ? ["treble", "bass"] : s.clefs.split(",").filter((c): c is Clef => c === "treble" || c === "bass"));
  // The level's range on the clefs (or the notes asked for), inside what the instrument can play.
  const limits = $derived<[number, number]>(fretted ? playableWrittenRange(tuning!) : aero ? [AEROPHONE_RANGE.lowestMidi, AEROPHONE_RANGE.highestMidi] : [21, 108]);
  const levelRange = $derived<[number, number]>(crossed ? [53, 67] : readingRange(level.id, clefs));
  const range = $derived(clampRange([s.low || levelRange[0], s.high || levelRange[1]], limits));
  // Sounding minus written: guitar sounds an octave down, the Aerophone by its reading key.
  const transpose = $derived(-writtenOffset(instrument, settings.value, fretted ? tuning : null));
  const byPlay = $derived(s.answer === "play");
  const useMic = $derived(byPlay && fretted && s.input === "mic");
  const kind = $derived<FlashcardKind>(s.kind === "chord" ? "chord" : s.kind === "satb" && !fretted && !aero ? "satb" : "note");
  const accidentals = $derived(kind === "note" && !!s.accidentals);
  const cardOpts = $derived({ kind, clefs: clefs.length ? clefs : (["treble"] as Clef[]), key: key.name, range, difficulty: level.recommendedDifficulty, accidentals, crossed });

  const LENGTH = 10;
  const rand = rng(Math.floor(Math.random() * 2 ** 31));
  const entry = catalogEntry("reading")!;
  const modeDef = entry.modes.find((md) => md.id === "flashcards")!;

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

  const preview = $derived(flashcardPrompt(rng(7), cardOpts));
  const card = $derived(phase === "running" ? cards[qi] : preview);
  const missedCard = $derived(!!answered && !answered.correct);
  // After a miss the keys say it in the staff's colours and glyphs: the card's note green with a tick,
  // what was played red with a cross, held until the next card.
  $effect(() => {
    if (!missedCard || !card || !answered || fretted) return;
    const want = card.midi.map((n) => n + transpose);
    if (byPlay) for (const n of answered.submitted.map((x) => x + transpose)) if (!want.includes(n)) flashes.add(n, "wrong", 600_000);
    for (const n of want) flashes.add(n, "correct", 600_000);
    return () => flashes.clear();
  });
  const staffScore = $derived(card ? (missedCard && answered ? comparisonScore(card, answered.submitted, key.fifths) : flashcardScore(card, key.fifths)) : null);
  // The card's own choices: the twelve names spelled for the key, or the key's triads.
  const choices = $derived(card?.choices ?? []);
  // Written-to-sounding for the surfaces (guitar reads an octave up).
  const span = $derived(keyboardSpan([range[0] + transpose, range[1] + transpose]));
  const low = $derived(span[0]);
  const high = $derived(span[1]);

  // With the octave when the answer was played (the staff names an octave).
  const fullName = (p: FlashcardPrompt) => (byPlay ? p.midi.map((n) => noteName(n, key.fifths < 0 ? "flat" : "sharp")).join("-") : p.answer);
  const expectedName = $derived(card ? fullName(card) : "");

  function makeCards() {
    return flashcardDeck(rand, cardOpts, LENGTH);
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
      status = mic.error || m.music_drills_reading_mic_error();
      return;
    }
    run = practice.beginRun({
      exerciseId: modeDef.exerciseId,
      setupKey: `flash|${instrument}|${kind}|${crossed ? "crossed" : clefs.join(",")}|${key.name}|${range.join("-")}|${s.answer}${accidentals ? "|accidentals" : ""}`,
      skillIds: modeDef.skillIds,
      capabilities: ["reading"],
      modality: "read",
      assistance: assistanceFor(mode),
      difficulty: level.recommendedDifficulty,
      instrument: byPlay ? instrument : undefined,
      params: { instrument, kind, key: key.name, answer: s.answer, low: range[0], high: range[1], clefs: crossed ? "crossed" : clefs.join(","), accidentals },
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
    status = byPlay ? m.music_drills_reading_flash_status_play({ n: i + 1, total: cards.length }) : m.music_drills_reading_flash_status_name({ n: i + 1, total: cards.length });
  }

  function onNote(e: NoteEvent) {
    if (phase !== "running" || answered || !byPlay || e.at < shownAt) return;
    if (useMic ? e.source !== "audio" : e.source === "audio") return;
    played.push(e.midi - transpose);
    if (e.string && e.fret !== undefined) flashes.add(e.string * 100 + e.fret, cards[qi].midi.some((n) => pc(n) === pc(e.midi - transpose)) ? "correct" : "wrong");
    else flashes.add(e.midi, cards[qi].midi.map((n) => n + transpose).includes(e.midi) ? "correct" : "wrong");
    clearTimeout(chordTimer);
    // A four-part chord doubles its root: three different notes answer it.
    const need = new Set(cards[qi].midi.map(pc)).size;
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
    const name = typeof response === "string" ? response : response.map((n) => noteName(n, key.fifths < 0 ? "flat" : "sharp")).join("-");
    answered = { correct, submitted, name };
    answers = [...answers, { prompt: p, correct }];
    const notes = cap?.notes.filter((n) => n.kind === "noteon" && n.at >= shownAt) ?? [];
    const src: InputSource | "mixed" = typeof response === "string" ? "click" : runSource(notes);
    const assistance: Assistance | undefined = hinted ? "hinted" : undefined;
    status = correct
      ? m.music_drills_reading_flash_right({ answer: p.answer })
      : typeof response === "string"
        ? m.music_drills_reading_flash_wrong_answered({ name, expected: fullName(p) })
        : m.music_drills_reading_flash_wrong_played({ name, expected: fullName(p) });
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
    // A miss waits for Next, so there is time to compare the two notes.
    if (correct) timer = setTimeout(next, 550);
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

  const missed = $derived([...new Map(answers.filter((r) => !r.correct).map((r) => [r.prompt.id, r.prompt])).values()]);
  let nextBtn = $state<HTMLButtonElement>();
  $effect(() => nextBtn?.focus());

  async function finish() {
    teardown();
    phase = "results";
    const right = answers.filter((r) => r.correct).length;
    const score = answers.length ? right / answers.length : 0;
    const fin = await run!.finish({ score, correct: right === answers.length, headline: `${right} of ${answers.length}` });
    if (!fin.heard) {
      summary = silentRun();
      status = summary.headline;
      return;
    }
    const byClef = (c: Clef) => answers.filter((r) => r.prompt.clef === c);
    summary = {
      headline:
        right === answers.length
          ? m.music_drills_reading_flash_all_right({ count: answers.length })
          : m.music_drills_reading_flash_some_right({ right, total: answers.length, missed: missed.map((p) => p.answer).join(", ") }),
      metric: pct(score),
      metricLabel: m.music_drills_reading_flash_metric(),
      delta: fin.delta,
      best: fin.best,
      clean: mode === "check" && right === answers.length,
      cleanMeans: m.music_drills_reading_flash_clean(),
      xp: fin.xp,
      mode,
      hinted: anyHint,
      coach: missed.length ? { label: m.music_drills_reading_retry_missed({ count: missed.length }), run: retryMissed } : undefined,
      rows: (["treble", "bass"] as const)
        .filter((c) => byClef(c).length)
        .map((c) => ({ label: c === "treble" ? m.music_drills_reading_flash_row_treble() : m.music_drills_reading_flash_row_bass(), value: byClef(c).filter((r) => r.correct).length / byClef(c).length, text: m.music_drills_reading_x_of_y({ n: byClef(c).filter((r) => r.correct).length, total: byClef(c).length }) })),
      // A retry of the missed cards is not the level's run.
      advance: retrying ? undefined : await advanceAfter(score, right === answers.length),
    };
    status = summary.headline;
  }

  /** Untimed: up through the reading levels, each at its own range. */
  function advanceAfter(score: number, correct: boolean) {
    return nextRun(
      `reading.flash.${instrument}.${clefs.join(",")}.${kind}.${s.answer}`,
      { steps: levelsFor(instrument).map((l) => ({ label: l.label })), step: levelsFor(instrument).findIndex((l) => l.id === level.id) },
      { score, correct },
      ({ step }) => {
        const l = step !== undefined && levelsFor(instrument)[step];
        if (l) cfg.set({ level: l.id });
      },
    );
  }

  function stop() {
    teardown();
    phase = "ready";
    status = m.music_drills_reading_stopped_saved();
  }

  function retryMissed() {
    if (!missed.length) return;
    queued = [...missed];
    phase = "running";
    void start({ mode, downbeat: performance.now(), beatMs: 0, bpm: 0, stopClock() {} });
  }

  onDestroy(teardown);

  const summaryLine = $derived<SetupClause[]>([
    { text: level.id === "primer" ? m.music_drills_reading_level_clause({ level: level.label }) : level.label, focus: "level" },
    { text: kind === "note" ? (accidentals ? m.music_drills_reading_flash_kind_notes_acc() : m.music_drills_reading_flash_kind_notes()) : kind === "satb" ? m.music_drills_reading_flash_kind_satb() : m.music_drills_reading_flash_kind_triads(), focus: "kind" },
    { text: crossed ? m.music_drills_reading_flash_crossed_clefs() : clefClause(clefs), focus: fretted || aero ? undefined : "clefs" },
    { text: keyLabel(key.name), focus: "key" },
    { text: m.music_drills_reading_flash_range({ low: noteName(range[0]), high: noteName(range[1]) }) },
    { text: byPlay ? (useMic ? m.music_drills_reading_flash_answer_mic() : m.music_drills_reading_flash_answer_play()) : m.music_drills_reading_flash_answer_name(), focus: "answer" },
    { text: instrumentName(instrument) },
  ]);
  const fretMarks = $derived(
    ((mode === "practice" && hinted) || (answered && !answered.correct)) && card && tuning
      ? card.midi.flatMap((n) =>
          tuning.openStrings.flatMap((open, i) => (n + transpose - open >= 0 && n + transpose - open <= 12 ? [{ string: i + 1, fret: n + transpose - open }] : [])),
        )
      : [],
  );
  // A hint lights the right key(s). After a miss the right keys carry a check and the
  // played ones a cross, so the two read apart without colour.
  const pianoMarks = $derived<Record<number, CellMarks>>(
    !card
      ? {}
      : missedCard
        ? missMarks(card.midi.map((n) => n + transpose), byPlay ? answered!.submitted.map((n) => n + transpose) : [])
        : mode === "practice" && hinted
          ? Object.fromEntries(card.midi.map((n) => [n + transpose, { target: true }]))
          : {},
  );
</script>

<DrillShell
  lesson={{ lessons: readingLessons("flashcards", crossed || kind === "satb" || clefs.length > 1 ? "both" : (clefs[0] ?? "treble"), { accidentals, fifths: key.fifths, ...(kind === "note" ? {} : { stack: kind }) }) }}
  title={m.music_drills_reading_flash_title()}
  hue="reading"
  blurb={m.music_drills_reading_flash_blurb()}
  modeNotes={{ practice: m.music_drills_reading_flash_mode_practice(), check: m.music_drills_reading_flash_mode_check() }}
  summary={summaryLine}
  tabs={READING_TABS}
  tab="flashcards"
  ontab={(id) => cfg.set({ activity: id })}
  bind:phase
  bind:mode
  bind:status
  progress={cards.length ? (qi + 1) / cards.length : 0}
  onstart={start}
  onstop={stop}
  cue={phase !== "running" || !card ? "" : answered ? "" : byPlay ? m.music_drills_reading_flash_cue_play() : m.music_drills_reading_flash_cue_name()}
  step={phase === "running" && answered && !answered.correct ? { label: qi + 1 < cards.length ? m.music_drills_reading_flash_next_card() : m.music_drills_reading_see_results(), run: next } : null}
>
  {#snippet setup()}
    <SetupFields {cfg} activity="flashcards" {fretted} oneLine={fretted || aero} {instrument} {limits} />
  {/snippet}

  {#snippet hud()}
    {#if phase === "running"}
      <Stat label={m.music_drills_reading_flash_stat_card()} value={m.music_drills_reading_x_of_y({ n: qi + 1, total: cards.length })} />
      <Stat label={m.music_drills_reading_flash_stat_right()} value={answers.filter((r) => r.correct).length} />
    {/if}
  {/snippet}

  {#snippet stage()}
    <div class="mx-auto flex w-full max-w-3xl flex-col items-center gap-4">
      <div class="card flex w-full max-w-lg flex-col items-stretch justify-center rounded-2xl p-3 text-center" data-dock="music" data-answer={card?.answer} data-midi={card?.midi.join(",")} data-state={answered ? (answered.correct ? "right" : "wrong") : "open"}>
        {#if staffScore}
          <!-- One bar engraves at its natural size; zoom makes the card readable at arm's length. -->
          <div class="zoom" class:sample={phase !== "running"}>
            {#key staffScore.id}
              <!-- After a miss: the card's note (group 0) and what was played (group 1), told apart by a cross, not colour alone. -->
              <Staff score={staffScore} fill="center" time={false} groupStates={missedCard ? { 0: "correct", 1: "wrong" } : {}} maxHeight="12rem" />
            {/key}
          </div>
        {/if}
        <p class="flex min-h-7 flex-wrap items-center justify-center gap-x-6 gap-y-1 px-1 text-base font-semibold" aria-live="polite">
          {#if missedCard && answered}
            <!-- In the staff's order: the card's note first, then what was played. -->
            <span class="inline-flex items-center gap-1.5"><span class="glyph right" aria-hidden="true">✓</span>{m.music_drills_reading_flash_it_was({ name: expectedName })}</span>
            <span class="inline-flex items-center gap-1.5"><span class="glyph wrong" aria-hidden="true">✕</span>{byPlay ? m.music_drills_reading_flash_you_played({ name: answered.name }) : m.music_drills_reading_flash_you_answered({ name: answered.name })}</span>
          {:else if answered}
            <span class="glyph right" aria-hidden="true">✓</span> {card?.answer}
          {:else if hinted}
            {m.music_drills_reading_flash_hint_answer({ answer: card?.answer ?? "" })}
          {:else if phase !== "running"}
            <span class="font-normal text-ws-stage-soft">{m.music_drills_reading_flash_sample({ count: LENGTH })}</span>
          {/if}
        </p>
        {#if phase === "running" && answered && !answered.correct}
          <!-- From sm the card holds Next card; a phone docks it (the shell's step). -->
          <button bind:this={nextBtn} type="button" class="{btnPrimary} mt-2 max-sm:hidden" onclick={next}>{qi + 1 < cards.length ? m.music_drills_reading_flash_next_card() : m.music_drills_reading_see_results()}</button>
        {/if}
        {#if phase === "running" && mode === "practice" && !answered && !hinted}
          <!-- The hint sits on the card it helps with. -->
          <button type="button" class="{btnStage} mx-auto mt-2 border-2 border-ws-stage-ink/40 bg-transparent" onclick={() => (hinted = anyHint = true)}>{m.music_drills_reading_flash_hint_button()}</button>
        {/if}
      </div>

      <!-- The answer surface (names, or the instrument) sits at the bottom of a phone screen. -->
      <div class="w-full min-w-0" data-dock="answers">
        {#if !byPlay}
          <div class="mx-auto grid max-w-xl grid-cols-4 gap-1.5 sm:grid-cols-6" role="group" aria-label={m.music_drills_reading_flash_names_label()}>
            {#each choices as c (c)}
              <button
                type="button"
                class="name min-h-14 rounded-xl text-base font-semibold"
                data-state={answered && c === card?.answer ? "expected" : answered && !answered.correct && c === answered.name ? "answered" : null}
                disabled={phase !== "running" || !!answered}
                onclick={() => void answer(c)}>{c}</button
              >
            {/each}
          </div>
        {:else if useMic}
          <div class="mx-auto max-w-md rounded-2xl bg-ws-stage-ink/8 p-4 text-center">
            <p class="text-sm text-ws-stage-soft">{m.music_drills_reading_flash_mic_prompt({ instrument: instrumentName(instrument) })}</p>
            <p class="mt-1 font-display text-2xl font-semibold tnum">{mic.pitch ? noteName(mic.pitch.midi) : m.music_drills_reading_no_pitch()}</p>
          </div>
        {:else if fretted && tuning}
          <Fretboard openStrings={tuning.openStrings} from={0} to={12} marks={fretMarks} {flashes} label={m.music_drills_reading_fretboard_label({ instrument: instrumentName(instrument) })} />
        {:else if aero}
          <InstrumentStage instrument="aerophone" line={card?.midi.map((n) => n + transpose) ?? []} marks={pianoMarks} {flashes} />
        {:else}
          <Piano {low} {high} marks={pianoMarks} {flashes} names={mode === "check" ? "none" : "c"} spelling={key.fifths < 0 ? "flat" : "sharp"} label={m.music_drills_reading_piano_label({ low: noteName(low), high: noteName(high) })} />
        {/if}
      </div>
    </div>
  {/snippet}

  {#snippet results()}
    {#if summary}
      <Results {summary} />
    {/if}
  {/snippet}
</DrillShell>

<style>
  /* One frame (the stage panel): the green tick and red cross on the staff carry the verdict, no second border. */
  /* The card is the staff's paper (NotationFrame), with a little room above and below. */
  .zoom {
    zoom: 2;
    padding-block: 0.4rem;
    border-radius: 0.5rem;
    background: oklch(0.99 0.004 285);
  }
  /* Before Start the sample card is smaller, so the whole keyboard is in the first screen. */
  .zoom.sample {
    zoom: 1.4;
  }
  :global(.dark) .zoom {
    background: oklch(0.92 0.008 285);
  }
  .zoom :global(.viewport) {
    scrollbar-gutter: auto;
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
  .name[data-state="expected"] {
    background: color-mix(in oklch, var(--success) 22%, transparent);
  }
  .name[data-state="answered"] {
    border-color: var(--destructive);
    background: color-mix(in oklch, var(--destructive) 20%, transparent);
  }
  .glyph {
    display: inline-grid;
    place-items: center;
    width: 1.4rem;
    height: 1.4rem;
    border-radius: 999px;
    color: white;
    font-size: 0.8125rem;
  }
  .glyph.wrong {
    background: var(--destructive);
  }
  .glyph.right {
    background: var(--success);
  }
</style>

<script lang="ts">
  // Circle of fifths, for speed: twenty quick prompts on key signatures, the
  // order of sharps and flats, neighbours, a key's chords or the blank wheel.
  // A right answer inside the target time is fluent; a slow one counts three
  // quarters (still working it out). In Practice the wheel shows after each
  // answer with the rule that gets there; in Check it stays hidden, so the
  // circle is recalled, not read. Analyse a tune is the exception: a whole
  // tune's changes, chord by chord, its key centre and function, untimed.
  import { onDestroy } from "svelte";
  import { page } from "$app/state";
  import {
    analysisPrompts,
    barLabel,
    CIRCLE_MODES,
    chordIn,
    circlePrompt,
    gradeCircle,
    KEY_BANDS,
    type CircleMode,
    type CirclePrompt,
    type KeyBand,
  } from "@repo/music-core/content/circle";
  import { accidentalCount, diatonicChords, keyAt, wheelIndex } from "@repo/music-core/theory/circle";
  import { analysisSheet, ANALYSIS_TUNES, functionLabel, functionRule } from "@repo/music-core/content/analysis";
  import { functionChord } from "@repo/music-core/content/ear";
  import { TUNES } from "@repo/music-core/content/tunes";
  import { circleLessons } from "@repo/music-core/lessons/circle";
  import { catalogEntry } from "@repo/music-core/content/catalog";
  import type { Score } from "@repo/music-core";
  import DrillShell, { type DrillMode, type Phase, type RunContext, type SetupClause } from "#lib/music/components/DrillShell.svelte";
  import Choice from "#lib/music/components/Choice.svelte";
  import Stat from "#lib/music/components/Stat.svelte";
  import Results, { type RunSummary } from "#lib/music/components/Results.svelte";
  import CircleOfFifths from "#lib/music/components/CircleOfFifths.svelte";
  import Staff from "#lib/music/notation/Staff.svelte";
  import { btnPrimary } from "#lib/music/components/ui.ts";
  import { DrillSetup } from "#lib/music/setup.svelte.ts";
  import { assistanceFor, pct } from "#lib/music/drill.svelte.ts";
  import { practice } from "#lib/music/practice.svelte.ts";
  import { nextRun } from "#lib/music/advance.svelte.ts";
  import { audio } from "#lib/music/runtime/index.ts";
  import { m } from "@repo/i18n/messages.js";
  import { formatNumber } from "@repo/i18n/format";

  const LENGTH = 20;
  const tuneName = (id: string) => TUNES.find((t) => t.id === id)?.name ?? id;
  const entry = catalogEntry("circle")!;
  const cfg = new DrillSetup("circle", { mode: "count" as string, band: "near" as string, minor: "major" as string, clefs: "treble" as string, tune: "tune-autumn-leaves" as string });
  const s = $derived(cfg.value);
  const modeId = $derived((CIRCLE_MODES.find((md) => md.id === s.mode) ?? CIRCLE_MODES[1]).id as CircleMode);
  const meta = $derived(CIRCLE_MODES.find((md) => md.id === modeId)!);
  const band = $derived((KEY_BANDS.find((b) => b.id === s.band) ?? KEY_BANDS[0]).id as KeyBand);
  const clefs = $derived((s.clefs === "both" ? ["treble", "bass"] : [s.clefs === "bass" ? "bass" : "treble"]) as ("treble" | "bass")[]);
  const usesMinor = $derived(modeId === "count" || modeId === "signature");
  const analysing = $derived(modeId === "analysis");
  const tuneId = $derived((ANALYSIS_TUNES as readonly string[]).includes(s.tune) ? s.tune : ANALYSIS_TUNES[0]);
  /** Prompts in a run: 20, or one per chord of the tune. */
  let length = $state(LENGTH);
  /** A tune's prompts, in order; empty for the other modes. */
  let sheet = $state.raw<CirclePrompt[]>([]);
  /** Analysis: the key centre picked so far for this chord (the function answers it). */
  let pickedKey = $state<string | null>(null);
  let pickedFn = $state<string | null>(null);
  /** Analysis: one half of the answer; the second half sends both. */
  function pickHalf(which: "key" | "fn", v: string) {
    if (step !== "answer") return;
    if (which === "key") pickedKey = v;
    else pickedFn = v;
    if (pickedKey && pickedFn) void choose(`${pickedKey}|${pickedFn}`);
  }
  /** The tab row, first steps first; the shell keeps the rest behind "More exercises". */
  const TAB: Record<CircleMode, string> = {
    count: m.music_drills_circle_tab_count(),
    order: m.music_drills_circle_tab_order(),
    signature: m.music_drills_circle_tab_signature(),
    neighbours: m.music_drills_circle_tab_neighbours(),
    wheel: m.music_drills_circle_tab_wheel(),
    chords: m.music_drills_circle_tab_chords(),
    borrowed: m.music_drills_circle_tab_borrowed(),
    secondary: m.music_drills_circle_tab_secondary(),
    analysis: m.music_drills_circle_tab_analysis(),
  };
  const tabs = (Object.keys(TAB) as CircleMode[]).map((id) => ({ id, label: TAB[id] }));
  /** Each key band as the "Up to" button reads it, and as the setup sentence says it. */
  const BAND_TEXT: Record<KeyBand, { label: string; clause: string }> = {
    near: { label: m.music_drills_circle_band_near(), clause: m.music_drills_circle_band_near_clause() },
    two: { label: m.music_drills_circle_band_two(), clause: m.music_drills_circle_band_two_clause() },
    four: { label: m.music_drills_circle_band_four(), clause: m.music_drills_circle_band_four_clause() },
    all: { label: m.music_drills_circle_band_all(), clause: m.music_drills_circle_band_all_clause() },
  };

  let phase = $state<Phase>("ready");
  let mode = $state<DrillMode>("practice");
  let status = $state("");
  let summary = $state<RunSummary | null>(null);
  let current = $state.raw<CirclePrompt | null>(null);
  let qi = $state(0);
  let step = $state<"answer" | "feedback">("answer");
  let records = $state<{ prompt: CirclePrompt; answered: string; ms: number; correct: boolean; slow: boolean; score: number }[]>([]);
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let shownAt = 0;
  let nextTimer: ReturnType<typeof setTimeout> | undefined;
  /** Misses and slow answers by key this run: those keys come back more. */
  let weak: Record<number, number> = {};
  /** A review run: the last run's weak keys (by fifths), weighted to come up most of the time. */
  let review: number[] = [];

  const ask = () => {
    pickedKey = null;
    pickedFn = null;
    const p = analysing ? sheet[qi] : circlePrompt(Math.random, { mode: modeId, band, minor: usesMinor && s.minor === "both", clefs }, (f) => 1 + 2 * (weak[f] ?? 0));
    current = p;
    step = "answer";
    shownAt = performance.now();
    status = m.music_drills_circle_status_ask({ n: qi + 1, total: length, ask: p.ask });
  };

  async function start(_ctx: RunContext) {
    summary = null;
    records = [];
    weak = Object.fromEntries(review.map((f) => [f, 4]));
    review = [];
    qi = 0;
    sheet = analysing ? analysisPrompts(tuneId) : [];
    length = analysing ? sheet.length : LENGTH;
    run = practice.beginRun({
      exerciseId: entry.modes.find((md) => md.id === modeId)!.exerciseId,
      setupKey: analysing ? `${modeId}|${tuneId}` : `${modeId}|${band}|${s.minor}|${s.clefs}`,
      skillIds: ["theory.circle", meta.skillId],
      capabilities: ["reading"],
      modality: "recognized",
      assistance: assistanceFor(mode),
      difficulty: analysing ? 0.7 : Math.min(0.95, 0.15 + KEY_BANDS.findIndex((b) => b.id === band) * 0.2 + (s.minor === "both" ? 0.1 : 0)),
      params: analysing ? { mode: modeId, tune: tuneId } : { mode: modeId, band, minor: s.minor, clefs: s.clefs },
    });
    ask();
  }

  async function choose(t: string) {
    const p = current;
    if (!p || step !== "answer" || phase !== "running") return;
    const ms = Math.round(performance.now() - shownAt);
    const g = gradeCircle(p, t, ms);
    if (!g.correct || g.slow) weak[p.fifths] = (weak[p.fifths] ?? 0) + (g.correct ? 0.5 : 1);
    records = [...records, { prompt: p, answered: t, ms, ...g }];
    step = "feedback";
    await run?.attempt({
      promptId: p.id,
      correct: g.correct,
      partialCredit: g.score,
      metrics: [{ kind: "choice", expected: p.answer, actual: t }],
      source: "click",
      target: p.answer,
      response: t,
      latencyMs: ms,
      skillIds: p.skillIds,
      instrument: null,
    });
    const secs = tenths(ms);
    if (mode === "practice")
      status = g.correct
        ? g.slow
          ? m.music_drills_circle_right_slow({ secs, target: seconds(p.targetMs) })
          : m.music_drills_circle_right_in({ secs })
        : m.music_drills_circle_it_was_rule({ answer: shown(p, p.answer), rule: rule(p) });
    else nextTimer = setTimeout(next, 350);
  }

  function next() {
    clearTimeout(nextTimer);
    if (phase !== "running") return;
    if (qi + 1 >= length) return void finish();
    qi++;
    ask();
  }

  async function finish() {
    clearTimeout(nextTimer);
    phase = "results";
    const right = records.filter((r) => r.correct).length;
    const fluent = records.filter((r) => r.correct && !r.slow).length;
    const score = records.reduce((t, r) => t + r.score, 0) / length;
    const times = records.filter((r) => r.correct).map((r) => r.ms);
    const median = times.length ? [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)] : 0;
    const fin = await run!.finish({ score, correct: fluent === length, headline: analysing ? `${right} of ${length} chords` : `${fluent} of ${length} fluent` });
    // The keys that cost the most: missed, then slow.
    const weakFifths = modeId === "order" || modeId === "wheel" ? [] : [...new Set(records.filter((r) => !r.correct || r.slow).map((r) => r.prompt.fifths))].slice(0, 6);
    const slowKeys = modeId === "order" ? [] : [...new Set(records.filter((r) => !r.correct || r.slow).map((r) => keyName(r.prompt.fifths)))].slice(0, 6);
    // Analysis: which half was missed, and where.
    const half = (i: 0 | 1) => records.filter((r) => r.answered.split("|")[i] === r.prompt.answer.split("|")[i]).length;
    const missedBars = records.filter((r) => !r.correct).map((r) => r.prompt.analysis?.barShort ?? "");
    summary = {
      headline: analysing
        ? right === length
          ? m.music_drills_circle_headline_analysis_all({ count: length, tune: tuneName(tuneId) })
          : m.music_drills_circle_headline_analysis_some({ right, total: length, keys: half(0), fns: half(1) })
        : fluent === length
          ? m.music_drills_circle_headline_all({ count: length })
          : m.music_drills_circle_headline_some({ right, total: length, fluent, secs: seconds(meta.targetMs) }),
      metric: pct(score),
      metricLabel: analysing ? m.music_drills_circle_metric_analysis() : m.music_drills_circle_metric_fluency(),
      delta: fin.delta,
      best: fin.best,
      clean: mode === "check" && fluent === length,
      cleanMeans: analysing ? m.music_drills_circle_clean_analysis() : m.music_drills_circle_clean_fluent({ secs: seconds(meta.targetMs) }),
      // A weak run: one tap asks those keys again, most of the time.
      coach:
        !analysing && weakFifths.length && fluent < length
          ? { label: m.music_drills_circle_review({ keys: weakFifths.slice(0, 3).map(keyName).join(", ") }), run: () => reviewKeys(weakFifths) }
          : undefined,
      xp: fin.xp,
      mode,
      rows: analysing
        ? [
            { label: m.music_drills_circle_row_chords_right(), value: right / length, text: m.music_drills_circle_x_of_y({ n: right, total: length }) },
            { label: m.music_drills_circle_row_key_centres(), value: half(0) / length, text: m.music_drills_circle_x_of_y({ n: half(0), total: length }) },
            { label: m.music_drills_circle_row_functions(), value: half(1) / length, text: m.music_drills_circle_x_of_y({ n: half(1), total: length }) },
            ...(missedBars.length ? [{ label: m.music_drills_circle_row_bars(), text: missedBars.slice(0, 8).join("; ") }] : []),
          ]
        : [
        { label: m.music_drills_circle_row_right(), value: right / length, text: m.music_drills_circle_x_of_y({ n: right, total: length }) },
        { label: m.music_drills_circle_row_within({ secs: seconds(meta.targetMs) }), value: fluent / length, text: m.music_drills_circle_x_of_y({ n: fluent, total: length }) },
        { label: m.music_drills_circle_row_typical(), text: median ? (median < 100 ? m.music_drills_circle_under_tenth() : m.music_drills_circle_secs({ secs: tenths(median) })) : m.music_drills_circle_none_right() },
        ...(slowKeys.length ? [{ label: m.music_drills_circle_row_keys(), text: slowKeys.join(", ") }] : []),
      ],
      routine: page.url.searchParams.get("routine") ? { label: m.music_drills_circle_back_today(), href: "/music" } : undefined,
      // Untimed: wider key bands; the order of sharps and flats has none.
      advance:
        modeId === "order" || analysing
          ? undefined
          : await nextRun(
              `circle.${modeId}.${s.minor}.${s.clefs}`,
              { steps: KEY_BANDS.map((b) => ({ label: BAND_TEXT[b.id].clause })), step: KEY_BANDS.findIndex((b) => b.id === band) },
              { score, correct: fluent === length },
              ({ step }) => step !== undefined && cfg.set({ band: KEY_BANDS[step].id }),
            ),
    };
    status = summary.headline;
    runKeys = records.map((r) => ({ fifths: r.prompt.fifths, ok: r.correct && !r.slow }));
  }
  /** This run's keys for the results wheel: a key with any miss or slow answer is marked to go over. */
  let runKeys = $state.raw<{ fifths: number; ok: boolean }[]>([]);
  const runMarks = $derived.by(() => {
    const out: Record<number, "right" | "wrong"> = {};
    for (const k of runKeys) {
      const i = wheelIndex(k.fifths);
      out[i] = !k.ok || out[i] === "wrong" ? "wrong" : "right";
    }
    return out;
  });
  /** The diminished ring only where an exercise asks about chords. */
  const CHORD_MODES = ["chords", "borrowed", "secondary", "analysis"];

  function reviewKeys(keys: number[]) {
    review = keys;
    phase = "running";
    void start({ mode, downbeat: performance.now(), beatMs: 0, bpm: 0, stopClock() {} });
  }

  function stop() {
    clearTimeout(nextTimer);
    phase = "ready";
    status = m.music_drills_circle_stopped({ count: records.length });
  }

  /** A major key's place on the circle by name ("Eb" is -3), or undefined for anything else. */
  const majorFifths = (name: string) => [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7].find((f) => keyAt(f).major === name);
  /** Practice: a prompt whose answer is a major key is answered on the wheel too (Check draws it blank). */
  const onWheel = (p: CirclePrompt) => mode === "practice" && (p.mode === "count" || p.mode === "signature" || p.mode === "neighbours") && majorFifths(p.answer) !== undefined;
  /** A tapped key sounds its tonic chord. */
  const hearKey = (f: number) => void audio.unlock().then(() => audio.playChord(functionChord(keyAt(f).pc, "I"), 1));
  /** A tap on the wheel: hear the key, and answer with it. */
  function tapKey(p: CirclePrompt, f: number) {
    hearKey(f);
    // One segment holds both spellings (Db and C#): the place is what a tap can say.
    choose(wheelIndex(majorFifths(p.answer)!) === wheelIndex(f) ? p.answer : keyAt(f).major);
  }

  onDestroy(() => clearTimeout(nextTimer));

  function onKey(e: KeyboardEvent) {
    if (phase !== "running" || e.repeat || !current) return;
    if (step === "feedback" && e.key === "Enter" && mode === "practice") return next();
    // 1 to 9 and 0 pick the first ten answers, for speed.
    const n = "1234567890".indexOf(e.key);
    if (step === "answer" && n >= 0 && current.mode !== "wheel" && current.mode !== "analysis" && current.choices[n] !== undefined) choose(current.choices[n]);
  }

  const keyName = (f: number) => `${keyAt(f).major}`;
  /** Seconds to one decimal ("1.4"), and a target's seconds ("2"), in the reader's number format. */
  const tenths = (ms: number) => formatNumber(ms / 1000, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const seconds = (ms: number) => formatNumber(ms / 1000);
  /** An analysis answer ("Ab|V of") as it reads: the key, then the function by its label. */
  const analysisText = (t: string, sep: string) => t.split("|").map((x, i) => (i ? functionLabel(x) : x)).join(sep);
  /** How an answer reads on a button. */
  const shown = (p: CirclePrompt, t: string) => (p.mode === "analysis" ? analysisText(t, ", ") : p.mode === "wheel" ? (Number(t) === 0 ? m.music_drills_circle_wheel_top({ key: keyAt(p.fifths).major }) : m.music_drills_circle_wheel_position({ key: keyAt(p.fifths).major, n: Number(t) + 1 })) : t);
  /** The rule behind the answer, said after a miss. */
  function rule(p: CirclePrompt): string {
    const k = keyAt(p.fifths);
    switch (p.mode) {
      case "order":
        return m.music_drills_circle_rule_order();
      case "count":
      case "signature":
        return p.fifths > 0
          ? m.music_drills_circle_rule_sharps({ key: k.major, count: accidentalCount(p.fifths), list: k.accidentals.join(", "), last: k.accidentals.at(-1) ?? "", minor: k.minor })
          : p.fifths < -1
            ? m.music_drills_circle_rule_flats({ key: k.major, count: accidentalCount(p.fifths), list: k.accidentals.join(", "), prev: k.accidentals.at(-2) ?? "", minor: k.minor })
            : m.music_drills_circle_rule_plain({ key: k.major, count: accidentalCount(p.fifths), minor: k.minor });
      case "neighbours":
        return m.music_drills_circle_rule_neighbours();
      case "chords":
        return m.music_drills_circle_rule_chords({ key: k.major, chords: diatonicChords(p.fifths).map((c) => `${c.numeral} ${c.name}`).join(", ") });
      case "wheel":
        return m.music_drills_circle_rule_wheel();
      case "borrowed":
        return m.music_drills_circle_rule_borrowed({ key: k.major, own: diatonicChords(p.fifths).map((c) => c.name).join(" "), borrowed: ["iv", "bVI", "bVII", "bIII"].map((n) => `${n} ${chordIn(p.fifths, n)}`).join(", ") });
      case "analysis":
        return functionRule(p.answer.split("|")[1]);
      case "secondary":
        return m.music_drills_circle_rule_secondary({ key: k.major, list: ["V/ii", "V/IV", "V/V", "V/vi"].map((n) => `${n} ${chordIn(p.fifths, n)}`).join(", ") });
    }
  }

  const signatureScore = (p: CirclePrompt): Score => sigScore(p.id, p.staff!.fifths, p.staff!.clef);
  const sigScore = (id: string, fifths: number, clef: "treble" | "bass" = "treble"): Score => ({
    id,
    title: m.music_drills_circle_sig_title(),
    bpm: 60,
    keyFifths: fifths,
    meter: { beats: 4, beatUnit: 4 },
    voices: [{ id: "v", name: "Signature", clef, notes: [] }],
    lengthBeats: 4,
  });
  /** After an answer in Practice, the key's signature on a staff: the answer key when it is one, else the prompt's. */
  const SIG_MODES = ["count", "neighbours", "chords", "borrowed", "secondary"];
  /** What to do now, beside Stop on a phone. */
  const cue = $derived(
    phase !== "running" || !current
      ? ""
      : step === "feedback"
        ? ""
        : current.mode === "analysis"
          ? m.music_drills_circle_cue_analysis()
          : current.mode === "wheel"
            ? m.music_drills_circle_cue_wheel()
            : onWheel(current)
              ? m.music_drills_circle_cue_on_wheel()
              : m.music_drills_circle_cue_pick(),
  );
  const chordCount = $derived(analysing ? analysisSheet(TUNES.find((t) => t.id === tuneId)!).length : 0);
  const summaryLine = $derived<SetupClause[]>(
    analysing
      ? [{ text: tuneName(tuneId), focus: "tune" }, { text: m.music_drills_circle_sum_chords({ count: chordCount }) }, { text: m.music_drills_circle_sum_untimed() }]
      : ([
      modeId !== "order" ? { text: BAND_TEXT[band].clause, focus: "band" } : null,
      usesMinor ? { text: s.minor === "both" ? m.music_drills_circle_sum_major_minor() : m.music_drills_circle_sum_major_only(), focus: "minor" } : null,
      modeId === "signature" ? { text: s.clefs === "both" ? m.music_drills_circle_sum_treble_bass() : s.clefs === "bass" ? m.music_drills_circle_sum_bass() : m.music_drills_circle_sum_treble(), focus: "clefs" } : null,
      { text: m.music_drills_circle_sum_questions({ count: length }) },
      { text: m.music_drills_circle_sum_fluent({ secs: seconds(meta.targetMs) }) },
    ] as (SetupClause | null)[]).filter((c): c is SetupClause => !!c),
  );
</script>

<svelte:head><title>{m.music_drills_circle_page_title()}</title></svelte:head>

<!-- The results figure: this run's keys on the wheel, ticked when fast and right, crossed to go over. -->
{#snippet keysFigure()}
  <figure class="circle mx-auto w-full max-w-72 rounded-2xl bg-ws-stage p-3 text-ws-stage-ink">
    <CircleOfFifths numerals={false} dim={false} marks={runMarks} label={m.music_drills_circle_figure_label()} />
    <figcaption class="mt-2 text-center text-sm">{m.music_drills_circle_figure_caption()}</figcaption>
  </figure>
{/snippet}

{#snippet verdict(p: CirclePrompt, r: (typeof records)[number], wheel: boolean)}
  <p class="mt-3 text-lg font-semibold">
    {#if r.correct && p.mode === "analysis"}<span class="verdict" aria-hidden="true">✓</span> {m.music_drills_circle_verdict_right({ answer: shown(p, p.answer) })}
    {:else if r.correct}<span class="verdict" class:slow={r.slow} aria-hidden="true">✓</span> {(r.slow ? m.music_drills_circle_verdict_slow_time : m.music_drills_circle_verdict_right_time)({ answer: shown(p, p.answer), secs: tenths(r.ms) })}
    {:else}<span class="verdict wrong" aria-hidden="true">✕</span> {m.music_drills_circle_verdict_was({ answer: shown(p, p.answer) })}{#if r.answered}{" "}{m.music_drills_circle_verdict_you_said({ answer: shown(p, r.answered) })}{/if}{/if}
  </p>
  {#if mode === "practice"}
    <!-- One order at every width: the verdict, the rule with its signature, then Continue. -->
    <p class="mt-2 text-base text-ws-stage-ink">{rule(p)}</p>
    <div class="mt-3 flex flex-wrap items-start gap-4">
      {#if SIG_MODES.includes(p.mode)}
        {@const f = majorFifths(p.answer) ?? p.fifths}
        <!-- Notation is printed paper in both themes: the staff is the card, its caption on the stage. -->
        <figure class="w-fit">
          <div class="w-40 overflow-hidden rounded-xl"><Staff score={sigScore(`${p.id}-sig`, f)} time={false} maxHeight="6rem" /></div>
          <figcaption class="pt-1 text-center text-sm font-semibold text-ws-stage-ink">{keyAt(f).accidentals.length ? m.music_drills_circle_sig_caption({ key: keyAt(f).major, accidentals: keyAt(f).accidentals.join(" ") }) : m.music_drills_circle_sig_caption_none({ key: keyAt(f).major })}</figcaption>
        </figure>
      {/if}
      {#if wheel}
        <div class="w-full max-w-xs"><CircleOfFifths selected={p.fifths} dim={CHORD_MODES.includes(p.mode)} label={m.music_drills_circle_wheel_label_key()} /></div>
      {/if}
    </div>
    <!-- From sm the card holds Continue; a phone docks it (the shell's step). -->
    <button type="button" class="{btnPrimary} mt-4 min-h-12 w-full max-sm:hidden sm:w-auto sm:min-w-48" onclick={next}>{qi + 1 < length ? m.music_drills_circle_next() : m.music_drills_circle_see_results()} <kbd class="ml-1 text-sm opacity-70 pointer-coarse:hidden">Enter</kbd></button>
  {/if}
{/snippet}

<svelte:window onkeydown={onKey} />

<DrillShell
  title={m.music_drills_circle_title()}
  hue="reading"
  blurb={m.music_drills_circle_blurb()}
  summary={summaryLine}
  {tabs}
  firstTabs={4}
  tab={modeId}
  lesson={{ lessons: circleLessons(modeId) }}
  ontab={(id) => cfg.set({ mode: id })}
  modeNotes={{ practice: m.music_drills_circle_mode_practice(), check: m.music_drills_circle_mode_check() }}
  bind:phase
  bind:mode
  bind:status
  progress={(qi + 1) / length}
  {cue}
  step={phase === "running" && step === "feedback" && mode === "practice" ? { label: qi + 1 < length ? m.music_drills_circle_next() : m.music_drills_circle_see_results(), run: next } : null}
  instrumentFree
  onstart={start}
  onstop={stop}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2">
      {#if analysing}
        <div class="sm:col-span-2">
          <Choice label={m.music_drills_circle_setup_tune()} setupKey="tune" options={ANALYSIS_TUNES.map((id) => ({ value: id, label: tuneName(id) }))} value={tuneId} onchange={(v) => cfg.set({ tune: v })} />
        </div>
      {:else if modeId !== "order"}
        <Choice label={m.music_drills_circle_setup_up_to()} setupKey="band" options={KEY_BANDS.map((b) => ({ value: b.id as KeyBand, label: BAND_TEXT[b.id].label }))} value={band} onchange={(v) => cfg.set({ band: v })} />
      {/if}
      {#if usesMinor}
        <Choice label={m.music_drills_circle_setup_keys_asked()} setupKey="minor" options={[{ value: "major", label: m.music_drills_circle_setup_major() }, { value: "both", label: m.music_drills_circle_setup_major_minor() }]} value={s.minor} onchange={(v) => cfg.set({ minor: v })} />
      {/if}
      {#if modeId === "signature"}
        <Choice label={m.music_drills_circle_setup_clef()} setupKey="clefs" options={[{ value: "treble", label: m.music_drills_circle_setup_treble() }, { value: "bass", label: m.music_drills_circle_setup_bass() }, { value: "both", label: m.music_drills_circle_setup_both() }]} value={s.clefs} onchange={(v) => cfg.set({ clefs: v })} />
      {/if}
    </div>
    {#if analysing}
      <p class="mt-3 text-sm text-ws-soft">
        {m.music_drills_circle_setup_analysis_note()}
      </p>
    {:else}
    <p class="mt-3 text-sm text-ws-soft">
      {@html m.music_drills_circle_setup_note({ link: `<a class="underline underline-offset-4" href="/music/create/reference?section=circle">${m.music_drills_circle_setup_note_link()}</a>` })}
    </p>
    {/if}
  {/snippet}

  {#snippet hud()}
    {#if phase === "running" && current}
      <Stat label={m.music_drills_circle_stat_question()} value={m.music_drills_circle_x_of_y({ n: qi + 1, total: length })} />
      {#if mode === "practice" && analysing}<Stat label={m.music_drills_circle_stat_right()} value={records.filter((r) => r.correct).length} />
      {:else if mode === "practice"}<Stat label={m.music_drills_circle_stat_fast()} value={m.music_drills_circle_x_of_y({ n: records.filter((r) => r.correct && !r.slow).length, total: length })} />{/if}
    {/if}
  {/snippet}

  {#snippet stage()}
    <div class="circle contents">
    {#if phase === "running" && current}
      {@const p = current}
      {@const r = step === "feedback" ? records.at(-1) : undefined}
      <article class="prompt rounded-2xl p-4 sm:p-5" aria-label={m.music_drills_circle_question_n({ n: qi + 1 })} data-mode={p.mode} data-answer={p.answer} data-step={step}>
        <p class="font-display text-2xl font-semibold sm:text-3xl">{p.ask}</p>
        {#if p.staff}
          <div class="mt-3 max-w-64 overflow-hidden rounded-xl"><Staff score={signatureScore(p)} time={false} maxHeight="8rem" /></div>
        {/if}
        {#if p.mode === "wheel"}
          <div class="mt-3">
            <CircleOfFifths
              blank={(slot) => step === "answer" && slot !== 0}
              numerals={false}
              dim={false}
              onpick={step === "answer" ? (f) => (hearKey(f), choose(String(wheelIndex(f)))) : undefined}
              marks={r ? { [Number(p.answer)]: "right", ...(r.correct ? {} : { [Number(r.answered)]: "wrong" }) } : {}}
              label={m.music_drills_circle_blank_wheel_tap()}
            />
          </div>
        {/if}
        {#if p.analysis}
          <!-- The tune's chart: the chord asked is lit; answered chords show the analysis in Practice. -->
          <ol class="chart mt-3 flex flex-wrap gap-1.5" aria-label={m.music_drills_circle_chart_label({ tune: tuneName(p.analysis.tune) })}>
            {#each sheet as c, i (c.id)}
              {@const done = records[i]}
              {@const opens = i === 0 || sheet[i - 1].analysis?.section !== c.analysis?.section}
              <li class="cell rounded-lg px-2 py-1 text-sm" data-state={i === qi ? "current" : done ? (mode === "practice" ? (done.correct ? "right" : "wrong") : "done") : null} aria-current={i === qi ? "step" : undefined}>
                {#if opens}<span class="mr-1 text-sm text-ws-stage-soft">{c.analysis?.section}</span>{/if}
                <span class="font-semibold">{c.analysis?.chord}</span>
                {#if done && mode === "practice" && i !== qi}<span class="block text-sm">{analysisText(c.answer, " ")}</span>{/if}
                <span class="sr-only">, {c.analysis?.bar}</span>
              </li>
            {/each}
          </ol>
        {/if}
        {#if onWheel(p)}
          {@const af = majorFifths(p.answer)!}
          {@const tapped = r && !r.correct ? majorFifths(r.answered) : undefined}
          <!-- The wheel is the answer pad: it stays put, and the verdict comes up beside it. -->
          <div class="mt-3 grid items-start gap-x-6 gap-y-3 sm:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
            <!-- The same size after the answer (its labels stay 13 px or more); Continue is in the phone dock. -->
            <div>
            <CircleOfFifths
              selected={r ? af : null}
              numerals={false}
              dim={false}
              onpick={step === "answer" ? (f) => tapKey(p, f) : undefined}
              marks={r ? { [wheelIndex(af)]: "right", ...(tapped === undefined ? {} : { [wheelIndex(tapped)]: "wrong" }) } : {}}
              label={r ? m.music_drills_circle_wheel_label_key() : m.music_drills_circle_wheel_tap_key()}
            />
            </div>
            {#if r}<div>{@render verdict(p, r, false)}</div>{/if}
          </div>
        {:else if mode === "check" && p.mode !== "wheel" && p.mode !== "analysis"}
          <!-- Check: the same wheel, every wedge blank, so the layout matches Practice and the keys are recalled. -->
          <div class="mt-3 max-w-[20rem]" aria-hidden="true"><CircleOfFifths blank={() => true} numerals={false} dim={false} label={m.music_drills_circle_blank_wheel()} /></div>
        {:else if r}
          {@render verdict(p, r, p.mode !== "wheel")}
        {/if}
      </article>
      {#if p.analysis}
        {@const half = (i: 0 | 1, t: string) => (r && t === p.answer.split("|")[i] ? "expected" : r && t === r.answered.split("|")[i] ? "answered" : (i === 0 ? pickedKey : pickedFn) === t ? "picked" : null)}
        <div class="mt-4 space-y-3" data-dock="answers">
          <div class="grid grid-cols-3 gap-2 sm:grid-cols-6" role="group" aria-label={m.music_drills_circle_group_key_centre()}>
            {#each p.analysis.keys as t (t)}
              <button type="button" class="choice min-h-14 rounded-xl px-2 font-display text-lg font-semibold" data-state={half(0, t)} aria-pressed={pickedKey === t} disabled={step !== "answer"} onclick={() => pickHalf("key", t)}>{t}</button>
            {/each}
          </div>
          <div class="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7" role="group" aria-label={m.music_drills_circle_group_function()}>
            {#each p.choices as t (t)}
              <button type="button" class="choice min-h-14 rounded-xl px-2 font-display text-base font-semibold" data-state={half(1, t)} aria-pressed={pickedFn === t} disabled={step !== "answer"} onclick={() => pickHalf("fn", t)}>{functionLabel(t)}</button>
            {/each}
          </div>
        </div>
      {:else if p.mode !== "wheel"}
        {@const n = p.choices.length}
        {@const short = p.choices.every((t) => t.length <= 4)}
        <!-- Equal columns: five short answers in one row at every width; longer ones two to a row on a phone. -->
        <div class="mt-4 grid gap-2 {n === 5 && short ? 'grid-cols-5' : n <= 5 ? `grid-cols-2 ${n === 3 ? 'sm:grid-cols-3' : n === 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-5'}` : 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-8'}" role="group" aria-label={m.music_drills_circle_group_answers()} data-dock="answers">
          {#each p.choices as t, i (t)}
            {@const state = r && t === p.answer ? "expected" : r && t === r.answered ? "answered" : null}
            <button
              type="button"
              class="choice min-h-14 rounded-xl px-2 font-display text-lg font-semibold {i === n - 1 && n % 2 && !(n === 5 && short) && n <= 5 ? 'max-sm:col-span-2' : ''}"
              data-state={state}
              disabled={step !== "answer"}
              onclick={() => choose(t)}
            >
              {t}{#if state}<span aria-hidden="true">{state === "expected" ? " ✓" : " ✕"}</span>{/if}{#if i < 10}<span class="key" aria-hidden="true">{(i + 1) % 10}</span>{/if}
            </button>
          {/each}
        </div>
      {/if}
    {:else}
      <div class="grid items-center gap-6 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <CircleOfFifths selected={0} numerals={false} dim={CHORD_MODES.includes(modeId)} label={m.music_drills_circle_wheel_label()} />
        <div class="space-y-2">
          <p class="font-display text-xl font-semibold">{meta.title}</p>
          {#if analysing}
            <p class="text-sm text-ws-stage-soft">{m.music_drills_circle_intro_analysis({ tune: tuneName(tuneId) })}</p>
          {:else}
            <p class="text-sm text-ws-stage-soft">{m.music_drills_circle_intro_aim({ blurb: entry.blurb, secs: seconds(meta.targetMs) })}</p>
          {/if}
        </div>
      </div>
    {/if}
    </div>
  {/snippet}

  {#snippet results()}
    {#if summary}<Results {summary} figure={runKeys.length && !analysing && modeId !== "order" ? keysFigure : undefined} />{/if}
  {/snippet}
</DrillShell>

<style>
  /* The wheel sits on the dark stage in both themes: the dark palette always, so each key keeps
     one colour, and the inner rings read at full ink. */
  .circle :global(svg.wheel) {
    --l-major: 0.62;
    --l-minor: 0.5;
    --l-dim: 0.4;
    --l-in: 0.7;
    --l-tonic: 0.84;
    --l-fade: 0.3;
    --ink: oklch(0.98 0.01 280);
    --ink-soft: oklch(0.9 0.02 280);
    --ink-tonic: oklch(0.2 0.03 280);
  }
  .circle :global(svg.wheel .hub) {
    fill: var(--ws-stage);
  }
  .circle :global(svg.wheel .ring) {
    stroke: var(--ws-stage);
  }
  .circle :global(svg.wheel .dim-name) {
    font-size: 16px;
    fill: var(--ink);
  }
  .prompt {
    background: color-mix(in oklch, var(--ws-stage-ink) 7%, transparent);
    border: 1px solid color-mix(in oklch, var(--instr) 30%, transparent);
  }
  .choice {
    position: relative;
    background: color-mix(in oklch, var(--ws-stage-ink) 12%, transparent);
    border: 2px solid color-mix(in oklch, var(--ws-stage-ink) 22%, transparent);
  }
  .choice:not(:disabled):hover {
    background: color-mix(in oklch, var(--instr) 22%, transparent);
  }
  .choice[data-state="picked"] {
    border-color: var(--instr);
  }
  .cell {
    background: color-mix(in oklch, var(--ws-stage-ink) 7%, transparent);
    border: 2px solid transparent;
  }
  .cell[data-state="current"] {
    border-color: var(--instr);
  }
  .cell[data-state="right"] {
    border-color: color-mix(in oklch, var(--success) 60%, transparent);
  }
  .cell[data-state="wrong"] {
    border-color: var(--destructive);
    border-style: dashed;
  }
  /* Answered: a tinted fill, with the check or cross in the verdict and on the wheel. */
  .choice[data-state="expected"] {
    border-color: var(--success);
    background: color-mix(in oklch, var(--success) 24%, transparent);
  }
  .choice[data-state="answered"] {
    border-color: var(--destructive);
    background: color-mix(in oklch, var(--destructive) 22%, transparent);
  }
  .key {
    position: absolute;
    top: 0.2rem;
    right: 0.4rem;
    font-size: 0.8125rem;
    color: var(--ws-stage-soft);
  }
  /* A number key means nothing on a touch screen. */
  @media (pointer: coarse), (max-width: 639px) {
    .key {
      display: none;
    }
  }
  .verdict {
    display: inline-grid;
    place-items: center;
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 999px;
    font-size: 0.9rem;
    color: var(--ws-stage);
    background: var(--success);
  }
  .verdict.slow {
    background: var(--warn);
  }
  .verdict.wrong {
    background: var(--destructive);
  }
</style>

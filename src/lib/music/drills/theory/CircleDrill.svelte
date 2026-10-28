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
  import { analysisSheet, ANALYSIS_TUNES, functionRule } from "@repo/music-core/content/analysis";
  import { TUNES } from "@repo/music-core/content/tunes";
  import { catalogEntry } from "@repo/music-core/content/catalog";
  import type { Score } from "@repo/music-core";
  import DrillShell, { type DrillMode, type Phase, type RunContext, type SetupClause } from "$lib/music/components/DrillShell.svelte";
  import Choice from "$lib/music/components/Choice.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { type RunSummary } from "$lib/music/components/Results.svelte";
  import CircleOfFifths from "$lib/music/components/CircleOfFifths.svelte";
  import Staff from "$lib/music/notation/Staff.svelte";
  import { btnPrimary } from "$lib/music/components/ui";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { assistanceFor, assistanceText, pct } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { nextRun } from "$lib/music/advance.svelte";

  const LENGTH = 20;
  const tuneName = (id: string) => TUNES.find((t) => t.id === id)?.name ?? id;
  const entry = catalogEntry("circle")!;
  const cfg = new DrillSetup("circle", { mode: "count" as string, band: "near" as string, minor: "major" as string, clefs: "treble" as string, tune: "tune-autumn-leaves" as string });
  const s = $derived(cfg.value);
  const modeId = $derived((CIRCLE_MODES.find((m) => m.id === s.mode) ?? CIRCLE_MODES[1]).id as CircleMode);
  const meta = $derived(CIRCLE_MODES.find((m) => m.id === modeId)!);
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
  /** Short names for the tab row. */
  const TAB: Record<CircleMode, string> = { order: "Order", count: "Signatures", signature: "Read it", neighbours: "Neighbours", chords: "Chords", wheel: "Blank wheel", borrowed: "Borrowed", secondary: "V of", analysis: "Analyse" };
  /** Each key band as the "Up to" button reads it, and as the setup sentence says it. */
  const BAND_TEXT: Record<KeyBand, { label: string; clause: string }> = {
    near: { label: "C, G and F", clause: "keys C, G and F" },
    two: { label: "2 sharps or flats", clause: "up to 2 sharps or flats" },
    four: { label: "4 sharps or flats", clause: "up to 4 sharps or flats" },
    all: { label: "All 15 keys", clause: "all 15 keys" },
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

  const ask = () => {
    pickedKey = null;
    pickedFn = null;
    const p = analysing ? sheet[qi] : circlePrompt(Math.random, { mode: modeId, band, minor: usesMinor && s.minor === "both", clefs }, (f) => 1 + 2 * (weak[f] ?? 0));
    current = p;
    step = "answer";
    shownAt = performance.now();
    status = `${qi + 1} of ${length}. ${p.ask}`;
  };

  async function start(_ctx: RunContext) {
    summary = null;
    records = [];
    weak = {};
    qi = 0;
    sheet = analysing ? analysisPrompts(tuneId) : [];
    length = analysing ? sheet.length : LENGTH;
    run = practice.beginRun({
      exerciseId: entry.modes.find((m) => m.id === modeId)!.exerciseId,
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
    const secs = (ms / 1000).toFixed(1);
    if (mode === "practice")
      status = g.correct
        ? g.slow
          ? `Right, in ${secs} s: aim for under ${p.targetMs / 1000} s.`
          : `Right, in ${secs} s.`
        : `It was ${shown(p, p.answer)}. ${rule(p)}`;
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
    const slowKeys = modeId === "order" ? [] : [...new Set(records.filter((r) => !r.correct || r.slow).map((r) => keyName(r.prompt.fifths)))].slice(0, 6);
    // Analysis: which half was missed, and where.
    const half = (i: 0 | 1) => records.filter((r) => r.answered.split("|")[i] === r.prompt.answer.split("|")[i]).length;
    const missedBars = records.filter((r) => !r.correct).map((r) => r.prompt.ask.replace(/:.*$/, "").replace(/^Bars? /, ""));
    summary = {
      headline: analysing
        ? right === length
          ? `All ${length} chords of ${tuneName(tuneId)} right.`
          : `${right} of ${length} chords right: ${half(0)} keys and ${half(1)} functions.`
        : fluent === length
          ? `All ${length} right and fast. Two days like this and it is yours.`
          : `${right} of ${length} right, ${fluent} within ${meta.targetMs / 1000} s.`,
      metric: pct(score),
      metricLabel: analysing ? "analysis" : "fluency",
      delta: fin.delta,
      best: fin.best,
      clean: mode === "check" && fluent === length,
      xp: fin.xp,
      assistance: assistanceText(mode),
      rows: analysing
        ? [
            { label: "Chords right", value: right / length, text: `${right} of ${length}` },
            { label: "Key centres", value: half(0) / length, text: `${half(0)} of ${length}` },
            { label: "Functions", value: half(1) / length, text: `${half(1)} of ${length}` },
            ...(missedBars.length ? [{ label: "Bars to go over", text: missedBars.slice(0, 8).join("; ") }] : []),
          ]
        : [
        { label: "Right", value: right / length, text: `${right} of ${length}` },
        { label: `Within ${meta.targetMs / 1000} s`, value: fluent / length, text: `${fluent} of ${length}` },
        { label: "Typical answer", text: median ? `${(median / 1000).toFixed(1)} s` : "None right yet" },
        ...(slowKeys.length ? [{ label: "Keys to go over", text: slowKeys.join(", ") }] : []),
      ],
      routine: page.url.searchParams.get("routine") ? { label: "Back to today's plan", href: "/music" } : undefined,
      // Untimed: wider key bands; the order of sharps and flats has none.
      advance:
        modeId === "order" || analysing
          ? undefined
          : await nextRun(
              `circle.${modeId}.${s.minor}.${s.clefs}`,
              { steps: KEY_BANDS.map((b) => ({ label: b.title })), step: KEY_BANDS.findIndex((b) => b.id === band) },
              { score, correct: fluent === length },
              ({ step }) => step !== undefined && cfg.set({ band: KEY_BANDS[step].id }),
            ),
    };
    status = summary.headline;
  }

  function stop() {
    clearTimeout(nextTimer);
    phase = "ready";
    status = `Stopped after ${records.length} answers.`;
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
  /** How an answer reads on a button. */
  const shown = (p: CirclePrompt, t: string) => (p.mode === "analysis" ? t.split("|").join(", ") : p.mode === "wheel" ? `${keyAt(p.fifths).major} at ${Number(t) === 0 ? "the top" : `position ${Number(t) + 1}`}` : t);
  /** The rule behind the answer, said after a miss. */
  function rule(p: CirclePrompt): string {
    const k = keyAt(p.fifths);
    switch (p.mode) {
      case "order":
        return "Sharps: Father Charles Goes Down And Ends Battle. Flats: the same backwards (BEAD-GCF).";
      case "count":
      case "signature":
        return p.fifths > 0
          ? `${k.major} major has ${accidentalCount(p.fifths)}: the last sharp, ${k.accidentals.at(-1)}, is a half step below ${k.major}. Its relative minor is ${k.minor}.`
          : p.fifths < -1
            ? `${k.major} major has ${accidentalCount(p.fifths)}: the second-to-last flat, ${k.accidentals.at(-2)}, names the key. Its relative minor is ${k.minor}.`
            : `${k.major} major has ${accidentalCount(p.fifths)}; its relative minor is ${k.minor}.`;
      case "neighbours":
        return "Clockwise adds a sharp (a fifth up); counter-clockwise adds a flat (a fourth up). The relative minor is a minor third below.";
      case "chords":
        return `${k.major} major: ${diatonicChords(p.fifths).map((c) => `${c.numeral} ${c.name}`).join(", ")}. The wedge: IV I V outside, ii vi iii inside.`;
      case "wheel":
        return `From C at the top, clockwise: G D A E B F#, then Db Ab Eb Bb F back to C.`;
      case "borrowed":
        return `${k.major} major's own chords: ${diatonicChords(p.fifths).map((c) => c.name).join(" ")}. Borrowed from ${k.major} minor: ${["iv", "bVI", "bVII", "bIII"].map((n) => `${n} ${chordIn(p.fifths, n)}`).join(", ")}.`;
      case "analysis":
        return functionRule(p.answer.split("|")[1]);
      case "secondary":
        return `A secondary dominant is a dominant seventh a fifth above the chord it leads to. In ${k.major}: ${["V/ii", "V/IV", "V/V", "V/vi"].map((n) => `${n} ${chordIn(p.fifths, n)}`).join(", ")}.`;
    }
  }

  const signatureScore = (p: CirclePrompt): Score => ({
    id: p.id,
    title: "Key signature",
    bpm: 60,
    keyFifths: p.staff!.fifths,
    meter: { beats: 4, beatUnit: 4 },
    voices: [{ id: "v", name: "Signature", clef: p.staff!.clef, notes: [] }],
    lengthBeats: 4,
  });
  const chordCount = $derived(analysing ? analysisSheet(TUNES.find((t) => t.id === tuneId)!).length : 0);
  const summaryLine = $derived<SetupClause[]>(
    analysing
      ? [{ text: tuneName(tuneId), focus: "tune" }, { text: `${chordCount} chords, each section once` }, { text: "untimed" }]
      : [
      modeId !== "order" ? { text: BAND_TEXT[band].clause, focus: "band" } : null,
      usesMinor ? { text: s.minor === "both" ? "major and minor" : "major only", focus: "minor" } : null,
      modeId === "signature" ? { text: s.clefs === "both" ? "treble and bass" : `${s.clefs} clef`, focus: "clefs" } : null,
      { text: `${length} prompts` },
      { text: `aim for ${meta.targetMs / 1000} s` },
    ].filter((c): c is SetupClause => !!c),
  );
</script>

<svelte:head><title>Circle of fifths | Woodshed</title></svelte:head>
<svelte:window onkeydown={onKey} />

<DrillShell
  title="Circle of fifths"
  hue="reading"
  blurb="Key signatures and their order, at speed. Fast and right is fluent; right but slow means you are still working it out."
  summary={summaryLine}
  tabs={CIRCLE_MODES.map((m) => ({ id: m.id, label: TAB[m.id] }))}
  tab={modeId}
  ontab={(id) => cfg.set({ mode: id })}
  modeNotes={{ practice: "The wheel and the rule after each answer.", check: "Wheel hidden, no help. Counts toward mastery." }}
  bind:phase
  bind:mode
  bind:status
  progress={(qi + (step === "feedback" ? 1 : 0)) / length}
  onstart={start}
  onstop={stop}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2">
      {#if analysing}
        <div class="sm:col-span-2">
          <Choice label="Tune" setupKey="tune" options={ANALYSIS_TUNES.map((id) => ({ value: id, label: tuneName(id) }))} value={tuneId} onchange={(v) => cfg.set({ tune: v })} />
        </div>
      {:else if modeId !== "order"}
        <Choice label="Up to" setupKey="band" options={KEY_BANDS.map((b) => ({ value: b.id as KeyBand, label: BAND_TEXT[b.id].label }))} value={band} onchange={(v) => cfg.set({ band: v })} />
      {/if}
      {#if usesMinor}
        <Choice label="Keys asked" setupKey="minor" options={[{ value: "major", label: "Major" }, { value: "both", label: "Major and minor" }]} value={s.minor} onchange={(v) => cfg.set({ minor: v })} />
      {/if}
      {#if modeId === "signature"}
        <Choice label="Clef" setupKey="clefs" options={[{ value: "treble", label: "Treble" }, { value: "bass", label: "Bass" }, { value: "both", label: "Both" }]} value={s.clefs} onchange={(v) => cfg.set({ clefs: v })} />
      {/if}
    </div>
    {#if analysing}
      <p class="mt-3 text-sm text-ws-soft">
        Each chord of the tune, each section once: pick its key centre, then its function there. The analysis follows a few rules: a chord reached from its own V7, tritone sub or backdoor is a new key's I; a ii-V belongs to the key it resolves to; a dominant that resolves to anything else is a V of. After a miss, the rule that applies is shown.
      </p>
    {:else}
    <p class="mt-3 text-sm text-ws-soft">
      Answer with the buttons or the number keys (1 for the first). The <a class="underline underline-offset-4" href="/music/library?tab=reference&section=circle">circle in the Library</a> has every key's signature and chords.
    </p>
    {/if}
  {/snippet}

  {#snippet hud()}
    {#if phase === "running" && current}
      <Stat label="Prompt" value="{qi + 1} of {length}" />
      {#if mode === "practice" && analysing}<Stat label="Right so far" value={records.filter((r) => r.correct).length} />
      {:else if mode === "practice"}<Stat label="Fluent so far" value={records.filter((r) => r.correct && !r.slow).length} />{/if}
    {/if}
  {/snippet}

  {#snippet stage()}
    {#if phase === "running" && current}
      {@const p = current}
      {@const r = step === "feedback" ? records.at(-1) : undefined}
      <article class="prompt rounded-2xl p-4 sm:p-5" aria-label="Prompt {qi + 1}" data-mode={p.mode} data-answer={p.answer} data-step={step}>
        <p class="font-display text-2xl font-semibold sm:text-3xl">{p.ask}</p>
        {#if p.staff}
          <div class="mt-3 max-w-64 rounded-xl bg-ws-surface px-3 pb-1 text-ws-ink"><Staff score={signatureScore(p)} maxHeight="8rem" /></div>
        {/if}
        {#if p.mode === "wheel"}
          <div class="mt-3">
            <CircleOfFifths
              blank={(slot) => step === "answer" && slot !== 0}
              numerals={false}
              onpick={step === "answer" ? (f) => choose(String(wheelIndex(f))) : undefined}
              marks={r ? { [Number(p.answer)]: "right", ...(r.correct ? {} : { [Number(r.answered)]: "wrong" }) } : {}}
              label="A blank circle of fifths: tap where the key goes"
            />
          </div>
        {/if}
        {#if p.analysis}
          <!-- The tune's chart: the chord asked is lit; answered chords show the analysis in Practice. -->
          <ol class="chart mt-3 flex flex-wrap gap-1.5" aria-label="{tuneName(p.analysis.tune)}, the chords to analyse">
            {#each sheet as c, i (c.id)}
              {@const done = records[i]}
              {@const opens = i === 0 || sheet[i - 1].analysis?.section !== c.analysis?.section}
              <li class="cell rounded-lg px-2 py-1 text-sm" data-state={i === qi ? "current" : done ? (mode === "practice" ? (done.correct ? "right" : "wrong") : "done") : null} aria-current={i === qi ? "step" : undefined}>
                {#if opens}<span class="mr-1 text-xs text-ws-stage-soft">{c.analysis?.section}</span>{/if}
                <span class="font-semibold">{c.ask.replace(/^.*: /, "")}</span>
                {#if done && mode === "practice" && i !== qi}<span class="block text-xs">{c.answer.replace("|", " ")}</span>{/if}
                <span class="sr-only">, {c.ask.replace(/:.*$/, "")}</span>
              </li>
            {/each}
          </ol>
        {/if}
        {#if r}
          <p class="mt-3 text-lg font-semibold">
            {#if r.correct && p.mode === "analysis"}<span class="verdict" aria-hidden="true">✓</span> Right: {shown(p, p.answer)}.
            {:else if r.correct}<span class="verdict" class:slow={r.slow} aria-hidden="true">✓</span> {r.slow ? "Right, but slow" : "Right"}: {shown(p, p.answer)}, {(r.ms / 1000).toFixed(1)} s.
            {:else}<span class="verdict wrong" aria-hidden="true">✕</span> It was {shown(p, p.answer)}.{/if}
          </p>
          {#if mode === "practice"}
            <p class="mt-1 text-sm text-ws-stage-soft">{rule(p)}</p>
            {#if p.mode !== "wheel"}
              <div class="mt-3 max-w-xs"><CircleOfFifths selected={p.fifths} label="The circle, with the key of this prompt" /></div>
            {/if}
            <button type="button" class="{btnPrimary} mt-3" onclick={next}>{qi + 1 < length ? "Continue" : "See results"} <kbd class="ml-1 text-xs opacity-70">Enter</kbd></button>
          {/if}
        {/if}
      </article>
      {#if p.analysis}
        {@const half = (i: 0 | 1, t: string) => (r && t === p.answer.split("|")[i] ? "expected" : r && t === r.answered.split("|")[i] ? "answered" : (i === 0 ? pickedKey : pickedFn) === t ? "picked" : null)}
        <div class="mt-4 space-y-3">
          <div class="grid grid-cols-3 gap-2 sm:grid-cols-6" role="group" aria-label="Key centre">
            {#each p.analysis.keys as t (t)}
              <button type="button" class="choice min-h-12 rounded-xl px-2 font-display text-lg font-semibold" data-state={half(0, t)} aria-pressed={pickedKey === t} disabled={step !== "answer"} onclick={() => pickHalf("key", t)}>{t}</button>
            {/each}
          </div>
          <div class="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7" role="group" aria-label="Function">
            {#each p.choices as t (t)}
              <button type="button" class="choice min-h-12 rounded-xl px-2 font-display text-base font-semibold" data-state={half(1, t)} aria-pressed={pickedFn === t} disabled={step !== "answer"} onclick={() => pickHalf("fn", t)}>{t}</button>
            {/each}
          </div>
        </div>
      {:else if p.mode !== "wheel"}
        <div class="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8" role="group" aria-label="Answers">
          {#each p.choices as t, i (t)}
            <button
              type="button"
              class="choice min-h-12 rounded-xl px-2 font-display text-lg font-semibold"
              data-state={r && t === p.answer ? "expected" : r && t === r.answered ? "answered" : null}
              disabled={step !== "answer"}
              onclick={() => choose(t)}
            >
              {t}{#if i < 10}<span class="key" aria-hidden="true">{(i + 1) % 10}</span>{/if}
            </button>
          {/each}
        </div>
      {/if}
    {:else}
      <div class="grid items-center gap-6 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <CircleOfFifths selected={0} numerals={false} label="The circle of fifths" />
        <div class="space-y-2">
          <p class="font-display text-xl font-semibold">{meta.title}</p>
          {#if analysing}
            <p class="text-sm text-ws-stage-soft">{tuneName(tuneId)}, chord by chord: its key centre and its function there, against an analysis worked out by rule. Untimed.</p>
          {:else}
            <p class="text-sm text-ws-stage-soft">{entry.blurb} Aim to answer within {meta.targetMs / 1000} seconds: that is recall, not working it out.</p>
          {/if}
        </div>
      </div>
    {/if}
  {/snippet}

  {#snippet results()}
    {#if summary}<Results {summary} />{/if}
  {/snippet}
</DrillShell>

<style>
  .prompt {
    background: color-mix(in oklch, var(--ws-stage-ink) 7%, transparent);
    border: 1px solid color-mix(in oklch, var(--instr) 30%, transparent);
  }
  .choice {
    position: relative;
    background: color-mix(in oklch, var(--ws-stage-ink) 9%, transparent);
    border: 2px solid transparent;
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
  .choice[data-state="expected"] {
    border-color: var(--success);
  }
  .choice[data-state="answered"] {
    border-color: var(--destructive);
    border-style: dashed;
  }
  .key {
    position: absolute;
    top: 0.2rem;
    right: 0.4rem;
    font-size: 0.65rem;
    opacity: 0.55;
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

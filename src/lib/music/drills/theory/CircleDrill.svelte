<script lang="ts">
  // Circle of fifths, for speed: twenty quick prompts on key signatures, the
  // order of sharps and flats, neighbours, a key's chords or the blank wheel.
  // A right answer inside the target time is fluent; a slow one counts three
  // quarters (still working it out). In Practice the wheel shows after each
  // answer with the rule that gets there; in Check it stays hidden, so the
  // circle is recalled, not read.
  import { onDestroy } from "svelte";
  import { page } from "$app/state";
  import {
    CIRCLE_MODES,
    circlePrompt,
    gradeCircle,
    KEY_BANDS,
    type CircleMode,
    type CirclePrompt,
    type KeyBand,
  } from "@repo/music-core/content/circle";
  import { accidentalCount, diatonicChords, keyAt, wheelIndex } from "@repo/music-core/theory/circle";
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
  const entry = catalogEntry("circle")!;
  const cfg = new DrillSetup("circle", { mode: "count" as string, band: "near" as string, minor: "major" as string, clefs: "treble" as string });
  const s = $derived(cfg.value);
  const modeId = $derived((CIRCLE_MODES.find((m) => m.id === s.mode) ?? CIRCLE_MODES[1]).id as CircleMode);
  const meta = $derived(CIRCLE_MODES.find((m) => m.id === modeId)!);
  const band = $derived((KEY_BANDS.find((b) => b.id === s.band) ?? KEY_BANDS[0]).id as KeyBand);
  const clefs = $derived((s.clefs === "both" ? ["treble", "bass"] : [s.clefs === "bass" ? "bass" : "treble"]) as ("treble" | "bass")[]);
  const usesMinor = $derived(modeId === "count" || modeId === "signature");
  /** Short names for the tab row. */
  const TAB: Record<CircleMode, string> = { order: "Order", count: "Signatures", signature: "Read it", neighbours: "Neighbours", chords: "Chords", wheel: "Blank wheel" };
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
    const p = circlePrompt(Math.random, { mode: modeId, band, minor: usesMinor && s.minor === "both", clefs }, (f) => 1 + 2 * (weak[f] ?? 0));
    current = p;
    step = "answer";
    shownAt = performance.now();
    status = `${qi + 1} of ${LENGTH}. ${p.ask}`;
  };

  async function start(_ctx: RunContext) {
    summary = null;
    records = [];
    weak = {};
    qi = 0;
    run = practice.beginRun({
      exerciseId: entry.modes.find((m) => m.id === modeId)!.exerciseId,
      setupKey: `${modeId}|${band}|${s.minor}|${s.clefs}`,
      skillIds: ["theory.circle", meta.skillId],
      capabilities: ["reading"],
      modality: "recognized",
      assistance: assistanceFor(mode),
      difficulty: Math.min(0.95, 0.15 + KEY_BANDS.findIndex((b) => b.id === band) * 0.2 + (s.minor === "both" ? 0.1 : 0)),
      params: { mode: modeId, band, minor: s.minor, clefs: s.clefs },
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
    if (qi + 1 >= LENGTH) return void finish();
    qi++;
    ask();
  }

  async function finish() {
    clearTimeout(nextTimer);
    phase = "results";
    const right = records.filter((r) => r.correct).length;
    const fluent = records.filter((r) => r.correct && !r.slow).length;
    const score = records.reduce((t, r) => t + r.score, 0) / LENGTH;
    const times = records.filter((r) => r.correct).map((r) => r.ms);
    const median = times.length ? [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)] : 0;
    const fin = await run!.finish({ score, correct: fluent === LENGTH, headline: `${fluent} of ${LENGTH} fluent` });
    // The keys that cost the most: missed, then slow.
    const slowKeys = modeId === "order" ? [] : [...new Set(records.filter((r) => !r.correct || r.slow).map((r) => keyName(r.prompt.fifths)))].slice(0, 6);
    summary = {
      headline:
        fluent === LENGTH
          ? `All ${LENGTH} right and fast. Two days like this and it is yours.`
          : `${right} of ${LENGTH} right, ${fluent} within ${meta.targetMs / 1000} s.`,
      metric: pct(score),
      metricLabel: "fluency",
      delta: fin.delta,
      best: fin.best,
      clean: mode === "check" && fluent === LENGTH,
      xp: fin.xp,
      assistance: assistanceText(mode),
      rows: [
        { label: "Right", value: right / LENGTH, text: `${right} of ${LENGTH}` },
        { label: `Within ${meta.targetMs / 1000} s`, value: fluent / LENGTH, text: `${fluent} of ${LENGTH}` },
        { label: "Typical answer", text: median ? `${(median / 1000).toFixed(1)} s` : "None right yet" },
        ...(slowKeys.length ? [{ label: "Keys to go over", text: slowKeys.join(", ") }] : []),
      ],
      routine: page.url.searchParams.get("routine") ? { label: "Back to today's plan", href: "/music" } : undefined,
      // Untimed: wider key bands; the order of sharps and flats has none.
      advance:
        modeId === "order"
          ? undefined
          : await nextRun(
              `circle.${modeId}.${s.minor}.${s.clefs}`,
              { steps: KEY_BANDS.map((b) => ({ label: b.title })), step: KEY_BANDS.findIndex((b) => b.id === band) },
              { score, correct: fluent === LENGTH },
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
    if (step === "answer" && n >= 0 && current.mode !== "wheel" && current.choices[n] !== undefined) choose(current.choices[n]);
  }

  const keyName = (f: number) => `${keyAt(f).major}`;
  /** How an answer reads on a button. */
  const shown = (p: CirclePrompt, t: string) => (p.mode === "wheel" ? `${keyAt(p.fifths).major} at ${Number(t) === 0 ? "the top" : `position ${Number(t) + 1}`}` : t);
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
  const summaryLine = $derived<SetupClause[]>(
    [
      modeId !== "order" ? { text: BAND_TEXT[band].clause, focus: "band" } : null,
      usesMinor ? { text: s.minor === "both" ? "major and minor" : "major only", focus: "minor" } : null,
      modeId === "signature" ? { text: s.clefs === "both" ? "treble and bass" : `${s.clefs} clef`, focus: "clefs" } : null,
      { text: `${LENGTH} prompts` },
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
  progress={(qi + (step === "feedback" ? 1 : 0)) / LENGTH}
  onstart={start}
  onstop={stop}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2">
      {#if modeId !== "order"}
        <Choice label="Up to" setupKey="band" options={KEY_BANDS.map((b) => ({ value: b.id as KeyBand, label: BAND_TEXT[b.id].label }))} value={band} onchange={(v) => cfg.set({ band: v })} />
      {/if}
      {#if usesMinor}
        <Choice label="Keys asked" setupKey="minor" options={[{ value: "major", label: "Major" }, { value: "both", label: "Major and minor" }]} value={s.minor} onchange={(v) => cfg.set({ minor: v })} />
      {/if}
      {#if modeId === "signature"}
        <Choice label="Clef" setupKey="clefs" options={[{ value: "treble", label: "Treble" }, { value: "bass", label: "Bass" }, { value: "both", label: "Both" }]} value={s.clefs} onchange={(v) => cfg.set({ clefs: v })} />
      {/if}
    </div>
    <p class="mt-3 text-sm text-ws-soft">
      Answer with the buttons or the number keys (1 for the first). The <a class="underline underline-offset-4" href="/music/library?tab=reference&section=circle">circle in the Library</a> has every key's signature and chords.
    </p>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running" && current}
      <Stat label="Prompt" value="{qi + 1} of {LENGTH}" />
      {#if mode === "practice"}<Stat label="Fluent so far" value={records.filter((r) => r.correct && !r.slow).length} />{/if}
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
        {#if r}
          <p class="mt-3 text-lg font-semibold">
            {#if r.correct}<span class="verdict" class:slow={r.slow} aria-hidden="true">✓</span> {r.slow ? "Right, but slow" : "Right"}: {shown(p, p.answer)}, {(r.ms / 1000).toFixed(1)} s.
            {:else}<span class="verdict wrong" aria-hidden="true">✕</span> It was {shown(p, p.answer)}.{/if}
          </p>
          {#if mode === "practice"}
            <p class="mt-1 text-sm text-ws-stage-soft">{rule(p)}</p>
            {#if p.mode !== "wheel"}
              <div class="mt-3 max-w-xs"><CircleOfFifths selected={p.fifths} label="The circle, with the key of this prompt" /></div>
            {/if}
            <button type="button" class="{btnPrimary} mt-3" onclick={next}>{qi + 1 < LENGTH ? "Continue" : "See results"} <kbd class="ml-1 text-xs opacity-70">Enter</kbd></button>
          {/if}
        {/if}
      </article>
      {#if p.mode !== "wheel"}
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
          <p class="text-sm text-ws-stage-soft">{entry.blurb} Aim to answer within {meta.targetMs / 1000} seconds: that is recall, not working it out.</p>
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

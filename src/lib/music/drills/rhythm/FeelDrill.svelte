<script lang="ts">
  // Feel by ear: ten grooves, each straight, swung, a shuffle or in 12/8, to
  // name from where the off-beats fall. Each feel is played by grooves of its
  // kind at their own tempos, so the kit's sound gives nothing away. Practice
  // says what gave it away after each answer; Check moves straight on.
  import { onDestroy } from "svelte";
  import { page } from "$app/state";
  import { FEELS, feelPrompt, type FeelId } from "@repo/music-core/content/pads-studio";
  import { earLessons } from "@repo/music-core/lessons/ear";
  import { grooveTargetsFor } from "@repo/music-core/content/winds-pads";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "#lib/music/components/DrillShell.svelte";
  import { earTrainer } from "#lib/music/drills/ear/trainer.ts";
  import Stat from "#lib/music/components/Stat.svelte";
  import Results, { type RunSummary } from "#lib/music/components/Results.svelte";
  import { btnPrimary, btnStage } from "#lib/music/components/ui.ts";
  import { assistanceFor, pct } from "#lib/music/drill.svelte.ts";
  import { practice } from "#lib/music/practice.svelte.ts";
  import { audio } from "#lib/music/runtime/index.ts";

  const LENGTH = 10;
  const PASS = 8;
  let phase = $state<Phase>("ready");
  let mode = $state<DrillMode>("practice");
  let status = $state("");
  let summary = $state<RunSummary | null>(null);
  let current = $state.raw<ReturnType<typeof feelPrompt> | null>(null);
  let qi = $state(0);
  let step = $state<"answer" | "feedback">("answer");
  let records = $state<{ feel: FeelId; answered: FeelId; correct: boolean }[]>([]);
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let nextTimer: ReturnType<typeof setTimeout> | undefined;
  let playing: { stop(): void } | null = null;

  /** Two bars at least (a one-bar groove plays twice), so the feel settles. */
  function hear(p = current) {
    if (!p) return;
    playing?.stop();
    const g = grooveTargetsFor(p.groove, p.bpm);
    const cycles = Math.max(2, Math.ceil(2 / p.groove.bars));
    const notes = Array.from({ length: cycles }, (_, c) =>
      g.targets.map((t) => ({ midi: t.pad, time: (c * g.lengthMs + t.atMs) / 1000 + 0.05, duration: 0.12, velocity: t.accent ? 0.95 : t.ghost ? 0.3 : 0.65, voice: "drum" as const })),
    ).flat();
    playing = audio.playSequence(notes);
  }

  function ask() {
    current = feelPrompt(Math.random, current?.feel);
    step = "answer";
    status = `${qi + 1} of ${LENGTH}. Straight, swung, a shuffle or 12/8?`;
    hear();
  }

  async function start(_ctx: RunContext) {
    await audio.unlock();
    summary = null;
    records = [];
    qi = 0;
    current = null;
    run = practice.beginRun({
      exerciseId: "ear.rhythm-feel",
      setupKey: "feel",
      skillIds: ["rhythm.subdivisions"],
      capabilities: ["ear", "rhythm"],
      modality: "heard",
      assistance: assistanceFor(mode),
      difficulty: 0.45,
      params: { mode: "feel", questions: LENGTH },
    });
    ask();
  }

  async function choose(id: FeelId) {
    const p = current;
    if (!p || step !== "answer" || phase !== "running") return;
    const correct = id === p.feel;
    records = [...records, { feel: p.feel, answered: id, correct }];
    step = "feedback";
    await run?.attempt({
      promptId: `feel:${p.feel}:${p.groove.value}`,
      correct,
      partialCredit: correct ? 1 : 0,
      metrics: [{ kind: "choice", expected: p.feel, actual: id }],
      source: "click",
      target: p.feel,
      response: id,
      instrument: null,
    });
    const right = FEELS.find((f) => f.id === p.feel)!;
    if (mode === "practice") status = correct ? `Right: ${right.label}. ${right.hint}` : `It was ${right.label}: ${right.hint}`;
    else nextTimer = setTimeout(next, 500);
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
    playing?.stop();
    phase = "results";
    const right = records.filter((r) => r.correct).length;
    const score = right / LENGTH;
    const correct = right >= PASS;
    const fin = await run!.finish({ score, correct, headline: `${right} of ${LENGTH} right` });
    const confused = FEELS.map((f) => ({ f, missed: records.filter((r) => r.feel === f.id && !r.correct) })).filter((x) => x.missed.length);
    summary = {
      headline: correct ? `${right} of ${LENGTH}: you hear the feel.` : `${right} of ${LENGTH} right. A clean run needs ${PASS}.`,
      metric: pct(score),
      metricLabel: "right",
      delta: fin.delta,
      best: fin.best,
      clean: mode === "check" && correct,
      cleanMeans: `${PASS} of ${LENGTH} right or better`,
      xp: fin.xp,
      mode,
      rows: [
        { label: "Right", value: score, text: `${right} of ${LENGTH}` },
        ...confused.map((x) => ({ label: `${x.f.label} heard as`, text: x.missed.map((r) => FEELS.find((f) => f.id === r.answered)!.label).join(", ") })),
      ],
      routine: page.url.searchParams.get("routine") ? { label: "Back to Today", href: "/music" } : undefined,
    };
    status = summary.headline;
  }

  function stop() {
    clearTimeout(nextTimer);
    playing?.stop();
    phase = "ready";
    status = `Stopped after ${records.length} answer${records.length === 1 ? "" : "s"}.`;
  }

  onDestroy(() => {
    clearTimeout(nextTimer);
    playing?.stop();
  });

  function onKey(e: KeyboardEvent) {
    if (phase !== "running" || e.repeat || !current) return;
    if (step === "feedback" && e.key === "Enter" && mode === "practice") return next();
    const n = "1234".indexOf(e.key);
    if (step === "answer" && n >= 0) choose(FEELS[n].id);
  }
</script>

<svelte:head><title>Feel | Woodshed</title></svelte:head>
<svelte:window onkeydown={onKey} />

<DrillShell
  title="Ear"
  trainer={earTrainer("ear-feel")}
  hue="ear"
  blurb="Hear a groove and name its feel: straight, swung, shuffle or 12/8."
  summary={[{ text: `${LENGTH} grooves` }, { text: `${PASS} right for a clean run` }]}
  bind:phase
  bind:mode
  bind:status
  progress={(qi + 1) / LENGTH}
  lesson={{ lessons: earLessons("feel", FEELS.map((f) => f.id)) }}
  onstart={start}
  onstop={stop}
  instrumentFree
  cue={phase !== "running" || !current || step === "feedback" ? "" : "Name the feel you hear"}
  step={phase === "running" && current && step === "feedback" && mode === "practice" ? { label: qi + 1 < LENGTH ? "Next" : "See results", run: next } : null}
>
  {#snippet hud()}
    {#if phase === "running" && current}
      <Stat label="Groove" value="{qi + 1} of {LENGTH}" />
      {#if mode === "practice"}<Stat label="Right so far" value={records.filter((r) => r.correct).length} />{/if}
    {/if}
  {/snippet}

  {#snippet stage()}
    {#if phase === "running" && current}
      {@const r = step === "feedback" ? records.at(-1) : undefined}
      <article class="prompt rounded-2xl p-4 sm:p-5" aria-label="Groove {qi + 1}" data-feel={current.feel} data-step={step}>
        <p class="font-display text-2xl font-semibold sm:text-3xl">What is the feel?</p>
        <button type="button" class="{btnStage} mt-3" onclick={() => hear()}>Hear it again</button>
        {#if r}
          <p class="mt-3 text-lg font-semibold">{r.correct ? "Right" : "Not quite"}: {FEELS.find((f) => f.id === current!.feel)?.label}, {current.groove.label.toLowerCase()} at {current.bpm} BPM.</p>
          {#if mode === "practice"}
            <p class="mt-1 text-sm text-ws-stage-soft">{FEELS.find((f) => f.id === current!.feel)?.hint}</p>
            <button type="button" class="{btnPrimary} mt-3 max-sm:hidden" onclick={next}>{qi + 1 < LENGTH ? "Next" : "See results"} <kbd class="ml-1 text-sm opacity-80">Enter</kbd></button>
          {/if}
        {/if}
      </article>
      <div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Answers">
        {#each FEELS as f, i (f.id)}
          <button
            type="button"
            class="choice min-h-12 rounded-xl px-2 font-display text-lg font-semibold"
            data-state={r && f.id === current.feel ? "expected" : r && f.id === r.answered ? "answered" : null}
            disabled={step !== "answer"}
            onclick={() => choose(f.id)}
          >
            {f.label}<span class="key" aria-hidden="true">{i + 1}</span>
          </button>
        {/each}
      </div>
    {:else}
      <div class="space-y-2">
        <p class="font-display text-xl font-semibold">Straight, swung, shuffle, 12/8</p>
        <ul class="space-y-1 text-sm text-ws-stage-soft">
          {#each FEELS as f (f.id)}<li><span class="font-semibold text-ws-stage-ink">{f.label}.</span> {f.hint}</li>{/each}
        </ul>
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
    font-size: 0.8125rem;
    opacity: 0.8;
  }
  /* A number key means nothing on a touch screen. */
  @media (pointer: coarse), (max-width: 639px) {
    .key {
      display: none;
    }
  }
</style>

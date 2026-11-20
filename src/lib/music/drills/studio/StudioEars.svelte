<script lang="ts">
  // Studio ears: a loop heard Flat and Changed, flipped as often as you like
  // (the buttons, or A and B), then the change named: an EQ band boosted or
  // cut, boost or cut at matched loudness, a level step in dB, a pan spot.
  // Ten prompts a run; the bands you miss come back more often.
  import { onDestroy } from "svelte";
  import { page } from "$app/state";
  import {
    BAND_SETS,
    bandLabel,
    bellDb,
    compLabel,
    delayLabel,
    GAINS,
    gradeStudio,
    PAN_SETS,
    panLabel,
    STUDIO_EXERCISES,
    studioPrompt,
    type BandSet,
    type StudioExercise,
    type StudioMaterial,
    type StudioPrompt,
  } from "@repo/music-core/content/studio";
  import { catalogEntry } from "@repo/music-core/content/catalog";
  import DrillShell, { type DrillMode, type Phase, type RunContext, type SetupClause } from "#lib/music/components/DrillShell.svelte";
  import Choice from "#lib/music/components/Choice.svelte";
  import Stat from "#lib/music/components/Stat.svelte";
  import Results, { type RunSummary } from "#lib/music/components/Results.svelte";
  import { btnPrimary, btnStage } from "#lib/music/components/ui.ts";
  import { DrillSetup } from "#lib/music/setup.svelte.ts";
  import { assistanceFor, assistanceText, pct } from "#lib/music/drill.svelte.ts";
  import { practice } from "#lib/music/practice.svelte.ts";
  import { nextRun } from "#lib/music/advance.svelte.ts";
  import { audio } from "#lib/music/runtime/index.ts";
  import { listeningLessons } from "@repo/music-core/lessons/reading";

  const LENGTH = 10;
  const entry = catalogEntry("listening")!;
  const cfg = new DrillSetup("studio-ears", {
    exercise: "peak" as string,
    material: "noise" as string,
    bands: "3" as string,
    gain: "12" as string,
    levels: "6,3" as string,
    pans: "3" as string,
    delays: "3" as string,
    flip: "manual" as string,
  });
  const s = $derived(cfg.value);
  const exercise = $derived((STUDIO_EXERCISES.find((e) => e.id === s.exercise) ?? STUDIO_EXERCISES[0]).id as StudioExercise);
  const meta = $derived(STUDIO_EXERCISES.find((e) => e.id === exercise)!);
  /** Compression and delay need transients to hear: on pink noise they use the drum loop. */
  const needsHits = $derived(exercise === "compression" || exercise === "delay");
  const picked = $derived((["noise", "drums", "music"].includes(s.material) ? s.material : "noise") as StudioMaterial);
  const material = $derived(needsHits && picked === "noise" ? "drums" : picked);
  const delays = $derived((s.delays === "4" ? "4" : "3") as "3" | "4");
  const bands = $derived((s.bands in BAND_SETS ? s.bands : "3") as BandSet);
  const gainDb = $derived(GAINS.includes(Number(s.gain) as (typeof GAINS)[number]) ? Number(s.gain) : 12);
  const levels = $derived(s.levels.split(",").map(Number).filter((n) => n > 0));
  const pans = $derived((s.pans === "5" ? "5" : "3") as "3" | "5");
  const eqTask = $derived(exercise === "peak" || exercise === "cut" || exercise === "boost-or-cut");
  const LEVEL_OPTIONS = [
    { value: "6,3", label: "6 and 3 dB" },
    { value: "6,3,2", label: "6, 3 and 2 dB" },
    { value: "6,3,2,1", label: "6, 3, 2 and 1 dB" },
  ];
  /** The one knob each exercise moves through, easy to hard (compression has none). */
  const KNOBS: Partial<Record<StudioExercise, { key: "bands" | "gain" | "levels" | "pans" | "delays"; steps: { value: string; label: string }[] }>> = {
    peak: { key: "bands", steps: [{ value: "3", label: "3 bands" }, { value: "5", label: "5 bands" }, { value: "9", label: "9 octave bands" }] },
    cut: { key: "bands", steps: [{ value: "3", label: "3 bands" }, { value: "5", label: "5 bands" }, { value: "9", label: "9 octave bands" }] },
    "boost-or-cut": { key: "gain", steps: GAINS.map((g) => ({ value: String(g), label: `${g} dB` })) },
    level: { key: "levels", steps: LEVEL_OPTIONS.map((o) => ({ ...o, label: `${o.label} steps` })) },
    pan: { key: "pans", steps: [{ value: "3", label: "Three positions" }, { value: "5", label: "Five positions" }] },
    delay: { key: "delays", steps: [{ value: "3", label: "Three echo times" }, { value: "4", label: "Four echo times" }] },
  };
  /** Short names for the tab row. */
  const TAB: Record<StudioExercise, string> = { peak: "Boost", cut: "Cut", "boost-or-cut": "Boost or cut", level: "Level", pan: "Pan", compression: "Compression", delay: "Delay" };
  const MATERIALS = [
    { value: "noise", label: "Pink noise" },
    { value: "drums", label: "Drum loop" },
    { value: "music", label: "Band loop" },
  ];

  let phase = $state<Phase>("ready");
  let mode = $state<DrillMode>("practice");
  let status = $state("");
  let summary = $state<RunSummary | null>(null);
  let current = $state.raw<StudioPrompt | null>(null);
  let qi = $state(0);
  let step = $state<"loading" | "answer" | "feedback">("answer");
  let changed = $state(true);
  let records = $state<{ prompt: StudioPrompt; answered: string; score: number; correct: boolean; near: boolean }[]>([]);
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let loop: ReturnType<typeof audio.studio.loop> | null = null;
  let flatDb = 0;
  let buffer: AudioBuffer | null = null;
  let flipTimer: ReturnType<typeof setInterval> | undefined;
  let introTimer: ReturnType<typeof setTimeout> | undefined;
  /** Misses so far by answer, this run: missed ones are asked more. */
  let misses: Record<string, number> = {};
  const rand = Math.random;

  // Boost or cut names no band: it draws from a fixed five, whatever Bands says for the other two.
  const setup = () => ({ exercise, bands: exercise === "boost-or-cut" ? ("5" as BandSet) : bands, gainDb, levels: levels.length ? levels : [6, 3], pans, delays });
  const label = (p: StudioPrompt | null, t: string) =>
    !p
      ? t
      : p.exercise === "peak" || p.exercise === "cut"
        ? bandLabel(Number(t))
        : p.exercise === "boost-or-cut"
          ? t === "boost" ? "Boost" : "Cut"
          : p.exercise === "level"
            ? `${t} dB`
            : p.exercise === "compression"
              ? compLabel(t)
              : p.exercise === "delay"
                ? delayLabel(Number(t))
                : panLabel(Number(t));

  function show(on: boolean) {
    changed = on;
    loop?.show(on);
  }

  async function start(_ctx: RunContext) {
    summary = null;
    records = [];
    misses = {};
    qi = 0;
    step = "loading";
    status = "Getting the loop ready.";
    await audio.unlock();
    buffer = await audio.studio.material(material);
    if (phase !== "running") return;
    flatDb = await audio.studio.loudness(buffer, {});
    loop = audio.studio.loop(buffer);
    run = practice.beginRun({
      exerciseId: entry.modes.find((m) => m.id === exercise)!.exerciseId,
      setupKey: `${exercise}|${material}|${bands}|${gainDb}|${levels.join(",")}|${pans}|${delays}`,
      skillIds: ["studio.ears", meta.skillId],
      capabilities: ["ear"],
      modality: "heard",
      assistance: assistanceFor(mode),
      difficulty: Math.min(0.95, { "3": 0.2, "5": 0.4, "9": 0.6 }[bands] + ({ 12: 0, 6: 0.15, 3: 0.3 } as Record<number, number>)[gainDb] + { noise: 0, drums: 0.05, music: 0.1 }[material]),
      params: { exercise, material, bands, gain: gainDb, levels: levels.join(","), pans },
    });
    await ask();
  }

  async function ask() {
    clearTimeout(introTimer);
    const p = studioPrompt(rand, setup(), (a) => 1 + 2 * (misses[a] ?? 0));
    current = p;
    // Boost or cut is judged at matched loudness: Changed is trimmed back to Flat's level.
    // Boost or cut and compression are judged at matched loudness: Changed is trimmed back to Flat's level.
    const matched = (p.exercise === "boost-or-cut" || (p.exercise === "compression" && p.change.comp)) && buffer;
    const trim = matched ? flatDb - (await audio.studio.loudness(buffer!, p.change)) : 0;
    loop?.set(p.change, trim);
    step = "answer";
    status = `Prompt ${qi + 1} of ${LENGTH}: Flat, then Changed. Flip between them as often as you like.`;
    // Flat first, then Changed, the way most trainers present it.
    show(false);
    introTimer = setTimeout(() => step === "answer" && show(true), 1500);
    clearInterval(flipTimer);
    if (s.flip === "auto") flipTimer = setInterval(() => show(!changed), 2000);
  }

  /** Auto flip, switched on the stage while listening. */
  function setAutoFlip(on: boolean) {
    cfg.set({ flip: on ? "auto" : "manual" });
    clearInterval(flipTimer);
    if (on && step === "answer") flipTimer = setInterval(() => show(!changed), 2000);
  }

  async function choose(t: string) {
    const p = current;
    if (!p || step !== "answer" || phase !== "running") return;
    clearTimeout(introTimer);
    clearInterval(flipTimer);
    const g = gradeStudio(p, t);
    if (!g.correct) misses[p.answer] = (misses[p.answer] ?? 0) + 1;
    records = [...records, { prompt: p, answered: t, ...g }];
    step = "feedback";
    show(true);
    await run?.attempt({
      promptId: p.id,
      correct: g.correct,
      partialCredit: g.score,
      metrics: [{ kind: "choice", expected: p.answer, actual: t }],
      source: "click",
      target: p.answer,
      response: t,
      skillIds: p.skillIds,
      instrument: null,
    });
    if (mode === "practice")
      status = g.correct
        ? `Right: ${label(p, p.answer)}. Flip again to hear it knowing the answer.`
        : `It was ${label(p, p.answer)}. You said ${label(p, t)}${g.near ? ", one step off (half credit)" : ""}.`;
    else setTimeout(next, 500);
  }

  function next() {
    if (phase !== "running") return;
    if (qi + 1 >= LENGTH) return void finish();
    qi++;
    void ask();
  }

  function teardown() {
    clearTimeout(introTimer);
    clearInterval(flipTimer);
    loop?.stop();
    loop = null;
  }

  async function finish() {
    teardown();
    phase = "results";
    const right = records.filter((r) => r.correct).length;
    const near = records.filter((r) => r.near).length;
    const score = records.reduce((t, r) => t + r.score, 0) / LENGTH;
    const fin = await run!.finish({ score, correct: right === LENGTH, headline: `${right} of ${LENGTH}` });
    const choices = records[0]?.prompt.choices ?? [];
    summary = {
      headline:
        right === LENGTH
          ? `All ${LENGTH} right.`
          : `${right} of ${LENGTH} right${near ? `, ${near} one step off` : ""}.`,
      metric: pct(score),
      metricLabel: "score",
      delta: fin.delta,
      best: fin.best,
      clean: mode === "check" && right === LENGTH,
      xp: fin.xp,
      assistance: assistanceText(mode),
      rows: choices
        .filter((c) => records.some((r) => r.prompt.answer === c))
        .map((c) => {
          const here = records.filter((r) => r.prompt.answer === c);
          const ok = here.filter((r) => r.correct).length;
          return { label: label(records[0].prompt, c), value: ok / here.length, text: `${ok} of ${here.length}` };
        }),
      routine: page.url.searchParams.get("routine") ? { label: "Back to today's plan", href: "/music" } : undefined,
      advance: await advanceAfter(score, right === LENGTH),
    };
    status = `${summary.headline} Rest your ears for a minute before the next run.`;
  }

  /** Untimed: the exercise's knob, one notch harder. */
  function advanceAfter(score: number, correct: boolean) {
    const knob = KNOBS[exercise];
    if (!knob) return undefined;
    const at = { bands, gain: String(gainDb), levels: s.levels, pans, delays }[knob.key];
    return nextRun(
      `studio.${exercise}.${material}${knob.key === "bands" ? `.${gainDb}` : ""}`,
      { steps: knob.steps, step: Math.max(0, knob.steps.findIndex((x) => x.value === at)) },
      { score, correct },
      ({ step }) => step !== undefined && cfg.set({ [knob.key]: knob.steps[step].value }),
    );
  }

  function stop() {
    teardown();
    phase = "ready";
    status = `Stopped after ${records.length} answer${records.length === 1 ? "" : "s"}.`;
  }

  function onKey(e: KeyboardEvent) {
    if (phase !== "running" || e.repeat || (e.target as HTMLElement | null)?.closest("input, select, textarea")) return;
    if (e.key === "a" || e.key === "A") show(false);
    else if (e.key === "b" || e.key === "B") show(true);
  }

  onDestroy(teardown);

  // The answer drawn: the bell for an EQ change, on a log-frequency axis from 31.5 Hz to 16 kHz.
  const W = 600;
  const H = 150;
  const fx = (hz: number) => 30 + ((Math.log2(hz) - Math.log2(31.5)) / (Math.log2(16000) - Math.log2(31.5))) * (W - 60);
  const fy = (db: number) => H / 2 - (db / 15) * (H / 2 - 16);
  const curve = $derived.by(() => {
    const eq = current?.change.eq;
    if (!eq || step !== "feedback") return `M ${fx(31.5)} ${fy(0)} L ${fx(16000)} ${fy(0)}`;
    const pts: string[] = [];
    for (let i = 0; i <= 120; i++) {
      const hz = 31.5 * 2 ** ((i / 120) * Math.log2(16000 / 31.5));
      pts.push(`${i ? "L" : "M"} ${fx(hz).toFixed(1)} ${fy(bellDb(hz, eq)).toFixed(1)}`);
    }
    return pts.join(" ");
  });
  const summaryLine = $derived<SetupClause[]>([
    { text: MATERIALS.find((m) => m.value === material)?.label.toLowerCase() ?? material, focus: "material" },
    exercise === "peak" || exercise === "cut"
      ? { text: `${BAND_SETS[bands].length} bands, ${exercise === "cut" ? "-" : "+"}${gainDb} dB`, focus: "bands" }
      : exercise === "boost-or-cut"
        ? { text: `${gainDb} dB`, focus: "gain" }
        : exercise === "level"
          ? { text: `${levels.join(", ")} dB steps`, focus: "levels" }
          : exercise === "compression"
            ? { text: "none, light or heavy" }
            : exercise === "delay"
              ? { text: `${delays} echo times`, focus: "delays" }
              : { text: `${PAN_SETS[pans].length} positions`, focus: "pans" },
    { text: `${LENGTH} prompts` },
  ]);
</script>

<svelte:head><title>Studio ears | Woodshed</title></svelte:head>
<svelte:window onkeydown={onKey} />

<DrillShell
  lesson={{ lessons: listeningLessons(exercise, { material, bands, gainDb, levels: levels.length ? levels : [6, 3], pans, delays }) }}
  title="Studio ears"
  hue="ear"
  blurb="Hear a loop flat and changed, and name the change. Keep the volume comfortable and the same throughout."
  summary={summaryLine}
  tabs={STUDIO_EXERCISES.map((e) => ({ id: e.id, label: TAB[e.id] }))}
  tab={exercise}
  ontab={(id) => cfg.set({ exercise: id })}
  modeNotes={{ practice: "The answer named after each prompt.", check: "No feedback until the end. Counts toward mastery." }}
  bind:phase
  bind:mode
  bind:status
  progress={(qi + (step === "feedback" ? 1 : 0)) / LENGTH}
  onstart={start}
  onstop={stop}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2">
      <Choice label="Loop" setupKey="material" options={needsHits ? MATERIALS.slice(1) : MATERIALS} value={material} onchange={(v) => cfg.set({ material: v })} />
      {#if exercise === "delay"}
        <Choice label="Echo times" setupKey="delays" options={[{ value: "3", label: "1/16, 1/8, 1/4" }, { value: "4", label: "With dotted 1/8" }]} value={delays} onchange={(v) => cfg.set({ delays: v })} />
      {/if}
      {#if exercise === "peak" || exercise === "cut"}
        <Choice label="Bands" setupKey="bands" options={KNOBS.peak!.steps} value={bands} onchange={(v) => cfg.set({ bands: v })} />
      {/if}
      {#if eqTask}
        <Choice label={exercise === "peak" ? "Boost size" : exercise === "cut" ? "Cut size" : "Amount"} setupKey="gain" options={GAINS.map((g) => ({ value: String(g), label: `${g} dB` }))} value={String(gainDb)} onchange={(v) => cfg.set({ gain: v })} />
      {/if}
      {#if exercise === "level"}
        <Choice label="Steps" setupKey="levels" options={LEVEL_OPTIONS} value={s.levels} onchange={(v) => cfg.set({ levels: v })} />
      {/if}
      {#if exercise === "pan"}
        <Choice label="Positions" setupKey="pans" options={[{ value: "3", label: "Left, centre, right" }, { value: "5", label: "Five" }]} value={pans} onchange={(v) => cfg.set({ pans: v })} />
      {/if}
    </div>
    <p class="mt-3 text-sm text-ws-soft">
      {#if needsHits}{meta.title} needs hits to hear, so it plays on the drum or band loop.{/if}
      Use the same headphones or speakers every time, at a level you could listen to all day. Short runs work best: rest your ears between them.
    </p>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running" && current}
      <Stat label="Prompt" value="{qi + 1} of {LENGTH}" />
      {#if mode === "practice"}<Stat label="Right so far" value={records.filter((r) => r.correct).length} />{/if}
    {/if}
  {/snippet}

  {#snippet stage()}
    {#if phase === "running" && current}
      {@const p = current}
      <article class="prompt rounded-2xl p-4 sm:p-5" aria-label="Prompt {qi + 1}" data-exercise={p.exercise} data-answer={p.answer} data-step={step}>
        <p class="text-sm text-ws-stage-soft">{MATERIALS.find((m) => m.value === material)?.label}</p>
        <p class="font-display text-xl font-semibold sm:text-2xl">{meta.ask}</p>
        <div class="mt-3 flex flex-wrap gap-2" role="group" aria-label="Listen to">
          <button type="button" class="flip" aria-pressed={!changed} onclick={() => show(false)}>Flat <kbd>A</kbd></button>
          <button type="button" class="flip" aria-pressed={changed} onclick={() => show(true)}>Changed <kbd>B</kbd></button>
          <label class="ml-auto flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" class="size-4 accent-[var(--instr)]" checked={s.flip === "auto"} onchange={(e) => setAutoFlip(e.currentTarget.checked)} />
            Flip every 2 s
          </label>
        </div>
        {#if eqTask}
          <svg class="mt-3 w-full" viewBox="0 0 {W} {H}" role="img" aria-label={step === "feedback" && p.change.eq ? `${p.change.eq.gainDb > 0 ? "+" : ""}${p.change.eq.gainDb} dB at ${bandLabel(p.change.eq.freq)}` : "The frequency range, before the answer"}>
            <line class="axis" x1={fx(31.5)} x2={fx(16000)} y1={fy(0)} y2={fy(0)} />
            {#each BAND_SETS["9"] as hz (hz)}
              <line class="tick" class:asked={p.choices.includes(String(hz))} x1={fx(hz)} x2={fx(hz)} y1={14} y2={H - 22} />
              <text class="hz" class:asked={p.choices.includes(String(hz))} x={fx(hz)} y={H - 6}>{bandLabel(hz)}</text>
            {/each}
            <path class="curve" class:shown={step === "feedback"} d={curve} />
          </svg>
        {/if}
        {#if step === "feedback"}
          {@const r = records.at(-1)!}
          <p class="mt-2 text-lg font-semibold">
            {#if r.correct}<span class="verdict right" aria-hidden="true">✓</span> Right: {label(p, p.answer)}.
            {:else}<span class="verdict wrong" aria-hidden="true">✕</span> It was {label(p, p.answer)}. You said {label(p, r.answered)}{r.near ? ", one step off" : ""}.{/if}
          </p>
          {#if mode === "practice"}
            <button type="button" class="{btnPrimary} mt-3" onclick={next}>{qi + 1 < LENGTH ? "Continue" : "See results"}</button>
          {/if}
        {/if}
      </article>
      <div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" role="group" aria-label="Answers">
        {#each p.choices as t (t)}
          {@const r = step === "feedback" ? records.at(-1) : undefined}
          <button
            type="button"
            class="choice min-h-12 rounded-xl px-3 text-sm font-semibold"
            data-state={r && t === p.answer ? "expected" : r && t === r.answered ? "answered" : null}
            disabled={step !== "answer"}
            onclick={() => choose(t)}
          >{label(p, t)}</button>
        {/each}
      </div>
    {:else if phase === "running"}
      <p class="py-8 text-center text-ws-stage-soft">Getting the loop ready.</p>
    {:else}
      <div class="space-y-2 py-2">
        <p class="font-display text-xl font-semibold">{entry.blurb}</p>
        <p class="text-sm text-ws-stage-soft">{meta.title}: {meta.ask} Each prompt plays Flat, then Changed; flip with the buttons or A and B.</p>
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
  .flip {
    min-height: 3rem;
    min-width: 8rem;
    border-radius: 0.9rem;
    padding: 0 1rem;
    font-weight: 600;
    background: color-mix(in oklch, var(--ws-stage-ink) 9%, transparent);
    border: 2px solid transparent;
  }
  .flip[aria-pressed="true"] {
    background: var(--instr);
    color: var(--ws-stage);
  }
  .flip kbd {
    margin-left: 0.4rem;
    font-size: 0.75rem;
    opacity: 0.7;
  }
  .choice {
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
  .axis {
    stroke: color-mix(in oklch, var(--ws-stage-ink) 30%, transparent);
  }
  .tick {
    stroke: color-mix(in oklch, var(--ws-stage-ink) 8%, transparent);
  }
  .tick.asked {
    stroke: color-mix(in oklch, var(--ws-stage-ink) 22%, transparent);
  }
  .hz {
    font-size: 11px;
    text-anchor: middle;
    fill: color-mix(in oklch, var(--ws-stage-ink) 40%, transparent);
  }
  .hz.asked {
    fill: var(--ws-stage-ink);
    font-weight: 700;
  }
  .curve {
    fill: none;
    stroke: color-mix(in oklch, var(--ws-stage-ink) 30%, transparent);
    stroke-width: 2;
  }
  .curve.shown {
    stroke: var(--instr);
    stroke-width: 3;
  }
  .verdict {
    display: inline-grid;
    place-items: center;
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 999px;
    font-size: 0.9rem;
    color: var(--ws-stage);
  }
  .verdict.right {
    background: var(--success);
  }
  .verdict.wrong {
    background: var(--destructive);
  }
</style>

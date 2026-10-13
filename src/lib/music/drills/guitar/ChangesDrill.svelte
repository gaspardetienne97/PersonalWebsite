<script lang="ts">
  // Chord changes between two shapes (catalog 4.5, scoring rules 9): clusters
  // split by 350 ms of silence, graded per arrival. Round trips or a timed
  // minute, optionally against a clock (BPM and beats per chord). Taps and MIDI
  // give notes; with the microphone on, each strum is read as chroma instead.
  import { onDestroy } from "svelte";
  import type { NoteEvent } from "@repo/music-core";
  import { catalogEntry } from "@repo/music-core/content/catalog";
  import { CHANGES_SETUP, shapePcs } from "@repo/music-core/content/technique";
  import { gradeChanges, type ChangesResult } from "@repo/music-core/scoring/technique";
  import { CHANGE_GAP_MS, clusterByGap } from "@repo/music-core/scoring/timing";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "$lib/music/components/DrillShell.svelte";
  import Choice from "$lib/music/components/Choice.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { type RunSummary } from "$lib/music/components/Results.svelte";
  import { Flashes } from "$lib/music/components/feedback.svelte";
  import { btnStage, panel } from "$lib/music/components/ui";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { nextRun, tempoAnd } from "$lib/music/advance.svelte";
  import { assistanceFor, assistanceText, capture, readKeyed, runInstrument, runSource, writeKeyed, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { mic, settings } from "$lib/music/runtime";
  import { exerciseFor, skillsFor } from "./fretted";
  import { fretted } from "./instrument.svelte";
  import { chordSymbol, mergePairRuns, PAIR_HISTORY_KEY, pairKey, shapesFor, type PairRun } from "./chords";
  import { ChordListener } from "./strum.svelte";
  import MicPanel from "./MicPanel.svelte";
  import ModeTabs from "./ModeTabs.svelte";
  import ShapeBoard from "./ShapeBoard.svelte";
  import { CHORD_MODES } from "./modes";

  const IDLE_MS = 20_000;
  const CLOCK_STEPS = [{ label: "A change every bar" }, { label: "A change every 2 beats" }, { label: "A change every beat" }];
  const cfg = new DrillSetup("chords-changes", { shape: "guitar.c-major", to: "guitar.g-major", timed: false as boolean, trips: 2, clock: 0 });
  const s = $derived(cfg.value);
  const entry = catalogEntry("chords")!.modes.find((m) => m.id === "changes")!;
  const instr = $derived(fretted());
  const shapes = $derived(shapesFor(instr));
  const from = $derived(shapes.find((x) => x.id === s.shape) ?? shapes[0]);
  const toShape = $derived.by(() => {
    const pick = shapes.find((x) => x.id === s.to && x.id !== from.id);
    return pick ?? shapes.find((x) => from.commonTransitions.includes(x.id)) ?? shapes.find((x) => x.id !== from.id)!;
  });
  const pair = $derived([from, toShape]);
  const names = $derived(pair.map((x) => chordSymbol(x)));
  const trips = $derived(Math.min(CHANGES_SETUP.roundTrips[1], Math.max(CHANGES_SETUP.roundTrips[0], s.trips)));
  const beatsPerChord = $derived([0, 1, 2, 4].includes(s.clock) ? s.clock : CHANGES_SETUP.beatsPerChord);
  const bpm = () => Math.min(160, Math.max(30, settings.value.bpm));
  const key = $derived(`changes:${pairKey(from.id, toShape.id)}:${s.timed ? "60s" : `${trips}x`}:${beatsPerChord ? `${bpm()}/${beatsPerChord}` : "free"}`);

  let phase = $state<Phase>("ready");
  let mode = $state<DrillMode>("practice");
  let status = $state("");
  let now = $state(0);
  let notes = $state.raw<{ midi: number; at: number }[]>([]);
  let result = $state<ChangesResult | null>(null);
  let summary = $state<RunSummary | null>(null);
  let history = $state<Record<string, PairRun[]>>({});
  const flashes = new Flashes();
  const listener = new ChordListener();
  let cap: Capture | null = null;
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let downbeat = $state(0);
  let periodMs = $state(0);
  let endAt = $state(Infinity);
  let lastNoteAt = 0;
  let usedMic = false;
  let ticker: ReturnType<typeof setInterval> | undefined;
  let stopClockRef: (() => void) | null = null;

  void readKeyed<PairRun[]>(PAIR_HISTORY_KEY).then((h) => (history = h));

  const live = $derived(phase === "running" || phase === "countin");
  const clusters = $derived(clusterByGap(notes));
  const closed = $derived(clusters.filter((c) => now - c.end > CHANGE_GAP_MS).length);
  const target = $derived<0 | 1>(periodMs ? (Math.max(0, Math.floor((now - downbeat) / periodMs)) % 2 as 0 | 1) : ((closed % 2) as 0 | 1));
  const liveGrade = $derived(live ? grade(Math.max(1, now - downbeat)) : null);
  const shown = $derived(pair[target]);
  const pairRuns = $derived(history[pairKey(from.id, toShape.id)] ?? []);

  function grade(durationMs: number) {
    return gradeChanges({
      from: { id: from.id, pcs: shapePcs(from) },
      to: { id: toShape.id, pcs: shapePcs(toShape) },
      tuningId: from.tuningId,
      notes,
      durationMs,
      clock: periodMs ? { bpm: bpm(), beatsPerChord, anchorAt: downbeat } : undefined,
    });
  }

  function onNote(e: NoteEvent) {
    if (e.kind !== "noteon" || phase !== "running") return;
    // With the microphone on, strums are read as chroma; single detected pitches would double them.
    if (e.source === "audio" && usedMic) return;
    notes = [...notes, { midi: e.midi, at: e.at }];
    lastNoteAt = e.at;
    if (mode === "practice" && e.string !== undefined && e.fret !== undefined) {
      const ok = shapePcs(pair[target]).includes(e.midi % 12);
      flashes.add(e.string * 100 + e.fret, ok ? "correct" : "wrong");
    }
  }

  function tick() {
    now = performance.now();
    if (phase !== "running") return;
    const open = clusters.length > closed;
    if (now >= endAt) return void finish();
    if (!periodMs && !s.timed) {
      const g = grade(1);
      if (g.completed >= trips * 2 && !open) return void finish();
      if (lastNoteAt && now - lastNoteAt > IDLE_MS) return void finish();
    }
  }

  async function start(ctx: RunContext) {
    summary = null;
    result = null;
    notes = [];
    lastNoteAt = 0;
    flashes.clear();
    downbeat = ctx.downbeat;
    periodMs = beatsPerChord && ctx.beatMs ? ctx.beatMs * beatsPerChord : 0;
    endAt = s.timed ? downbeat + CHANGES_SETUP.timedSeconds * 1000 : periodMs ? downbeat + (trips * 2 + 1) * periodMs + periodMs / 2 : Infinity;
    stopClockRef = ctx.stopClock;
    run = practice.beginRun({
      exerciseId: exerciseFor(entry.exerciseId, instr),
      setupKey: key,
      skillIds: skillsFor(entry.skillIds, instr),
      capabilities: ["technique"],
      modality: "played",
      assistance: assistanceFor(mode),
      difficulty: Math.min(1, (from.difficulty + toShape.difficulty) / 10 + (periodMs ? 0.1 : 0) + (s.timed ? 0.1 : 0)),
      instrument: instr,
      params: { from: from.id, to: toShape.id, timed: s.timed, trips, ...(periodMs ? { bpm: ctx.bpm, beatsPerChord } : {}) },
    });
    cap = capture(ctx.downbeat - (ctx.beatMs || 0) / 2, (e) => e.kind === "noteon" && onNote(e));
    usedMic = mic.state === "on";
    if (usedMic)
      listener.start({
        onStrum: (h) => {
          if (phase !== "running" || h.at < ctx.downbeat - 100 || !h.pcs.length) return;
          notes = [...notes, ...h.pcs.map((pc) => ({ midi: 60 + pc, at: h.at }))];
          lastNoteAt = h.at;
        },
      });
    now = performance.now();
    ticker = setInterval(tick, 100);
    status = `Play ${names[0]}, then change to ${names[1]}.`;
  }

  function halt() {
    clearInterval(ticker);
    stopClockRef?.();
    cap?.stop();
    listener.stop();
    mic.stop();
  }

  async function finish() {
    if (phase !== "running" && phase !== "countin") return;
    halt();
    const cl = clusterByGap(notes);
    const durationMs = s.timed
      ? CHANGES_SETUP.timedSeconds * 1000
      : periodMs
        ? endAt - downbeat
        : cl.length > 1
          ? cl[cl.length - 1].start - cl[0].start
          : 0;
    const r = grade(Math.max(1, durationMs));
    result = r;
    phase = "results";
    const src = cap?.notes ?? [];
    await run!.attempt({
      promptId: pairKey(from.id, toShape.id),
      correct: r.correct,
      partialCredit: r.score,
      metrics: r.metrics,
      source: usedMic ? "audio" : runSource(src),
      instrument: runInstrument(src, instr) ?? null,
      target: names.join(" "),
      response: `${r.completed} changes`,
    });
    const perMinute = Math.round(r.changesPerMinute * 10) / 10;
    const fin = await run!.finish({ score: r.score, correct: r.correct, headline: `${perMinute} changes per minute, ${r.clean} of ${r.completed} with every note` });
    const hk = pairKey(from.id, toShape.id);
    const bestBefore = Math.max(0, ...(history[hk] ?? []).map((x) => x.perMinute));
    if (r.completed) history = await writeKeyed<PairRun[]>(PAIR_HISTORY_KEY, hk, [{ date: new Date().toISOString(), perMinute, clean: r.clean, completed: r.completed }], mergePairRuns);
    summary = {
      headline: !notes.length
        ? "Nothing was heard during the run. Tap the strings, strum into the microphone, or connect MIDI, then try again."
        : r.completed === 0
          ? `No change landed yet: play ${names[0]}, pause, then ${names[1]}.`
          : `${r.completed} change${r.completed === 1 ? "" : "s"}, ${r.clean} with every target note, at ${perMinute} per minute.${perMinute > bestBefore && bestBefore > 0 ? ` Your fastest ${names[0]} and ${names[1]} yet.` : ""}`,
      metric: String(perMinute),
      metricLabel: "changes per minute",
      delta: fin.delta,
      best: fin.best || (perMinute > bestBefore && bestBefore > 0),
      clean: r.correct && mode === "check",
      xp: fin.xp,
      assistance: assistanceText(mode),
      rows: [
        { label: "Changes completed", text: `${r.completed}${s.timed ? " in a minute" : ` of ${trips * 2}`}` },
        { label: "Changes with every target note", value: r.completed ? r.clean / r.completed : 0, text: `${r.clean} of ${r.completed}` },
        r.onTime !== null ? { label: "On time", value: r.completed ? r.onTime / r.completed : 0, text: `${r.onTime} of ${r.completed}` } : { label: "On time (no clock)", notMeasured: true },
        { label: "Target notes per chord", value: r.score },
        { label: "Which strings rang", notMeasured: true },
      ],
      // With the clock on: the tempo climbs to 100, then the chords change twice as often. No clock, no ladder.
      advance:
        notes.length && beatsPerChord
          ? await nextRun(`${instr}.changes.${hk}.${s.timed ? "60s" : `${trips}x`}`, { bpm: bpm(), tempo: { min: 30, goal: 100, max: 160 }, steps: CLOCK_STEPS, step: [4, 2, 1].indexOf(beatsPerChord) }, { score: r.score, correct: r.correct }, tempoAnd((i) => cfg.set({ clock: [4, 2, 1][i] })))
          : undefined,
    };
    status = summary.headline;
  }

  function stop() {
    halt();
    phase = "ready";
    status = "Stopped. Nothing was recorded.";
  }

  onDestroy(halt);

  const summaryLine = $derived(
    `${names[0]} and ${names[1]}, ${s.timed ? "one timed minute" : `${trips} round trip${trips > 1 ? "s" : ""}`}, ${beatsPerChord ? `change every ${beatsPerChord} beat${beatsPerChord > 1 ? "s" : ""} at ${bpm()} BPM` : "no clock"}`,
  );
  const chordOptions = $derived(shapes.map((x) => ({ value: x.id, label: `${chordSymbol(x)}, ${x.name}` })));
  const maxRun = $derived(Math.max(1, ...pairRuns.map((x) => x.perMinute)));
</script>

<DrillShell
  title="Chord changes"
  hue={instr}
  blurb="Move between two chords and back. Each arrival counts when its target notes are there, and the pair keeps a history of changes per minute."
  summary={summaryLine}
  bind:phase
  bind:mode
  bind:status
  progress={s.timed ? Math.min(1, Math.max(0, now - downbeat) / (CHANGES_SETUP.timedSeconds * 1000)) : Math.min(1, (liveGrade?.completed ?? 0) / (trips * 2))}
  clock={beatsPerChord ? { bpm: bpm(), beatsPerBar: 4 } : null}
  onstart={start}
  onstop={stop}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Choice label="From" select options={chordOptions} value={from.id} onchange={(v) => cfg.set({ shape: v })} />
      <Choice label="To" select options={chordOptions.filter((o) => o.value !== from.id)} value={toShape.id} onchange={(v) => cfg.set({ to: v })} />
      <Choice
        label="Length"
        options={[
          { value: 0, label: "Round trips" },
          { value: 1, label: "One timed minute" },
        ]}
        value={s.timed ? 1 : 0}
        onchange={(v) => cfg.set({ timed: v === 1 })}
      />
      {#if !s.timed}
        <Choice label="Round trips" select options={Array.from({ length: 8 }, (_, i) => ({ value: i + 1, label: `${i + 1}` }))} value={trips} onchange={(v) => cfg.set({ trips: v })} />
      {/if}
      <Choice
        label="Clock"
        options={[
          { value: 0, label: "Off" },
          { value: 1, label: "Every beat" },
          { value: 2, label: "Every 2 beats" },
          { value: 4, label: "Every bar" },
        ]}
        value={beatsPerChord}
        onchange={(v) => cfg.set({ clock: v })}
      />
      {#if beatsPerChord}<p class="self-end text-sm text-ws-soft">Tempo comes from the practice strip ({bpm()} BPM).</p>{/if}
    </div>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running" && liveGrade}
      <Stat label="Changes" value={liveGrade.completed} />
      {#if s.timed}<Stat label="Left" value="{Math.max(0, Math.ceil((endAt - now) / 1000))} s" />{/if}
    {:else if result}
      <Stat label="Changes" value={result.completed} />
      <Stat label="With every note" value="{result.clean}/{result.completed}" tone={result.completed && result.clean === result.completed ? "success" : "warn"} />
    {/if}
  {/snippet}

  {#snippet stage()}
    {#if !live}<ModeTabs tabs={CHORD_MODES} label="Chord drills" />{/if}
    <div class="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <p class="font-display text-5xl font-bold leading-none">{live ? names[target] : names[0]}</p>
      <p class="text-lg text-ws-stage-soft">then {live ? names[1 - target] : names[1]}</p>
    </div>
    <ShapeBoard shape={live ? shown : from} show={mode === "practice" || phase === "results"} {flashes} label="{live ? names[target] : names[0]} on the {instr} neck" />
    {#if phase === "running" && !periodMs && !s.timed}
      <div class="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" class={btnStage} onclick={() => void finish()}>Finish now</button>
        <span class="text-sm text-ws-stage-soft">Pause briefly between chords: a gap of a third of a second starts the next one.</span>
      </div>
    {/if}
    <p class="mt-3 max-w-prose text-sm text-ws-stage-soft">A change counts as having every note when the target notes of the arriving chord are all there and nothing else is. Which string sounded each note is not measured.</p>
    <div class="mt-3"><MicPanel disabled={live} hint="Optional: strum into the microphone, or tap each string of the chord here." /></div>
  {/snippet}

  {#snippet results()}
    {#if summary}
      <Results {summary} />
      {#if pairRuns.length}
        <section class="{panel} mt-3" aria-labelledby="pair-history">
          <h3 id="pair-history" class="font-display text-lg font-semibold">{names[0]} and {names[1]}: changes per minute</h3>
          <ol class="mt-3 flex h-28 items-end gap-1.5 overflow-x-auto pb-1">
            {#each pairRuns.slice(-16) as r, i (r.date + i)}
              <li class="flex h-full w-8 shrink-0 flex-col items-center justify-end gap-1">
                <span class="tnum text-xs">{r.perMinute}</span>
                <span class="w-full rounded-t bg-instr" style:height="{Math.max(4, (r.perMinute / maxRun) * 72)}px" aria-hidden="true"></span>
                <span class="sr-only">{new Date(r.date).toLocaleDateString()}: {r.perMinute} per minute, {r.clean} of {r.completed} with every note</span>
              </li>
            {/each}
          </ol>
          <p class="mt-2 text-sm text-ws-soft">Best {maxRun} per minute over {pairRuns.length} run{pairRuns.length > 1 ? "s" : ""}.</p>
        </section>
      {/if}
    {/if}
  {/snippet}
</DrillShell>

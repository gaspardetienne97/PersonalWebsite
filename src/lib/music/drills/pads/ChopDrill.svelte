<script lang="ts">
  // Chop: a loop cut into 16 equal slices on A01 to A16, as the MPC's Chop to
  // pads does. The loop is one of the app's own (its kit and keys, rendered at
  // the tempo) or a file you import. Play the slices back in order, a written
  // reorder, or a free chop of your own that you then play again. The slices
  // are a kit for the run; Create's kit comes back when you leave.
  import { onDestroy } from "svelte";
  import type { NoteEvent } from "@repo/music-core";
  import { clamp } from "@repo/music-core";
  import { gradeGroove, type GrooveResult } from "@repo/music-core/scoring/pads";
  import {
    CHOP_EDITS,
    CHOP_EXERCISES,
    CHOP_PADS,
    CHOP_SLICES,
    CHOP_SOURCES,
    FREE_CHOP,
    chopPiece,
    chopSource,
    gradeFreeChop,
    slicePad,
    type ChopSource,
  } from "@repo/music-core/content/pads-studio";
  import DrillShell, { type DrillMode, type Phase, type RunContext, type SetupClause } from "$lib/music/components/DrillShell.svelte";
  import Pads from "$lib/music/components/Pads.svelte";
  import Choice from "$lib/music/components/Choice.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { type RunSummary } from "$lib/music/components/Results.svelte";
  import { Flashes, type CellMarks } from "$lib/music/components/feedback.svelte";
  import { btn } from "$lib/music/components/ui";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { assistanceFor, assistanceText, capture, pct, runSource, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { audio, input, settings } from "$lib/music/runtime";
  import { nextRun, tempoAnd } from "$lib/music/advance.svelte";
  import { decodeLoop, loadSlices, restoreKit } from "./slices";
  import MidiStatus from "./MidiStatus.svelte";
  import PadHighway, { type HighwayLane, type HighwayNote } from "./PadHighway.svelte";
  import { judgeHit, laneColor, overdue, type Judgement } from "./lanes";

  let { modes, onmode }: { modes: readonly (readonly [string, string])[]; onmode: (m: string) => void } = $props();

  const cfg = new DrillSetup("pad-chop", { exercise: "order" as string, source: "boom-bap-b" as string, edit: "flip" as string, fileBars: 1, view: "lanes" as string, ahead: 1 });
  const s = $derived(cfg.value);
  /** The lanes (a slice a lane, each ringing until the next) or the order as a strip; how many bars the lanes read ahead. */
  const lanesView = $derived(s.view !== "grid");
  const aheadBars = $derived([1, 2, 4].includes(s.ahead) ? s.ahead : 1);
  const exercise = $derived(CHOP_EXERCISES.find((x) => x.id === s.exercise)?.id ?? "order");
  /** An imported loop, decoded; kept for the visit only. */
  let file = $state.raw<{ name: string; buffer: AudioBuffer } | null>(null);
  const source = $derived<ChopSource>(
    s.source === "file" && file
      ? { id: "file", label: file.name, bars: s.fileBars, bpm: Math.round(((s.fileBars * 4 * 60) / file.buffer.duration) * 10) / 10, detail: "Your loop" }
      : (chopSource(s.source) ?? CHOP_SOURCES[0]),
  );
  /** An imported loop plays at its own speed, so the click follows it; the app's loops follow the strip. */
  const bpm = $derived(source.id === "file" ? clamp(source.bpm, 30, 240) : clamp(settings.value.bpm, 30, 240));
  const beatMs = $derived(60000 / bpm);
  const edits = $derived(CHOP_EDITS.filter((e) => !e.source || e.source === source.id || (source.id === "file" && !e.source)));
  const edit = $derived(edits.find((e) => e.id === s.edit) ?? edits[0]);
  const piece = $derived(exercise === "free" ? null : chopPiece(source, exercise, edit.id));
  const FREE_BARS = 4;
  const lengthMs = $derived(piece ? piece.bars * 4 * beatMs : FREE_BARS * 2 * 4 * beatMs);
  const targets = $derived(piece ? piece.targets.map((t) => ({ pad: CHOP_PADS[t.voice], slice: CHOP_PADS[t.voice] - 35, atMs: t.beat * beatMs, beat: t.beat })) : []);

  let phase = $state<Phase>("ready");
  let mode = $state<DrillMode>("practice");
  let status = $state("");
  let summary = $state<RunSummary | null>(null);
  let grv = $state.raw<GrooveResult | null>(null);
  let take = $state.raw<{ at: number; midi: number; velocity: number }[]>([]);
  let downbeat = $state(0);
  let now = $state(0);
  let raf = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cap: Capture | null = null;
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let stopClockRef: (() => void) | null = null;
  let demo = $state<{ stop(): void; playing: boolean } | null>(null);
  const flashes = new Flashes();

  // ---------------------------------------------------------------------------
  // The slices: render or decode the loop, cut it in 16, load them as a kit.

  /** What is on the pads now ("source@bpm"), and what is being cut. */
  let loaded = $state("");
  let cutting = $state(false);
  let cutError = $state("");
  const want = $derived(`${source.id}:${source.id === "file" ? `${file?.name}:${s.fileBars}` : bpm}`);

  async function cut(key: string) {
    cutting = true;
    cutError = "";
    try {
      await loadSlices(source, bpm, source.id === "file" ? file?.buffer : undefined);
      if (key === want) loaded = key;
    } catch (e) {
      cutError = `The loop could not be cut: ${(e as Error).message}`;
    } finally {
      cutting = false;
    }
  }

  // Cut again when the loop or its tempo changes (a short wait so a tempo being typed settles).
  $effect(() => {
    const key = want;
    if (key === loaded || (source.id === "file" && !file)) return;
    const t = setTimeout(() => void cut(key), 250);
    return () => clearTimeout(t);
  });

  async function importFile(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!f) return;
    try {
      file = { name: f.name.replace(/\.[^.]+$/, ""), buffer: await decodeLoop(f) };
      cfg.set({ source: "file" });
      status = `${file.name}: ${file.buffer.duration.toFixed(2)} s. Set how many bars it is; the tempo follows.`;
    } catch {
      status = "That file could not be read as audio. Try a WAV or MP3.";
    }
  }

  // MIDI hits play their slice (on-screen taps already do, through the input layer).
  $effect(() =>
    input.subscribe((e) => {
      if (e.kind === "noteon" && e.source !== "onscreen" && e.midi >= 36 && e.midi < 36 + CHOP_SLICES) audio.playKitPad(e.midi, e.velocity);
    }),
  );

  // ---------------------------------------------------------------------------
  // The run.

  const stepNow = $derived(phase === "running" && now >= downbeat ? Math.floor((now - downbeat) / (beatMs / 4)) : null);
  const names = Object.fromEntries(Array.from({ length: CHOP_SLICES }, (_, i) => [slicePad(i), `Slice ${i + 1}`]));
  // The lanes: the slices the piece plays, in order, each ringing until the next slice starts.
  const lanes = $derived<HighwayLane[]>([...new Set(targets.map((t) => t.slice))].sort((a, b) => a - b).map((n) => ({ id: `slice-${n}`, label: `Slice ${n}`, color: laneColor(`slice-${n}`), pad: slicePad(n - 1) })));
  const sliceMs = $derived((source.bars * 4 * beatMs) / CHOP_SLICES);
  const live = $derived<(HighwayNote & { pad: number })[]>(
    targets.map((t, i) => ({ pad: t.pad, atMs: t.atMs, lane: lanes.findIndex((l) => l.pad === t.pad), kind: "normal", durMs: Math.min(sliceMs, (targets[i + 1]?.atMs ?? lengthMs) - t.atMs) })),
  );
  const judgeWindow = $derived({ perfect: Math.min(90, beatMs / 16), good: Math.min(180, beatMs / 8) });
  let judged = $state<Record<number, Judgement>>({});
  let flashKey = 0;
  let flashNote = $state<{ judgement: Judgement | "extra"; ms?: number; key: number } | null>(null);
  const timing = new Flashes<"early" | "late" | "perfect">();
  const showLanes = $derived(lanesView && !!piece && phase !== "results" && (mode === "practice" || phase === "ready"));

  const marks = $derived.by(() => {
    const out: Record<number, CellMarks> = {};
    if (mode !== "practice" || phase !== "running") return out;
    const rel = now - downbeat;
    const ahead = Math.min(beatMs / 2, 260);
    for (const t of targets) if (t.atMs >= rel - 40 && t.atMs <= rel + ahead) out[t.pad] = { target: true };
    return out;
  });
  const freeHalf = $derived(exercise === "free" && phase === "running" && now >= downbeat ? (now - downbeat < lengthMs / 2 ? "first" : "again") : null);

  const summaryLine = $derived<SetupClause[]>([
    { text: CHOP_EXERCISES.find((x) => x.id === exercise)!.label, focus: "exercise" },
    { text: `${source.label}, ${source.bars} bar${source.bars > 1 ? "s" : ""} on 16 pads`, focus: "source" },
    ...(exercise === "reorder" ? [{ text: edit.label, focus: "edit" }] : []),
    { text: `${Math.round(bpm)} BPM${source.id === "file" ? " (the loop's)" : ""}` },
  ]);

  function stopDemo() {
    demo?.stop();
    demo = null;
  }
  async function playDemo() {
    if (demo?.playing) return stopDemo();
    await audio.unlock();
    // The whole loop for a free chop; else the slices as written, on the slices themselves.
    const notes = piece
      ? piece.targets.map((t) => ({ midi: CHOP_PADS[t.voice], time: (t.beat * beatMs) / 1000, duration: 0.2, velocity: 0.9, voice: "kit" as const }))
      : Array.from({ length: CHOP_SLICES * 2 }, (_, i) => ({ midi: slicePad(i % CHOP_SLICES), time: (i * source.bars * 4 * beatMs) / CHOP_SLICES / 1000, duration: 0.2, velocity: 0.9, voice: "kit" as const }));
    const handle = audio.playSequence(notes);
    demo = handle;
    status = piece ? "Listen: the slices as written. Not scored." : "Listen: the loop, slice by slice. Not scored.";
    void handle.done.then(() => {
      if (demo === handle) stopDemo();
    });
  }

  function onHit(e: NoteEvent) {
    if (e.kind !== "noteon" || mode !== "practice" || (phase !== "running" && phase !== "countin")) return;
    const at = e.at - downbeat;
    if (!piece) return flashes.add(e.midi, "correct", 150);
    const near = targets.some((t) => t.pad === e.midi && Math.abs(t.atMs - at) <= Math.min(180, beatMs / 8));
    flashes.add(e.midi, near ? "correct" : "wrong", 250);
    const hit = judgeHit(live, judged, e.midi, at, judgeWindow);
    if (!hit) {
      flashNote = { judgement: "extra", key: ++flashKey };
      return;
    }
    judged = { ...judged, [hit.index]: hit.judgement };
    timing.add(e.midi, hit.judgement as "early" | "late" | "perfect", 450);
    flashNote = { judgement: hit.judgement, ms: hit.err, key: ++flashKey };
  }

  function start(ctx: RunContext) {
    stopDemo();
    summary = null;
    grv = null;
    take = [];
    flashes.clear();
    timing.clear();
    judged = {};
    flashNote = null;
    downbeat = ctx.downbeat;
    stopClockRef = ctx.stopClock;
    run = practice.beginRun({
      exerciseId: "technique.mpc.chop",
      setupKey: `chop:${exercise}:${source.id}:${exercise === "reorder" ? edit.id : ""}:${Math.round(bpm)}`,
      skillIds: ["technique.mpc", "technique.mpc.chop"],
      capabilities: ["technique", "rhythm"],
      modality: "played",
      assistance: assistanceFor(mode),
      difficulty: clamp(0.35 + (exercise === "free" ? 0.15 : exercise === "reorder" ? 0.2 : 0) + (bpm - 80) / 300, 0.05, 0.95),
      instrument: "mpc",
      params: { bpm: Math.round(bpm), exercise, source: source.id, ...(exercise === "reorder" ? { edit: edit.id } : {}), ...(source.id === "file" ? { bars: source.bars } : {}) },
    });
    cap = capture(ctx.downbeat - beatMs / 2, (e) => e.kind === "noteon" && onHit(e as NoteEvent));
    status = exercise === "free" ? `Bars 1 to ${FREE_BARS}: play your own chop. Then play it again.` : exercise === "order" ? "Slice 1 to 16, one after the other: the loop should come back." : "Play the slices as written.";
    const tick = () => {
      now = performance.now();
      const missed = phase === "running" && mode === "practice" && piece ? overdue(live, judged, now - downbeat, judgeWindow.good) : [];
      if (missed.length) {
        judged = { ...judged, ...Object.fromEntries(missed.map((i) => [i, "miss" as const])) };
        flashNote = { judgement: "miss", key: ++flashKey };
      }
      if (phase === "running" || phase === "countin") raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    timer = setTimeout(() => void finish(), Math.max(0, ctx.downbeat - performance.now()) + lengthMs + beatMs / 2 + 150);
  }

  async function finish() {
    if (phase !== "running" && phase !== "countin") return;
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    stopClockRef?.();
    cap?.stop();
    const notes = cap?.notes ?? [];
    const ons = notes.filter((n) => n.kind === "noteon");
    phase = "results";
    let score: number;
    let correct: boolean;
    let headline: string;
    let rows: RunSummary["rows"];
    if (piece) {
      const r = gradeGroove({ targets: piece.targets, voicePads: CHOP_PADS, sectionLabels: piece.sectionLabels, beatsPerBar: 4, beatMs, startAt: downbeat, hits: notes });
      if ("error" in r) {
        status = r.error;
        phase = "ready";
        return;
      }
      grv = r;
      score = r.score;
      correct = r.correct;
      const wrong = r.perVoice.filter((v) => v.missed && v.extra).length;
      rows = [
        { label: "Slices in place", value: r.matched / piece.targets.length, text: `${r.matched} of ${piece.targets.length}` },
        { label: "Extra or wrong slices", value: Math.max(0, 1 - r.extra / piece.targets.length), text: String(r.extra) },
        { label: "Timing", value: Math.max(0, 1 - r.meanAbsErrorMs / 180), text: `${Math.round(r.meanAbsErrorMs)} ms off on average` },
      ];
      headline = !ons.length
        ? "No hits arrived. Check the line under the stage for why."
        : r.correct
          ? `Every slice in its place, ${Math.round(r.meanAbsErrorMs)} ms off on average.`
          : r.extra && wrong
            ? `${r.missed} slices missed and ${r.extra} extra: some went to the wrong pad. The strip shows which.`
            : `${r.matched} of ${piece.targets.length} slices in place${r.extra ? `, ${r.extra} extra` : ""}.`;
    } else {
      take = ons.map((n) => ({ at: n.at, midi: n.midi, velocity: n.velocity }));
      const g = gradeFreeChop(take, downbeat, beatMs, FREE_BARS);
      score = g.score;
      correct = g.correct;
      rows = [
        { label: "Played again", value: g.repeat, text: `${pct(g.repeat)} of the first take found again in the second` },
        { label: "Time", value: g.time, text: g.meanAbsMs === null ? "no hits" : `${Math.round(g.meanAbsMs)} ms from the sixteenth grid on average` },
        { label: "Hits", text: `${g.first} then ${g.second}` },
      ];
      headline = !ons.length
        ? "Nothing was played."
        : g.first < FREE_CHOP.minHits
          ? `Only ${g.first} hits in the first four bars: make a pattern of at least ${FREE_CHOP.minHits}.`
          : g.correct
            ? `A chop of ${g.first} hits, played again ${pct(g.repeat)} the same, in time.`
            : g.repeat < FREE_CHOP.repeatPass
              ? `The second take matched ${pct(g.repeat)} of the first: keep the pattern simple enough to play twice.`
              : `${Math.round(g.meanAbsMs ?? 0)} ms from the grid on average: aim under 25.`;
    }
    if (!ons.length) {
      summary = { headline, metric: pct(0), metricLabel: "score", rows, recorded: false, assistance: "Nothing was played, so nothing is recorded." };
      status = headline;
      return;
    }
    await run!.attempt({ promptId: `chop:${exercise}:${source.id}`, correct, partialCredit: score, metrics: grv?.metrics ?? [], source: runSource(notes), instrument: "mpc" });
    const fin = await run!.finish({ score, correct, headline });
    summary = {
      headline,
      metric: pct(score),
      metricLabel: "score",
      delta: fin.delta,
      best: fin.best,
      xp: fin.xp,
      clean: correct && mode === "check",
      assistance: assistanceText(mode),
      rows,
      advance: piece && source.id !== "file" ? await nextRun(`pads.chop.${exercise}`, { bpm, tempo: { min: 40, goal: exercise === "reorder" && edit.id === "jungle" ? 170 : 110 }, steps: CHOP_EXERCISES.filter((x) => x.id !== "free").map((x) => ({ label: x.label })), step: exercise === "order" ? 0 : 1 }, { score, correct }, tempoAnd((i) => cfg.set({ exercise: ["order", "reorder"][i] }))) : undefined,
    };
    status = headline;
  }

  function hearTake() {
    if (!take.length) return;
    void audio.unlock().then(() => audio.playSequence(take.map((h) => ({ midi: h.midi, time: (h.at - downbeat) / 1000 + 0.05, duration: 0.2, velocity: h.velocity, voice: "kit" as const }))));
  }

  function stop() {
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    cap?.stop();
    phase = "ready";
    status = "Stopped. Nothing was recorded.";
  }

  onDestroy(() => {
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    cap?.stop();
    stopDemo();
    restoreKit();
  });

  /** Each step of the piece as a cell: its slice (0 rings on) and, after a run, how it landed. */
  const every = $derived(exercise === "order" ? (source.bars * 4) / CHOP_SLICES : edit.every);
  const cells = $derived.by(() => {
    const steps = exercise === "order" ? Array.from({ length: CHOP_SLICES }, (_, i) => i + 1) : edit.steps;
    let k = 0;
    return steps.map((slice) => ({ slice, outcome: slice && grv ? grv.perTarget[k++] : undefined }));
  });
  const cellNow = $derived(phase === "running" && now >= downbeat ? Math.floor((now - downbeat) / (every * beatMs)) : null);
  const goodMs = $derived(Math.min(180, beatMs / 8));
</script>

{#snippet padGrid()}
  <Pads {marks} {flashes} {timing} {names} colors={Object.fromEntries(lanes.map((l) => [l.pad, l.color]))} label="MPC pads, bank A, a slice on each. Computer keys Z X C V play the bottom row." />
{/snippet}

<DrillShell
  title="Pads"
  hue="mpc"
  blurb="A loop cut into 16 slices on A01 to A16. Play them back in order, in a written order, or chop your own and play it again."
  summary={summaryLine}
  tabs={modes.map(([id, label]) => ({ id, label }))}
  tab="chop"
  ontab={onmode}
  modeNotes={{ practice: "The slices due light up. Practice, not a test.", check: "The order stays written, the pads stay dark. Counts toward mastery." }}
  bind:phase
  bind:mode
  bind:status
  progress={phase === "running" && now >= downbeat ? clamp((now - downbeat) / lengthMs, 0, 1) : 0}
  clock={{ bpm, beatsPerBar: 4 }}
  ondemo={playDemo}
  demoPlaying={!!demo?.playing}
  onstart={start}
  onstop={stop}
  blocked={source.id === "file" && !file ? "Import your loop first, or pick one of the app's." : cutting || loaded !== want ? "Cutting the loop into slices…" : cutError || null}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Choice label="Exercise" options={CHOP_EXERCISES.map((x) => ({ value: x.id as string, label: x.label, detail: x.detail }))} value={exercise} onchange={(v) => cfg.set({ exercise: v })} setupKey="exercise" />
      <Choice label="Loop" options={[...CHOP_SOURCES.map((x) => ({ value: x.id, label: x.label, detail: x.detail })), { value: "file", label: "Your own loop", detail: "A WAV or MP3 you import" }]} value={s.source} onchange={(v) => {
        cfg.set({ source: v });
        const src = chopSource(v);
        if (src) settings.update({ bpm: src.bpm });
      }} setupKey="source" />
      {#if exercise === "reorder"}
        <Choice label="Order" options={edits.map((e) => ({ value: e.id, label: e.label }))} value={edit.id} onchange={(v) => cfg.set({ edit: v })} setupKey="edit" />
      {/if}
      {#if s.source === "file"}
        <label class="flex flex-col gap-1 text-sm">
          <span class="font-semibold">Your loop</span>
          <input type="file" accept="audio/*" class="text-sm" onchange={importFile} />
          <span class="text-ws-soft">{file ? `${file.name}, ${file.buffer.duration.toFixed(2)} s` : "Trimmed to the loop, one or more whole bars. Kept until you leave the page."}</span>
        </label>
        <Choice label="Bars in the loop" options={[1, 2, 4].map((n) => ({ value: n, label: String(n) }))} value={s.fileBars} onchange={(v) => cfg.set({ fileBars: v })} setupKey="fileBars" />
      {/if}
      {#if piece}
        <Choice label="View" options={[{ value: "lanes", label: "Lanes" }, { value: "grid", label: "Order" }]} value={lanesView ? "lanes" : "grid"} onchange={(v) => cfg.set({ view: v })} setupKey="view" />
        {#if lanesView}
          <Choice label="Look ahead" options={[1, 2, 4].map((n) => ({ value: n, label: n === 1 ? "1 bar" : `${n} bars` }))} value={aheadBars} onchange={(v) => cfg.set({ ahead: v })} setupKey="ahead" />
        {/if}
      {/if}
    </div>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running" && freeHalf}
      <Stat label="Now" value={freeHalf === "first" ? "your chop" : "play it again"} tone={freeHalf === "again" ? "success" : undefined} />
    {:else if phase === "running" && stepNow !== null}
      <Stat label="Bar" value={`${Math.min(Math.floor(stepNow / 16) + 1, Math.ceil(lengthMs / (4 * beatMs)))}`} />
    {/if}
  {/snippet}

  {#snippet stage()}
    <div class="flex flex-col gap-4" data-testid="chop-stage" data-view={showLanes ? "lanes" : "grid"} data-loaded={loaded === want || undefined} data-downbeat={phase === "running" || phase === "countin" ? Math.round(downbeat) : undefined} data-targets={piece ? JSON.stringify(targets.map((t) => [t.pad, Math.round(t.atMs)])) : undefined}>
      <p class="text-sm"><span class="font-semibold">{source.label}.</span> <span class="text-ws-stage-soft">{source.detail}. Slice 1 is on A01 (bottom left), slice 16 on A16. {cutError}</span></p>
      {#if showLanes}
        <PadHighway
          {lanes}
          notes={live}
          now={phase === "running" || phase === "countin" ? now - downbeat : -beatMs}
          {beatMs}
          {aheadBars}
          {lengthMs}
          {judged}
          flash={flashNote}
          countIn={phase === "countin" ? Math.max(1, Math.ceil((downbeat - now) / beatMs)) : null}
          label="{lanes.length} slices: notes coming up"
          pads={padGrid}
        />
      {:else if piece}
        <!-- The order to play, a cell a step: the slice number, and after a run how it landed. -->
        <ol class="chop-strip" aria-label="The slices to play, in order">
          {#each cells as c, i (i)}
            <li
              class="cell"
              class:rest={!c.slice}
              data-now={cellNow === i || undefined}
              data-result={c.outcome === undefined ? undefined : c.outcome === null ? "miss" : Math.abs(c.outcome) <= goodMs ? "ok" : "off"}
              title={c.outcome === undefined ? undefined : c.outcome === null ? "missed" : `${c.outcome > 0 ? "late" : "early"} by ${Math.abs(Math.round(c.outcome))} ms`}
            >
              {#if c.slice}<span class="font-semibold">{c.slice}</span>{:else}<span aria-label="ring on">·</span>{/if}
            </li>
          {/each}
        </ol>
        <p class="text-xs text-ws-stage-soft">{exercise === "order" ? "In order, a slice each step" : `${edit.every === 0.5 ? "An eighth" : edit.every === 1 ? "A beat" : "A sixteenth"} a step; a gap lets the slice before ring`}.</p>
      {:else}
        <p class="rounded-xl bg-ws-stage-ink/8 p-4 text-sm">Bars 1 to {FREE_BARS}: play any slices, in any rhythm, to the click. Bars {FREE_BARS + 1} to {FREE_BARS * 2}: play the same again. Graded on playing it again and on time; hear it back after.</p>
      {/if}
      {#if !showLanes}{@render padGrid()}{/if}
    </div>
  {/snippet}

  {#snippet results()}
    {#if summary}
      <Results {summary}>
        {#snippet actions()}
          {#if take.length}<button type="button" class={btn} onclick={hearTake}>Hear your chop</button>{/if}
        {/snippet}
      </Results>
    {/if}
  {/snippet}

  {#snippet actions()}
    <div class="w-full"><MidiStatus instrument="mpc" /></div>
  {/snippet}
</DrillShell>

<style>
  .chop-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .cell {
    display: grid;
    place-items: center;
    min-width: 2.25rem;
    height: 2.25rem;
    border-radius: 0.5rem;
    font-size: 0.9rem;
    background: color-mix(in oklch, var(--ws-stage-ink) 9%, transparent);
    border: 2px solid transparent;
  }
  .cell.rest {
    background: transparent;
    color: var(--ws-stage-soft);
  }
  .cell[data-now] {
    background: color-mix(in oklch, var(--instr) 45%, transparent);
  }
  .cell[data-result="ok"] {
    border-color: var(--success);
  }
  .cell[data-result="off"] {
    border-color: var(--warn);
  }
  .cell[data-result="miss"] {
    border-color: var(--destructive);
    border-style: dashed;
  }
</style>

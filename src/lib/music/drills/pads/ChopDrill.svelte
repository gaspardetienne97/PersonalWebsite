<script lang="ts">
  // Chop: a loop cut into 16 equal slices on A01 to A16, as the MPC's Chop to
  // pads does. The loop is one of the app's own (its kit and keys, rendered at
  // the tempo) or a file you import. Play the slices back in order, a written
  // reorder, or a free chop of your own that you then play again. The slices
  // are a kit for the run; Create's kit comes back when you leave.
  import { onDestroy } from "svelte";
  import { timingFromErrors } from "#lib/music/drills/piano/lane-outcomes.ts";
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
  import { padLessons } from "@repo/music-core/lessons/pads";
  import DrillShell, { type DrillMode, type Phase, type RunContext, type SetupClause } from "#lib/music/components/DrillShell.svelte";
  import Pads from "#lib/music/components/Pads.svelte";
  import Choice from "#lib/music/components/Choice.svelte";
  import Stat from "#lib/music/components/Stat.svelte";
  import Results, { silentRun, type RunSummary } from "#lib/music/components/Results.svelte";
  import { Flashes, type CellMarks } from "#lib/music/components/feedback.svelte.ts";
  import { btn } from "#lib/music/components/ui.ts";
  import { DrillSetup } from "#lib/music/setup.svelte.ts";
  import { assistanceFor, capture, pct, runSource, type Capture } from "#lib/music/drill.svelte.ts";
  import { practice } from "#lib/music/practice.svelte.ts";
  import { audio, input, settings } from "#lib/music/runtime/index.ts";
  import { nextRun, tempoAnd } from "#lib/music/advance.svelte.ts";
  import { decodeLoop, loadSlices, restoreKit } from "./slices";
  import MidiStatus from "./MidiStatus.svelte";
  import PadHighway, { type HighwayLane, type HighwayNote } from "./PadHighway.svelte";
  import { judgeHit, laneColor, overdue, wavePath, type Judgement, type WavePeaks } from "./lanes";
  import { m } from "@repo/i18n/messages.js";

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
      ? { id: "file", label: file.name, bars: s.fileBars, bpm: Math.round(((s.fileBars * 4 * 60) / file.buffer.duration) * 10) / 10, detail: m.music_winds_chop_your_loop_detail() }
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
  /** The loop's waveform, 40 columns a slice, worked out once when the loop is cut. */
  let wave = $state.raw<WavePeaks | null>(null);
  const PER_SLICE = 40;
  /** Each slice's piece of it as a filled outline: on the tape, and beside its lane. */
  const slicePaths = $derived(wave ? Array.from({ length: CHOP_SLICES }, (_, i) => wavePath(wave!, i * PER_SLICE, (i + 1) * PER_SLICE)) : []);
  /** Slices a beat: cuts on a beat are drawn brighter. */
  const perBeat = $derived(CHOP_SLICES / (source.bars * 4));
  let cutting = $state(false);
  let cutError = $state("");
  const want = $derived(`${source.id}:${source.id === "file" ? `${file?.name}:${s.fileBars}` : bpm}`);

  async function cut(key: string) {
    cutting = true;
    cutError = "";
    try {
      const o = await loadSlices(source, bpm, source.id === "file" ? file?.buffer : undefined, PER_SLICE);
      if (key === want) {
        loaded = key;
        wave = o;
      }
    } catch (e) {
      cutError = m.music_winds_chop_cut_error({ error: (e as Error).message });
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
      status = m.music_winds_chop_file_loaded({ name: file.name, seconds: file.buffer.duration.toFixed(2) });
    } catch {
      status = m.music_winds_chop_file_unreadable();
    }
  }

  /** The slice sounding now (a hit or the demo), lit on the slice picture; null when none. */
  let lit = $state<number | null>(null);
  let litTimer: ReturnType<typeof setTimeout> | undefined;
  function light(slice: number) {
    lit = slice;
    clearTimeout(litTimer);
    litTimer = setTimeout(() => (lit = null), Math.max(160, (source.bars * 4 * beatMs) / CHOP_SLICES));
  }

  // MIDI hits play their slice (on-screen taps already do, through the input layer); every hit lights its slice.
  $effect(() =>
    input.subscribe((e) => {
      if (e.kind !== "noteon" || e.midi < 36 || e.midi >= 36 + CHOP_SLICES) return;
      if (e.source !== "onscreen") audio.playKitPad(e.midi, e.velocity);
      light(e.midi - 36);
    }),
  );

  // ---------------------------------------------------------------------------
  // The run.

  const stepNow = $derived(phase === "running" && now >= downbeat ? Math.floor((now - downbeat) / (beatMs / 4)) : null);
  // The slice number alone on each pad: "Slice 13" wrapped on a small pad, the number reads at a glance.
  const names = Object.fromEntries(Array.from({ length: CHOP_SLICES }, (_, i) => [slicePad(i), String(i + 1)]));
  // The lanes: the slices the piece plays, in order, each ringing until the next slice starts.
  const lanes = $derived<HighwayLane[]>([...new Set(targets.map((t) => t.slice))].sort((a, b) => a - b).map((n) => ({ id: `slice-${n}`, label: m.music_winds_grid_slice({ n }), short: String(n), color: laneColor(`slice-${n}`), pad: slicePad(n - 1), ...(slicePaths[n - 1] ? { wave: { d: slicePaths[n - 1], w: PER_SLICE } } : {}) })));
  const sliceMs = $derived((source.bars * 4 * beatMs) / CHOP_SLICES);
  const live = $derived<(HighwayNote & { pad: number })[]>(
    targets.map((t, i) => ({ pad: t.pad, atMs: t.atMs, lane: lanes.findIndex((l) => l.pad === t.pad), kind: "normal", durMs: Math.min(sliceMs, (targets[i + 1]?.atMs ?? lengthMs) - t.atMs) })),
  );
  const judgeWindow = $derived({ perfect: Math.min(90, beatMs / 16), good: Math.min(180, beatMs / 8) });
  let judged = $state<Record<number, Judgement>>({});
  let flashKey = 0;
  let flashNote = $state<{ judgement: Judgement | "extra"; ms?: number; key: number; lane?: number } | null>(null);
  const timing = new Flashes<"early" | "late" | "perfect">();
  const showLanes = $derived(lanesView && !!piece && phase !== "results" && (mode === "practice" || phase === "ready"));

  const marks = $derived.by(() => {
    const out: Record<number, CellMarks> = {};
    // The demo lights the pad it plays.
    if (demo?.playing && lit !== null) out[slicePad(lit)] = { demo: true };
    if (mode !== "practice" || phase !== "running") return out;
    const rel = now - downbeat;
    const ahead = Math.min(beatMs / 2, 260);
    for (const t of targets) if (t.atMs >= rel - 40 && t.atMs <= rel + ahead) out[t.pad] = { target: true };
    return out;
  });
  const freeHalf = $derived(exercise === "free" && phase === "running" && now >= downbeat ? (now - downbeat < lengthMs / 2 ? "first" : "again") : null);

  const summaryLine = $derived<SetupClause[]>([
    { text: CHOP_EXERCISES.find((x) => x.id === exercise)!.label, focus: "exercise" },
    { text: m.music_winds_chop_source_summary({ source: source.label, count: source.bars }), focus: "source" },
    ...(exercise === "reorder" ? [{ text: edit.label, focus: "edit" }] : []),
    // The strip shows the tempo; an imported loop's own tempo is news.
    ...(source.id === "file" ? [{ text: m.music_winds_chop_loop_bpm({ bpm: Math.round(bpm) }) }] : []),
  ]);

  function stopDemo() {
    demo?.stop();
    demo = null;
    lit = null;
  }
  async function playDemo() {
    if (demo?.playing) return stopDemo();
    await audio.unlock();
    // The whole loop for a free chop; else the slices as written, on the slices themselves.
    const notes = piece
      ? piece.targets.map((t) => ({ midi: CHOP_PADS[t.voice], time: (t.beat * beatMs) / 1000, duration: 0.2, velocity: 0.9, voice: "kit" as const }))
      : Array.from({ length: CHOP_SLICES * 2 }, (_, i) => ({ midi: slicePad(i % CHOP_SLICES), time: (i * source.bars * 4 * beatMs) / CHOP_SLICES / 1000, duration: 0.2, velocity: 0.9, voice: "kit" as const }));
    const handle = audio.playSequence(notes, { onNote: (i) => light(notes[i].midi - 36) });
    demo = handle;
    status = piece ? m.music_winds_chop_demo_written() : m.music_winds_chop_demo_loop();
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
    flashNote = { judgement: hit.judgement, ms: hit.err, key: ++flashKey, lane: live[hit.index].lane };
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
    status = exercise === "free" ? m.music_winds_chop_status_free({ bars: FREE_BARS }) : exercise === "order" ? m.music_winds_chop_status_order() : m.music_winds_chop_status_written();
    const tick = () => {
      now = performance.now();
      const missed = phase === "running" && mode === "practice" && piece ? overdue(live, judged, now - downbeat, judgeWindow.good) : [];
      if (missed.length) {
        judged = { ...judged, ...Object.fromEntries(missed.map((i) => [i, "miss" as const])) };
        flashNote = { judgement: "miss", key: ++flashKey, lane: live[missed[missed.length - 1]].lane };
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
        { label: m.music_winds_chop_row_in_place(), value: r.matched / piece.targets.length, text: m.music_winds_chop_of({ n: r.matched, total: piece.targets.length }) },
        { label: m.music_winds_chop_row_extra(), text: r.extra ? String(r.extra) : m.music_winds_chop_none() },
        r.matched ? { kind: "timing", label: r.matched < piece.targets.length ? m.music_winds_chop_row_timing_from({ count: r.matched }) : m.music_winds_chop_row_timing(), value: Math.max(0, 1 - r.meanAbsErrorMs / 180), text: m.music_winds_chop_ms_off_avg({ ms: Math.round(r.meanAbsErrorMs) }) } : { kind: "timing", label: m.music_winds_chop_row_timing_none(), notMeasured: true },
      ];
      headline = !ons.length
        ? m.music_winds_chop_head_no_hits()
        : r.correct
          ? m.music_winds_chop_head_correct({ ms: Math.round(r.meanAbsErrorMs) })
          : r.extra && wrong
            ? m.music_winds_chop_head_wrong_pad({ missed: r.missed, extra: r.extra })
            : r.extra
              ? m.music_winds_chop_head_in_place_extra({ matched: r.matched, total: piece.targets.length, extra: r.extra })
              : m.music_winds_chop_head_in_place({ matched: r.matched, total: piece.targets.length });
    } else {
      take = ons.map((n) => ({ at: n.at, midi: n.midi, velocity: n.velocity }));
      const g = gradeFreeChop(take, downbeat, beatMs, FREE_BARS);
      score = g.score;
      correct = g.correct;
      rows = [
        { label: m.music_winds_chop_row_played_again(), value: g.repeat, text: m.music_winds_chop_repeat_text({ pct: pct(g.repeat) }) },
        { label: m.music_winds_chop_row_time(), value: g.time, text: g.meanAbsMs === null ? m.music_winds_chop_no_hits() : m.music_winds_chop_grid_avg({ ms: Math.round(g.meanAbsMs) }) },
        { label: m.music_winds_chop_row_hits(), text: m.music_winds_chop_hits_then({ first: g.first, second: g.second }) },
      ];
      headline = !ons.length
        ? m.music_winds_chop_head_nothing()
        : g.first < FREE_CHOP.minHits
          ? m.music_winds_chop_head_too_few({ count: g.first, min: FREE_CHOP.minHits })
          : g.correct
            ? m.music_winds_chop_head_free_ok({ count: g.first, pct: pct(g.repeat) })
            : g.repeat < FREE_CHOP.repeatPass
              ? m.music_winds_chop_head_repeat_low({ pct: pct(g.repeat) })
              : m.music_winds_chop_head_grid_off({ ms: Math.round(g.meanAbsMs ?? 0) });
    }
    if (!ons.length) {
      // Nothing played: the standard not-heard card, no 0% and no bars measured from zero hits.
      grv = null;
      summary = silentRun();
      status = summary.headline;
      return;
    }
    await run!.attempt({ promptId: `chop:${exercise}:${source.id}`, correct, partialCredit: score, metrics: grv?.metrics ?? [], source: runSource(notes), instrument: "mpc" });
    const fin = await run!.finish({ score, correct, headline });
    if (!fin.heard) {
      grv = null;
      summary = silentRun();
      status = summary.headline;
      return;
    }
    summary = {
      headline,
      metric: pct(score),
      metricLabel: m.music_winds_score(),
      delta: fin.delta,
      best: fin.best,
      xp: fin.xp,
      clean: correct && mode === "check",
      mode,
      rows,
      timing: grv ? timingFromErrors(grv.perTarget, grv.windowMs / 2) : undefined,
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
    status = m.music_winds_nothing_saved();
  }

  onDestroy(() => {
    clearTimeout(timer);
    clearTimeout(litTimer);
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
  const running = $derived(phase === "running" || phase === "countin");
</script>

{#snippet slicePicture()}
  <!-- The loop as one waveform, cut where the pads cut it: a line at each chop point with the slice's number hanging
       under it (slice 1 on A01 to 16 on A16), each slice in its pad's colour, the one sounding now lit. On a phone
       beside the lanes it is left out: the lanes and pads carry the numbers. -->
  <figure class="flex flex-col gap-1.5 {showLanes ? 'max-sm:hidden' : ''}" data-testid="slice-picture">
    {#if slicePaths.length}
      <div class="tape">
        <svg viewBox="0 -1 {CHOP_SLICES * PER_SLICE} 2" preserveAspectRatio="none" aria-hidden="true">
          {#each slicePaths as d, i (i)}
            <g data-on={lit === i || undefined} style:--c={laneColor(`slice-${i + 1}`)} transform="translate({i * PER_SLICE} 0)">
              <rect class="bed" x="0" y="-1" width={PER_SLICE} height="2" />
              <path {d} />
            </g>
          {/each}
          {#each Array.from({ length: CHOP_SLICES + 1 }, (_, i) => i) as i (i)}
            <line class="cut" class:beat={i % perBeat === 0} x1={i * PER_SLICE} x2={i * PER_SLICE} y1="-1" y2="1" />
          {/each}
        </svg>
        <ol aria-label={m.music_winds_chop_loop_aria({ count: CHOP_SLICES })}>
          {#each slicePaths as _, i (i)}
            <li class:beat={i % perBeat === 0} data-on={lit === i || undefined} style:--c={laneColor(`slice-${i + 1}`)} aria-label={lit === i ? m.music_winds_chop_slice_sounding({ n: i + 1 }) : m.music_winds_grid_slice({ n: i + 1 })}><span>{i + 1}</span></li>
          {/each}
        </ol>
      </div>
    {/if}
    <figcaption class="text-sm text-ws-stage-soft"><span class="font-semibold text-ws-stage-ink">{source.label}.</span> {source.detail}. {m.music_winds_chop_slice_one()} {cutError}</figcaption>
  </figure>
{/snippet}

{#snippet padGrid()}
  <div data-dock="answers">
    <Pads {marks} {flashes} {timing} {names} fit={running && !showLanes} colors={Object.fromEntries(lanes.map((l) => [l.pad, l.color]))} label={m.music_winds_chop_pads_label()} />
  </div>
{/snippet}

{#snippet side()}
  {@render slicePicture()}
  {@render padGrid()}
{/snippet}

<DrillShell
  title={m.music_winds_pads_title()}
  hue="mpc"
  blurb={m.music_winds_chop_blurb()}
  summary={summaryLine}
  tabs={modes.map(([id, label]) => ({ id, label }))}
  tab="chop"
  ontab={onmode}
  lesson={{ lessons: padLessons("chop", undefined, [exercise, ...(exercise === "reorder" ? [`edit:${edit.id}`] : [])]) }}
  bind:phase
  bind:mode
  bind:status
  progress={phase === "running" && now >= downbeat ? clamp((now - downbeat) / lengthMs, 0, 1) : 0}
  clock={{ bpm, beatsPerBar: 4 }}
  ondemo={playDemo}
  demoPlaying={!!demo?.playing}
  onstart={start}
  onstop={stop}
  blocked={source.id === "file" && !file ? m.music_winds_chop_blocked_import() : cutting || loaded !== want ? m.music_winds_chop_blocked_cutting() : cutError || null}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Choice label={m.music_winds_exercise()} options={CHOP_EXERCISES.map((x) => ({ value: x.id as string, label: x.label, detail: x.detail }))} value={exercise} onchange={(v) => cfg.set({ exercise: v })} setupKey="exercise" />
      <Choice label={m.music_winds_chop_loop()} options={[...CHOP_SOURCES.map((x) => ({ value: x.id, label: x.label, detail: x.detail })), { value: "file", label: m.music_winds_chop_own_loop(), detail: m.music_winds_chop_own_loop_detail() }]} value={s.source} onchange={(v) => {
        cfg.set({ source: v });
        const src = chopSource(v);
        if (src) settings.update({ bpm: src.bpm });
      }} setupKey="source" />
      {#if exercise === "reorder"}
        <Choice label={m.music_winds_chop_order()} options={edits.map((e) => ({ value: e.id, label: e.label }))} value={edit.id} onchange={(v) => cfg.set({ edit: v })} setupKey="edit" />
      {/if}
      {#if s.source === "file"}
        <label class="flex flex-col gap-1 text-sm">
          <span class="font-semibold">{m.music_winds_chop_your_loop_detail()}</span>
          <input type="file" accept="audio/*" class="text-sm" onchange={importFile} />
          <span class="text-ws-soft">{file ? m.music_winds_chop_file_info({ name: file.name, seconds: file.buffer.duration.toFixed(2) }) : m.music_winds_chop_file_hint()}</span>
        </label>
        <Choice label={m.music_winds_chop_bars_in_loop()} options={[1, 2, 4].map((n) => ({ value: n, label: String(n) }))} value={s.fileBars} onchange={(v) => cfg.set({ fileBars: v })} setupKey="fileBars" />
      {/if}
      {#if piece}
        <Choice label={m.music_winds_view()} options={[{ value: "lanes", label: m.music_winds_view_lanes() }, { value: "grid", label: m.music_winds_chop_order() }]} value={lanesView ? "lanes" : "grid"} onchange={(v) => cfg.set({ view: v })} setupKey="view" />
        {#if lanesView}
          <Choice label={m.music_winds_look_ahead()} options={[1, 2, 4].map((n) => ({ value: n, label: m.music_winds_bars_count({ count: n }) }))} value={aheadBars} onchange={(v) => cfg.set({ ahead: v })} setupKey="ahead" />
        {/if}
      {/if}
    </div>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running" && freeHalf}
      <Stat label={m.music_winds_chop_now()} value={freeHalf === "first" ? m.music_winds_chop_your_chop() : m.music_winds_chop_play_again()} tone={freeHalf === "again" ? "success" : undefined} />
    {:else if phase === "running" && stepNow !== null}
      <Stat label={m.music_winds_bar()} value={m.music_winds_chop_of({ n: Math.min(Math.floor(stepNow / 16) + 1, Math.ceil(lengthMs / (4 * beatMs))), total: Math.ceil(lengthMs / (4 * beatMs)) })} />
    {/if}
  {/snippet}

  {#snippet stage()}
    <div class="flex flex-col gap-4" data-testid="chop-stage" data-view={showLanes ? "lanes" : "grid"} data-loaded={loaded === want || undefined} data-downbeat={phase === "running" || phase === "countin" ? Math.round(downbeat) : undefined} data-targets={piece ? JSON.stringify(targets.map((t) => [t.pad, Math.round(t.atMs)])) : undefined}>
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
          label={m.music_winds_chop_highway_label({ count: lanes.length })}
          pads={side}
          fill={running}
          alone={running ? null : "pads"}
        />
      {:else if piece}
        {@render slicePicture()}
        <!-- The order to play, a cell a step: the slice number, and after a run how it landed. The step due now is
             ringed in both modes (it is the clock, not a hint: the order is written). -->
        <p class="text-sm text-ws-stage-soft"><span class="font-semibold text-ws-stage-ink">{m.music_winds_chop_play_order()}</span> {exercise === "order" ? m.music_winds_chop_step_in_order() : edit.every === 0.5 ? m.music_winds_chop_step_eighth() : edit.every === 1 ? m.music_winds_chop_step_beat() : m.music_winds_chop_step_sixteenth()}</p>
        <ol class="chop-strip" aria-label={m.music_winds_chop_play_order_aria()}>
          {#each cells as c, i (i)}
            <li
              class="cell"
              class:rest={!c.slice}
              data-now={cellNow === i || undefined}
              data-done={(cellNow !== null && i < cellNow) || undefined}
              data-result={c.outcome === undefined ? undefined : c.outcome === null ? "miss" : Math.abs(c.outcome) <= goodMs ? "ok" : "off"}
              title={c.outcome === undefined ? undefined : c.outcome === null ? m.music_winds_missed() : (c.outcome > 0 ? m.music_winds_late_by : m.music_winds_early_by)({ ms: Math.abs(Math.round(c.outcome)) })}
            >
              {#if c.slice}<span class="font-semibold">{c.slice}</span>{:else}<span aria-label={m.music_winds_chop_ring_on()}>•</span>{/if}
            </li>
          {/each}
        </ol>
      {:else}
        {@render slicePicture()}
        <p class="rounded-xl bg-ws-stage-ink/8 p-4 text-sm">{m.music_winds_chop_free_help({ bars: FREE_BARS, from: FREE_BARS + 1, to: FREE_BARS * 2 })}</p>
      {/if}
      {#if !showLanes}{@render padGrid()}{/if}
    </div>
  {/snippet}

  {#snippet results()}
    {#if summary}
      <Results {summary}>
        {#snippet actions()}
          {#if take.length}<button type="button" class={btn} onclick={hearTake}>{m.music_winds_chop_hear()}</button>{/if}
        {/snippet}
      </Results>
    {/if}
  {/snippet}

  {#snippet actions()}
    <!-- The device line before and after a run, never under a live run (nothing can be fixed mid-run). -->
    {#if phase !== "running" && phase !== "countin"}<div class="w-full"><MidiStatus instrument="mpc" since={summary?.heard === false ? downbeat : null} /></div>{/if}
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
    border-color: var(--ws-stage-ink);
  }
  .cell[data-done]:not([data-result]) {
    color: var(--ws-stage-soft);
  }
  /* The slice picture: the loop as one waveform on a strip of tape, a line at each chop point, the slice's number
     hanging under its line; each slice in its pad's colour, the one sounding lit. */
  .tape {
    container-type: inline-size;
    --cut: color-mix(in oklch, var(--ws-stage-ink) 26%, transparent);
    --cut-beat: color-mix(in oklch, var(--ws-stage-ink) 62%, transparent);
  }
  .tape svg {
    display: block;
    width: 100%;
    height: 3.5rem;
    border-radius: 0.4rem 0.4rem 0 0;
    background: color-mix(in oklch, var(--ws-stage-ink) 6%, transparent);
  }
  .tape path {
    fill: color-mix(in oklch, var(--c) 82%, var(--ws-stage-ink));
  }
  .tape .bed {
    fill: color-mix(in oklch, var(--c) 9%, transparent);
  }
  .tape g[data-on] .bed {
    fill: color-mix(in oklch, var(--c) 42%, transparent);
  }
  .tape g[data-on] path {
    fill: var(--ws-stage-ink);
  }
  .tape .cut {
    stroke: var(--cut);
    stroke-width: 1px;
    vector-effect: non-scaling-stroke;
  }
  .tape .cut.beat {
    stroke: var(--cut-beat);
  }
  .tape ol {
    display: grid;
    grid-template-columns: repeat(16, minmax(0, 1fr));
  }
  .tape li {
    min-width: 0;
    padding: 0.2rem 0 0.1rem 0.25rem;
    border-left: 1px solid var(--cut);
    border-top: 3px solid var(--c);
    font-size: 0.8125rem;
    font-weight: 700;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
    color: var(--ws-stage-soft);
  }
  .tape li.beat {
    border-left-color: var(--cut-beat);
    color: var(--ws-stage-ink);
  }
  .tape li[data-on] {
    color: var(--ws-stage-ink);
    background: color-mix(in oklch, var(--c) 42%, transparent);
  }
  /* Narrow, every other number, so none run together (the one sounding always shows its own). */
  @container (max-width: 28rem) {
    .tape svg {
      height: 2.75rem;
    }
    .tape li {
      padding-left: 0.15rem;
    }
    .tape li:nth-child(even):not([data-on]) span {
      visibility: hidden;
    }
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

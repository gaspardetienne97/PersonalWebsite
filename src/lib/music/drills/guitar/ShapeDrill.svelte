<script lang="ts">
  // Chord-Perfect Build and Pick. Build: fret the shape and sound each string low
  // to high, untimed. Pick: the same strings one per click after the count-in.
  // Graded per string on pitch (gradeChordStrings): it measures which notes were
  // sounded, not which string they came from or how clean they rang.
  import { m } from "@repo/i18n/messages.js";
  import { onDestroy } from "svelte";
  import type { NoteEvent } from "@repo/music-core";
  import { enough, evennessRow, noteName, pc, TOO_FEW } from "@repo/music-core";
  import { nearMiss } from "@repo/music-core/signal/pitch";
  import { catalogEntry } from "@repo/music-core/content/catalog";
  import { conceptCard } from "@repo/music-core/lessons/cards";
  import { chordPerfectTargets } from "@repo/music-core/content/technique";
  import { gradeChordStrings, gradeLine } from "@repo/music-core/scoring/technique";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "#lib/music/components/DrillShell.svelte";
  import Stat from "#lib/music/components/Stat.svelte";
  import Hint from "#lib/music/components/Hint.svelte";
  import Results, { silentRun, type RunSummary } from "#lib/music/components/Results.svelte";
  import { Flashes } from "#lib/music/components/feedback.svelte.ts";
  import { nextRun, tempoAnd } from "#lib/music/advance.svelte.ts";
  import { DrillSetup } from "#lib/music/setup.svelte.ts";
  import { assistanceFor, capture, pct, runInstrument, runSource, type Capture } from "#lib/music/drill.svelte.ts";
  import { practice } from "#lib/music/practice.svelte.ts";
  import { audio, mic, settings } from "#lib/music/runtime/index.ts";
  import { exerciseFor, neckLabel, skillsFor } from "./fretted";
  import { fretted, tuningFor } from "./instrument.svelte";
  import { chordId, chordLabel, chordRef, positionsOn, positionText, shapesFor, toneName } from "./chords";
  import MicPanel from "./MicPanel.svelte";
  import ChordPicker from "./ChordPicker.svelte";
  import PositionPicker from "./PositionPicker.svelte";
  import LineNotation from "#lib/music/notation/LineNotation.svelte";
  import ShapeBoard from "./ShapeBoard.svelte";
  import ChordDiagram from "#lib/music/components/ChordDiagram.svelte";
  import { CHORD_MODES, openMode } from "./modes";

  let { kind }: { kind: "build" | "pick" } = $props();
  // svelte-ignore state_referenced_locally
  const isPick = kind === "pick";
  const IDLE_MS = 20_000;

  const cfg = new DrillSetup(isPick ? "chords-pick" : "chords-build", { shape: "guitar.c-major", position: 0 });
  const s = $derived(cfg.value);
  const entry = catalogEntry("chords")!.modes.find((m) => m.id === kind)!;
  const instr = $derived(fretted());
  const tuning = $derived(tuningFor(instr));
  // Root and quality from the setup's shape id (curated, generated, or the other instrument's), on this instrument.
  const ref = $derived(chordRef(s.shape) ?? { root: 0, quality: "maj" });
  const baseId = $derived(chordId(instr, ref));
  const positions = $derived(positionsOn(baseId, tuning));
  const posIndex = $derived(Math.min(s.position, Math.max(0, positions.length - 1)));
  const shape = $derived(positions[posIndex] ?? positions[0] ?? shapesFor(instr)[0]);
  const symbol = $derived(chordLabel(ref));
  const targets = $derived(chordPerfectTargets(shape, tuning));
  const key = $derived(`${kind}:${shape.id}`);
  const bpm = () => Math.min(160, Math.max(40, settings.value.bpm));

  let phase = $state<Phase>("ready");
  let mode = $state<DrillMode>("practice");
  let status = $state("");
  let matched = $state<boolean[]>([]);
  let heard = $state<number | null>(null);
  /** What was wrong with the last note heard, in words; null when it matched. */
  let miss = $state<string | null>(null);
  let beat = $state(-1);
  let demoMidi = $state<number | null>(null);
  let demo: { stop(): void; playing: boolean } | null = $state(null);
  let summary = $state<RunSummary | null>(null);
  let missedStrings = $state<number[]>([]);
  const flashes = new Flashes();
  let cap: Capture | null = null;
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let beatTimer: ReturnType<typeof setInterval> | undefined;
  let stopClockRef: (() => void) | null = null;

  const cursor = $derived(isPick ? beat : matched.findIndex((m) => !m));
  // Pick: the strings one a click as tab, the cursor on the click or the demo.
  const pickTab = $derived(isPick ? targets.map((t, i) => ({ midi: t.midi, startBeat: i, durationBeats: 1, string: t.string, fret: t.fret })) : []);
  const pickCursor = $derived(demoMidi !== null ? Math.max(0, targets.findIndex((t) => t.midi === demoMidi)) : phase === "running" && beat >= 0 ? beat : null);
  const live = $derived(phase === "running" || phase === "countin");

  function stopDemo() {
    demo?.stop();
    demo = null;
    demoMidi = null;
  }

  async function playDemo() {
    if (demo?.playing) return stopDemo();
    await audio.unlock();
    const gap = isPick ? 60 / bpm() : 0.45;
    const notes = targets.map((t, i) => ({ midi: t.midi, time: i * gap, duration: 1.4 }));
    // Build ends on the chord strummed; Pick is the strings only, as it is graded.
    const strum = isPick ? [] : targets.map((t, i) => ({ midi: t.midi, time: targets.length * gap + 0.3 + i * 0.02, duration: 1.6 }));
    const handle = audio.playSequence([...notes, ...strum], {
      onNote: (i: number) => (demoMidi = i < targets.length ? targets[i].midi : null),
    });
    demo = handle;
    status = isPick ? m.music_strings_shape_demo({ symbol }) : m.music_strings_shape_demo_strum({ symbol });
    void handle.done.then(() => {
      if (demo === handle) stopDemo();
    });
  }

  function idle() {
    clearTimeout(timer);
    timer = setTimeout(() => void finish(), IDLE_MS);
  }

  function onNote(e: NoteEvent) {
    if (e.kind !== "noteon" || phase !== "running") return;
    heard = e.midi;
    const want = targets[Math.max(0, cursor)];
    // Pitch only: the first unmatched string with this note, the next one in order first.
    const order = [...targets.keys()].sort((a, b) => Math.abs(a - Math.max(0, cursor)) - Math.abs(b - Math.max(0, cursor)));
    const k = order.find((i) => !matched[i] && targets[i].midi === e.midi);
    if (k !== undefined) {
      miss = null;
      matched[k] = true;
      if (mode === "practice") flashes.add(targets[k].string * 100 + targets[k].fret, "correct");
      if (matched.every(Boolean)) return void setTimeout(() => void finish(), 250);
    } else {
      // Say what is really wrong: the tuning (a quarter tone off), the octave, or the note. Check never names the target.
      const near = e.source === "audio" ? nearMiss(e.midi, e.cents, targets.filter((_, i) => !matched[i]).map((t) => t.midi)) : null;
      // One plain message, in the chord's own spelling, naming the string to play: no octave numbers.
      const heardName = toneName(e.midi, ref, false);
      const where = (t: (typeof targets)[number]) => (t.fret ? m.music_strings_shape_where_fret({ string: t.string, fret: t.fret, note: toneName(t.midi, ref, false) }) : m.music_strings_shape_where_open({ string: t.string, note: toneName(t.midi, ref, false) }));
      miss = near
        ? (near.cents > 0 ? m.music_strings_shape_near_sharp : m.music_strings_shape_near_flat)({ heard: heardName, cents: Math.abs(near.cents) })
        : mode === "check"
          ? m.music_strings_shape_wrong_check({ heard: heardName })
          : want && pc(want.midi) === pc(e.midi)
            ? m.music_strings_shape_wrong_octave({ where: where(want) })
            : want
              ? m.music_strings_shape_wrong_play({ where: where(want) })
              : m.music_strings_shape_wrong_not_in({ heard: heardName });
      if (mode === "practice" && e.string !== undefined && e.fret !== undefined) flashes.add(e.string * 100 + e.fret, "wrong");
    }
    if (!isPick) idle();
  }

  async function start(ctx: RunContext) {
    stopDemo();
    summary = null;
    missedStrings = [];
    heard = null;
    miss = null;
    matched = targets.map(() => false);
    flashes.clear();
    run = practice.beginRun({
      exerciseId: exerciseFor(entry.exerciseId, instr),
      setupKey: key,
      skillIds: skillsFor(entry.skillIds, instr),
      capabilities: ["technique"],
      modality: "played",
      assistance: assistanceFor(mode),
      difficulty: Math.min(1, shape.difficulty / 5 + (posIndex > 0 ? 0.1 : 0) + (isPick ? 0.1 : 0)),
      instrument: instr,
      params: { shape: shape.id, position: posIndex, ...(isPick ? { bpm: ctx.bpm } : {}) },
    });
    if (isPick) {
      cap = capture(ctx.downbeat - ctx.beatMs / 2, (e) => e.kind === "noteon" && onNote(e));
      const tickBeat = () => (beat = Math.min(targets.length, Math.floor((performance.now() - ctx.downbeat) / ctx.beatMs + 0.5)));
      beatTimer = setInterval(tickBeat, 40);
      timer = setTimeout(() => void finish(), Math.max(0, ctx.downbeat - performance.now()) + (targets.length + 2) * ctx.beatMs);
      stopClockRef = ctx.stopClock;
    } else {
      beat = -1;
      cap = capture(ctx.downbeat, (e) => e.kind === "noteon" && onNote(e));
      status = m.music_strings_shape_play_build({ symbol, string: targets[0].string });
      idle();
    }
  }

  function halt() {
    clearTimeout(timer);
    clearInterval(beatTimer);
    stopClockRef?.();
    cap?.stop();
    beat = -1;
  }

  async function finish() {
    if (phase !== "running" && phase !== "countin") return;
    halt();
    const notes = cap?.notes ?? [];
    const ons = notes.filter((n) => n.kind === "noteon");
    const r = gradeChordStrings(
      targets.map((t) => t.midi),
      ons.map((n) => n.midi),
    );
    const line = isPick ? gradeLine({ beats: targets.map((t) => [{ midi: t.midi }]), beatMs: 60000 / bpm(), notes }) : null;
    phase = "results";
    await run!.attempt({
      promptId: shape.id,
      correct: r.correct,
      partialCredit: r.score,
      metrics: [...r.metrics, ...(line ? line.metrics.filter((m) => m.kind === "timing") : [])],
      source: runSource(notes),
      instrument: runInstrument(notes, instr) ?? null,
      target: targets.map((t) => t.midi),
      response: ons.map((n) => n.midi),
    });
    const fin = await run!.finish({ score: r.score, correct: r.correct, headline: m.music_strings_shape_run_headline({ symbol, n: r.matched, total: r.total }) });
    if (!fin.heard) {
      summary = silentRun();
      status = summary.headline;
      return;
    }
    const missedTargets = targets.filter((t) => !r.strings.some((x) => x.midi === t.midi && x.matched));
    missedStrings = missedTargets.map((t) => t.string);
    summary = {
      headline: !ons.length
        ? m.music_strings_shape_nothing_heard()
        : r.correct
          ? (mode === "check" ? m.music_strings_shape_all_matched_check : m.music_strings_shape_all_matched)({ total: r.total, symbol })
          : m.music_strings_shape_some_matched({ n: r.matched, total: r.total, missed: missedTargets.map((t) => m.music_strings_shape_string_note({ string: t.string, note: toneName(t.midi, ref) })).join(", ") }),
      metric: `${r.matched}/${r.total}`,
      metricLabel: m.music_strings_shape_metric_label(),
      delta: fin.delta,
      best: fin.best,
      clean: r.correct && mode === "check",
      cleanMeans: m.music_strings_shape_clean_means(),
      xp: fin.xp,
      mode,
      rows: [
        { label: m.music_strings_shape_row_matched(), value: r.score, text: m.music_strings_n_of_total({ n: r.matched, total: r.total }) },
        { label: m.music_strings_row_other_notes(), text: r.extra.length ? r.extra.map((x) => noteName(x)).join(", ") : m.music_strings_none() },
        ...(line
          ? [
              evennessRow(line.evenness, line.clean, line.total),
              enough(line.clean, line.total) ? { label: m.music_strings_row_timing_error(), text: m.music_strings_ms_average({ ms: Math.round(line.meanTimingErrorMs) }) } : { label: m.music_strings_row_timing_error(), notMeasured: true, text: TOO_FEW },
            ]
          : []),
        { label: m.music_strings_row_which_string_note(), notMeasured: true },
        { label: m.music_strings_row_tone_clean(), notMeasured: true },
      ],
      advance: ons.length ? await advanceAfter(r.score, r.correct) : undefined,
    };
    status = summary.headline;
  }

  /** The chord's positions up the neck, low to high; Pick also climbs the tempo to 100 first. */
  function advanceAfter(score: number, correct: boolean) {
    const plan = { steps: positions.map((p) => ({ label: `${symbol}, ${positionText(p.positionLabel)}` })), step: posIndex };
    const setPos = (i: number) => cfg.set({ position: i });
    if (isPick) return nextRun(`${instr}.chords.pick.${baseId}`, { ...plan, bpm: bpm(), tempo: { min: 40, goal: 100, max: 160 } }, { score, correct }, tempoAnd(setPos));
    return nextRun(`${instr}.chords.build.${baseId}`, plan, { score, correct }, ({ step }) => step !== undefined && setPos(step));
  }

  function stop() {
    // Build is untimed: Stop is its one end control, and grades what was played (nothing heard is not scored).
    if (!isPick && phase === "running") return void finish();
    halt();
    phase = "ready";
    status = m.music_strings_nothing_saved();
  }

  onDestroy(() => {
    halt();
    stopDemo();
    mic.stop();
  });

  const summaryLine = $derived([{ text: symbol, focus: "chord" }, { text: shape.positionLabel != null ? positionText(shape.positionLabel) : m.music_strings_open_position() }, { text: isPick ? m.music_strings_shape_one_per_click() : m.music_strings_untimed() }]);
  const showShape = $derived(mode === "practice" || phase === "results");
  /** Beside Stop on a phone: the string to sound now (its note too in Practice). */
  const cue = $derived.by(() => {
    const t = targets[Math.max(0, cursor)];
    if (phase !== "running" || !t || cursor >= targets.length) return "";
    if (mode === "practice") return (isPick ? m.music_strings_shape_cue_pick_note : m.music_strings_shape_cue_sound_note)({ string: t.string, note: toneName(t.midi, ref) });
    return (isPick ? m.music_strings_shape_cue_pick : m.music_strings_shape_cue_sound)({ string: t.string });
  });
</script>

{#snippet picker()}
  <PositionPicker {positions} index={posIndex} {symbol} onchange={(i) => cfg.set({ position: i })} />
{/snippet}

<DrillShell
  lesson={{ lessons: conceptCard("tips.chords", { tuning }), trigger: "check" }}
  title={isPick ? m.music_strings_shape_title_pick() : m.music_strings_shape_title_build()}
  hue={instr}
  blurb={isPick
    ? m.music_strings_shape_blurb_pick({ from: String(targets[0]?.string), to: String(targets.at(-1)?.string) })
    : m.music_strings_shape_blurb_build({ from: String(targets[0]?.string), to: String(targets.at(-1)?.string) })}
  summary={summaryLine}
  tabs={CHORD_MODES}
  tab={kind}
  ontab={(id) => openMode(CHORD_MODES, id)}
  bind:phase
  bind:mode
  bind:status
  progress={null}
  clock={isPick ? { bpm: bpm(), beatsPerBar: 4 } : null}
  ondemo={playDemo}
  demoPlaying={!!demo?.playing}
  onstart={start}
  onstop={stop}
  {cue}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2">
      <ChordPicker label={m.music_strings_chord()} instrument={instr} value={baseId} onchange={(id) => cfg.set({ shape: id, position: 0 })} setupKey="chord" />
    </div>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running"}
      <Stat label={m.music_strings_target_notes()} value={m.music_strings_n_of_total({ n: matched.filter(Boolean).length, total: targets.length })} />
      <!-- A match only: a miss is said once, in plain words on the stage. -->
      {#if heard !== null && !miss}<Stat label={m.music_strings_heard()} value="✓ {toneName(heard, ref, false)}" />{/if}
    {/if}
  {/snippet}

  {#snippet stage()}
    <!-- The microphone sits above the neck, so a silent run is fixed without scrolling. -->
    <div class="mb-3 empty:hidden"><MicPanel disabled={live} offer={phase !== "ready"} hint={instr === "ukulele" ? m.music_strings_shape_mic_hint_ukulele() : m.music_strings_shape_mic_hint_guitar()} /></div>
    <!-- The chord's name with its positions beside it (before a run), so the whole neck fits a laptop's first view. -->
    <div class="mb-3 flex flex-col justify-center gap-3" data-dock="music">
      <div class="flex min-w-0 items-center gap-4">
        <p class="shrink-0 font-display text-5xl font-bold leading-none">{symbol}</p>
        {#if !live && phase !== "results"}
          <div class="min-w-0 flex-1 max-sm:hidden">{@render picker()}</div>
        {/if}
      </div>
      {#if isPick && (mode === "practice" || phase === "results")}
        <LineNotation
          notes={pickTab}
          tuning={{ openStrings: tuning.openStrings, fretCount: tuning.fretCount, name: tuning.name }}
          title={key}
          cursorBeat={pickCursor}
          groupStates={Object.fromEntries(matched.flatMap((m, i) => (m ? [[i, "correct" as const]] : [])))}
        />
      {/if}
    </div>
    <div class="flex flex-col justify-end" data-dock="instrument"><ShapeBoard {shape} {tuning} show={showShape} demo={demoMidi} {flashes} compact={!live} heard={targets.filter((_, i) => matched[i]).map((t) => t.string)} label={neckLabel(instr, symbol)} /></div>
    {#if !live && phase !== "results"}
      <!-- On a phone the positions follow the neck, so the whole neck sits above Start. -->
      <div class="mt-3 sm:hidden">{@render picker()}</div>
    {/if}
    <ol class="mt-3 flex flex-wrap gap-1.5" aria-label={m.music_strings_shape_strings_order()}>
      {#each targets as t, i (t.string)}
        {@const done = matched[i]}
        <li
          class="tnum flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm {done
            ? 'border-transparent bg-success/90 font-semibold text-white'
            : live && i === cursor && miss && mode === 'practice'
              ? 'border-warn text-ws-stage-ink ring-2 ring-warn'
              : live && i === cursor
                ? 'border-instr text-ws-stage-ink ring-2 ring-instr'
                : 'border-ws-stage-ink/25 text-ws-stage-soft'}"
        >
          <span>{m.music_strings_string_n({ n: t.string })}</span>
          <span class="font-semibold">{showShape || done ? toneName(t.midi, ref) : "?"}</span>
          {#if done}<span aria-hidden="true">✓</span><span class="sr-only">{m.music_strings_matched()}</span>{:else if live && i === cursor}<span class="sr-only">{m.music_strings_next()}</span>{/if}
        </li>
      {/each}
    </ol>
    {#if phase === "running" && miss}
      <p class="mt-3 flex items-start gap-2 text-base font-medium text-ws-stage-ink" data-testid="heard-miss"><span class="text-warn" aria-hidden="true">⚠</span>{miss}</p>
    {/if}
    <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 [&_button[data-hint]]:text-ws-stage-soft">
      {#if phase === "running" && !isPick}<span class="text-sm text-ws-stage-soft">{m.music_strings_shape_stop_when_done()}</span>{/if}
      <span class="text-sm text-ws-stage-soft">{mode === "check" && phase !== "results" ? m.music_strings_shape_check_hidden() : m.music_strings_what_is_scored()}</span>
      <Hint about={m.music_strings_what_is_scored_about()} text={m.music_strings_shape_scored_hint()} />
    </div>
  {/snippet}

  {#snippet results()}
    {#if summary}
      <!-- The shape and each string's take: the marks the count above is made of. -->
      {#snippet figure()}
        <div class="flex flex-wrap items-start gap-5" data-testid="shape-marked">
          <div class="w-28 shrink-0"><ChordDiagram frets={shape.frets} fingers={shape.fingers} barre={shape.barre} label="{symbol}, {shape.positionLabel != null ? positionText(shape.positionLabel) : m.music_strings_open_position_lower()}" /></div>
          <ol class="flex min-w-0 flex-1 flex-col gap-1.5 text-sm" aria-label={m.music_strings_each_string()}>
            {#each targets as t (t.string)}
              {@const ok = !missedStrings.includes(t.string)}
              <li class="flex items-center gap-2">
                <span class="grid size-6 place-items-center rounded-full text-[13px] font-bold {ok ? 'bg-success text-success-foreground' : 'bg-destructive text-[color:var(--on-destructive)]'}" aria-hidden="true">{ok ? "✓" : "✕"}</span>
                <span>{@html m.music_strings_string_note({ string: t.string, note: `<span class="font-semibold">${toneName(t.midi, ref)}</span>` })}</span>
                <span class="sr-only">{ok ? m.music_strings_matched() : m.music_strings_fretmark_missed()}</span>
              </li>
            {/each}
          </ol>
        </div>
      {/snippet}
      <Results {summary} figure={summary.heard === false ? undefined : figure} />
    {/if}
  {/snippet}
</DrillShell>

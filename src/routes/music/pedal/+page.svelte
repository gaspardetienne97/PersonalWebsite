<script lang="ts">
  // Legato (syncopated) pedalling: a chord a bar, the sustain pedal lifted just
  // after each new chord sounds and pressed straight down again. Each change is
  // judged from CC 64 against the chord's first note; the line under the chart
  // draws what the pedal did.
  import { onDestroy } from "svelte";
  import type { InputEvent, NoteEvent } from "@repo/music-core";
  import { FLAT_NAMES, noteName, pc } from "@repo/music-core";
  import { PEDAL_PROGRESSIONS, pedalChords } from "@repo/music-core/content/piano";
  import { gradePedal, PEDAL, type PedalResult, type PedalVerdict } from "@repo/music-core/scoring/piano";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "$lib/music/components/DrillShell.svelte";
  import { pedalLesson } from "@repo/music-core/lessons/technique";
  import Piano from "$lib/music/components/Piano.svelte";
  import LineNotation from "$lib/music/notation/LineNotation.svelte";
  import { signatureFor } from "@repo/music-core/theory/circle";
  import Choice from "$lib/music/components/Choice.svelte";
  import KeyPicker from "$lib/music/components/KeyPicker.svelte";
  import type { SetupClause } from "$lib/music/components/DrillShell.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { type RunSummary } from "$lib/music/components/Results.svelte";
  import { Flashes, type CellMarks } from "$lib/music/components/feedback.svelte";
  import { btn } from "$lib/music/components/ui";
  import { benchFromUrl, sounding, spanOf, Transport, type TimedNote } from "$lib/music/drills/piano/transport.svelte";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { assistanceFor, assistanceText, capture, pct, runInstrument, runSource, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { settings } from "$lib/music/runtime";
  import { nextRun, tempoAnd } from "$lib/music/advance.svelte";

  const TEMPO = { min: 40, max: 120 };
  let mode = $state<DrillMode>(benchFromUrl(TEMPO));
  const cfg = new DrillSetup("pedal", { key: 0, progression: "I-vi-IV-V" as string, rounds: 2 });
  const s = $derived(cfg.value);
  const bpm = $derived(Math.min(TEMPO.max, Math.max(TEMPO.min, settings.value.bpm)));
  const beatMs = $derived(60000 / bpm);
  const barMs = $derived(4 * beatMs);
  const progression = $derived(PEDAL_PROGRESSIONS.find((p) => p.id === s.progression) ?? PEDAL_PROGRESSIONS[0]);
  const once = $derived(pedalChords(pc(s.key), progression.id));
  const bars = $derived(Array.from({ length: Math.max(1, Math.min(4, s.rounds)) }, () => once).flat());

  let phase = $state<Phase>("ready");
  let status = $state("");
  let summary = $state<RunSummary | null>(null);
  let result = $state.raw<PedalResult | null>(null);
  let chordOk = $state<boolean[]>([]);
  let downbeat = $state(0);
  let now = $state(0);
  let pedalDown = $state(false);
  let pedalTrace = $state.raw<{ at: number; value: number }[]>([]);
  const flashes = new Flashes();
  const transport = new Transport();
  let cap: Capture | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let raf = 0;
  let stopClockRef: (() => void) | null = null;
  let run: ReturnType<typeof practice.beginRun> | null = null;

  const barIndex = $derived(phase === "running" && now >= downbeat ? Math.min(bars.length - 1, Math.floor((now - downbeat) / barMs)) : null);
  const current = $derived(barIndex === null ? (phase === "ready" ? bars[0] : null) : bars[barIndex]);
  /** The chart as timed notes, for Hear it first: each chord held for its bar. */
  const demoNotes = $derived<TimedNote[]>(bars.flatMap((b, k) => [b.leftHand, ...b.rightHand].map((midi, i) => ({ midi, beat: k * 4, dur: 4, hand: i === 0 ? ("left" as const) : ("right" as const) }))));
  const marks = $derived.by(() => {
    const out: Record<number, CellMarks> = {};
    if (transport.playing) {
      for (const n of sounding(demoNotes, transport.beat)) out[n.midi] = { demo: true, label: n.hand === "left" ? "L" : "R", role: n.hand };
      return out;
    }
    if (mode !== "practice" || phase === "results" || !current) return out;
    out[current.leftHand] = { target: true, label: "L", role: "left" };
    for (const m of current.rightHand) out[m] = { target: true, label: "R", role: "right" };
    return out;
  });

  const keyName = $derived(FLAT_NAMES[pc(s.key)]);
  /** The chords written out, a bar each: the root in the left hand, the chord in the right. */
  const written = $derived(bars.flatMap((b, k) => [{ midi: b.leftHand, startBeat: k * 4, durationBeats: 4, hand: "left" as const }, ...b.rightHand.map((midi) => ({ midi, startBeat: k * 4, durationBeats: 4, hand: "right" as const }))]));
  const summaryLine = $derived<SetupClause[]>([{ text: `${progression.label} in ${keyName}`, focus: "progression" }, { text: `${bars.length} chords`, focus: "rounds" }, { text: "a chord a bar" }]);
  const keys = $derived(spanOf(once.flatMap((b) => [b.leftHand, ...b.rightHand])));

  function onEvent(e: InputEvent) {
    if (e.kind === "cc" && e.controller === 64) {
      pedalDown = e.value >= PEDAL.downAt;
      pedalTrace = [...pedalTrace, { at: e.at, value: e.value }];
    } else if (e.kind === "noteon" && mode === "practice" && barIndex !== null) {
      const want = [bars[barIndex].leftHand, ...bars[barIndex].rightHand].map(pc);
      flashes.add(e.midi, want.includes(pc(e.midi)) ? "correct" : "wrong", 400);
    }
  }

  async function playDemo() {
    if (transport.playing) return transport.stop();
    status = "Listen: a chord a bar, each ringing into the next. The pedal is yours to add.";
    await transport.demo(demoNotes, bpm);
  }

  function start(ctx: RunContext) {
    transport.stop();
    summary = null;
    result = null;
    chordOk = [];
    pedalTrace = [];
    flashes.clear();
    downbeat = ctx.downbeat;
    stopClockRef = ctx.stopClock;
    run = practice.beginRun({
      exerciseId: "technique.pedal",
      setupKey: `pedal:${progression.id}:${pc(s.key)}:${bars.length}`,
      skillIds: ["technique.pedal"],
      capabilities: ["technique"],
      modality: "played",
      assistance: assistanceFor(mode),
      difficulty: 0.4 + (bpm - 40) / 400,
      instrument: "piano",
      params: { key: pc(s.key), progression: progression.id, bars: bars.length, bpm },
    });
    // A pedal pressed before the downbeat counts toward the first chord.
    cap = capture(ctx.downbeat - barMs, onEvent);
    timer = setTimeout(() => void finish(), ctx.downbeat - performance.now() + bars.length * barMs + beatMs / 2);
    const tick = () => {
      now = performance.now();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  /** Each bar's chord: its first note (the onset the pedal is judged from) and whether every chord tone was played. */
  function chordsPlayed(notes: NoteEvent[]) {
    return bars.map((b, k) => {
      const from = downbeat + k * barMs - beatMs / 2;
      const ons = notes.filter((n) => n.kind === "noteon" && n.at >= from && n.at < from + barMs);
      const pcs = new Set(ons.map((n) => pc(n.midi)));
      return {
        at: ons.length ? Math.min(...ons.map((n) => n.at)) : undefined,
        ok: [b.leftHand, ...b.rightHand].every((m) => pcs.has(pc(m))),
      };
    });
  }

  const VERDICT: Record<PedalVerdict, string> = {
    clean: "clean",
    early: "lifted early",
    blurred: "held through",
    late: "down again late",
    "no-chord": "no chord",
  };

  async function finish() {
    if (phase !== "running" && phase !== "countin") return;
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    stopClockRef?.();
    cap?.stop();
    const notes = cap?.notes ?? [];
    const played = chordsPlayed(notes);
    chordOk = played.map((p) => p.ok);
    const pedal = (cap?.controls ?? []).filter((c) => c.kind === "cc" && c.controller === 64).map((c) => ({ at: c.at, value: c.value }));
    const r = gradePedal({ chordOnsets: played.map((p) => p.at), pedal });
    result = r;
    phase = "results";
    const measured = !r.notMeasured.length;
    const chords = chordOk.filter(Boolean).length / bars.length;
    const score = measured ? r.score * 0.8 + chords * 0.2 : chords * 0.2;
    const correct = measured && r.correct && chords >= 0.9;
    await run!.attempt({
      promptId: `pedal:${progression.id}:${pc(s.key)}`,
      correct,
      partialCredit: score,
      metrics: r.metrics,
      source: runSource(notes),
      instrument: runInstrument(notes) ?? null,
      target: bars.flatMap((b) => [b.leftHand, ...b.rightHand]),
      response: notes.filter((n) => n.kind === "noteon").map((n) => n.midi),
    });
    const fin = await run!.finish({ score, correct, headline: `${r.clean} of ${bars.length} pedal changes clean` });
    const count = (v: PedalVerdict) => r.verdicts.filter((x) => x === v).length;
    const lifts = r.liftMs.filter((x): x is number => x !== null).sort((a, b) => a - b);
    const worst = (["early", "blurred", "late"] as const).map((v) => [v, count(v)] as const).sort((a, b) => b[1] - a[1])[0];
    summary = {
      headline: !measured
        ? "No pedal arrived. Plug a sustain pedal into the keyboard: it sends CC 64 over MIDI."
        : correct
          ? `Every change clean: lifted after each chord, down again straight away.`
          : worst[1] === 0
            ? `${r.clean} of ${bars.length} changes clean.`
            : worst[0] === "early"
              ? `${r.clean} of ${bars.length} clean. ${worst[1]} lifted before the new chord: that leaves a gap. Play the chord first, then lift.`
              : worst[0] === "blurred"
                ? `${r.clean} of ${bars.length} clean. ${worst[1]} held through the change: the chords blur. Lift just after each new chord.`
                : `${r.clean} of ${bars.length} clean. ${worst[1]} pressed down again late: the new chord loses its ring. Press straight back down.`,
      metric: measured ? `${r.clean}/${bars.length}` : pct(score),
      metricLabel: measured ? "changes clean" : "score",
      delta: fin.delta,
      best: fin.best,
      clean: correct && mode === "check",
      xp: fin.xp,
      assistance: assistanceText(mode),
      rows: [
        measured
          ? { label: "Pedal changes clean", value: r.score, text: `${r.clean} of ${bars.length}` }
          : { label: "Pedal (no CC 64 arrived)", notMeasured: true },
        ...(measured
          ? [
              { label: "Lifted early, held through, down late", text: `${count("early")}, ${count("blurred")}, ${count("late")}` },
              { label: "Lift after the chord (median)", text: lifts.length ? `${Math.round(lifts[Math.floor(lifts.length / 2)])} ms` : "none" },
            ]
          : []),
        { label: "Chords right", value: chords, text: `${chordOk.filter(Boolean).length} of ${bars.length}` },
      ],
      // Ungraded without a pedal: nothing to climb.
      advance: measured
        ? await nextRun(`pedal.${pc(s.key)}.${bars.length}`, { bpm, tempo: { min: TEMPO.min, goal: 90, max: TEMPO.max }, steps: PEDAL_PROGRESSIONS.map((p) => ({ label: p.label })), step: Math.max(0, PEDAL_PROGRESSIONS.indexOf(progression)) }, { score, correct }, tempoAnd((i) => cfg.set({ progression: PEDAL_PROGRESSIONS[i].id })))
        : undefined,
    };
    status = summary.headline;
  }

  function stop() {
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    cap?.stop();
    phase = "ready";
    status = "Stopped. Nothing was recorded.";
  }

  onDestroy(() => {
    transport.stop();
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    cap?.stop();
  });

  // The pedal line: down is a low line, up a gap, with a tick at each bar.
  const W = 640;
  const H = 44;
  const span = $derived(bars.length * barMs);
  const xOf = (at: number) => Math.max(0, Math.min(W, ((at - downbeat) / span) * W));
  const segments = $derived.by(() => {
    const out: { from: number; to: number }[] = [];
    const end = phase === "running" ? now : downbeat + span;
    let open: number | null = null;
    for (const p of pedalTrace) {
      if (p.value >= PEDAL.downAt && open === null) open = p.at;
      else if (p.value < PEDAL.downAt && open !== null) {
        out.push({ from: open, to: p.at });
        open = null;
      }
    }
    if (open !== null) out.push({ from: open, to: end });
    return out.filter((g) => g.to > downbeat);
  });
</script>

<svelte:head><title>Pedal | Woodshed</title></svelte:head>

<DrillShell
  title="Pedal"
  lesson={{ lessons: [pedalLesson()] }}
  hue="piano"
  blurb="Legato pedalling: play the chord, then lift the sustain pedal and press it straight back down, so each chord rings into the next without blurring."
  summary={summaryLine}
  bind:phase
  bind:mode
  bind:status
  progress={barIndex === null ? 0 : (barIndex + 1) / bars.length}
  clock={{ bpm, beatsPerBar: 4 }}
  onstart={start}
  onstop={stop}
  ondemo={playDemo}
  demoPlaying={transport.playing}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-3">
      <Choice label="Progression" setupKey="progression" options={PEDAL_PROGRESSIONS.map((p) => ({ value: p.id, label: p.label }))} value={progression.id} onchange={(v) => cfg.set({ progression: v })} />
      <div class="flex min-w-0 flex-col gap-1 text-sm" data-setup="key">
        <span class="font-medium">Key</span>
        <KeyPicker label="Key" value={pc(s.key)} name={(p) => FLAT_NAMES[p]} onchange={(p) => cfg.set({ key: p })} />
      </div>
      <Choice label="Times through" setupKey="rounds" options={[1, 2, 4].map((n) => ({ value: n, label: String(n) }))} value={s.rounds} onchange={(v) => cfg.set({ rounds: v })} />
    </div>
    <p class="mt-3 text-sm text-ws-soft">
      Tempo comes from the practice strip ({TEMPO.min} to {TEMPO.max}). Lift within {PEDAL.liftWithinMs} ms after the chord and be back down within {PEDAL.repressWithinMs} ms: starting values, since no one publishes pedal timing.
    </p>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running"}
      <Stat label="Chord" value={barIndex === null ? "count-in" : `${barIndex + 1} of ${bars.length}`} />
      <Stat label="Pedal" value={pedalDown ? "down" : "up"} tone={pedalDown ? "success" : undefined} />
    {:else if result}
      <Stat label="Clean changes" value={`${result.clean} of ${bars.length}`} tone={result.correct ? "success" : "warn"} />
    {/if}
  {/snippet}

  {#snippet stage()}
    {@const demoBar = transport.playing && transport.beat !== null ? Math.floor(transport.beat / 4) : null}
    <ol class="mb-3 grid grid-cols-4 gap-2" aria-label="Chord chart, a chord a bar">
      {#each bars as b, k (k)}
        {@const v = result?.verdicts[k]}
        <li class="flex min-h-14 flex-col justify-center rounded-lg border px-3 py-1.5 {barIndex === k || demoBar === k ? 'border-instr bg-instr/20' : 'border-ws-stage-ink/15'}" aria-current={barIndex === k || demoBar === k ? "step" : undefined}>
          <span class="font-display text-xl font-semibold">{b.symbol}</span>
          <span class="text-xs text-ws-stage-soft">{v ? `${v === "clean" ? "✓" : "✕"} ${VERDICT[v]}${chordOk[k] === false ? ", chord incomplete" : ""}` : b.roman}</span>
        </li>
      {/each}
    </ol>
    {#if mode === "practice" || phase === "results"}
      <div class="mb-3"><LineNotation notes={written} title="pedal-{progression.id}-{pc(s.key)}-{bars.length}" cursorBeat={transport.playing ? transport.beat : barIndex === null ? null : (now - downbeat) / beatMs} keyFifths={signatureFor(pc(s.key), "major")} /></div>
    {/if}
    {#if phase !== "ready"}
    <figure class="mb-3">
      <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" class="h-11 w-full" role="img" aria-label="The pedal over the bars: a line where it was down, a gap where it was up">
        {#each bars as _, k (k)}
          <line x1={(k / bars.length) * W} x2={(k / bars.length) * W} y1="4" y2={H - 4} class="bar" vector-effect="non-scaling-stroke" />
        {/each}
        {#each segments as g, i (i)}
          <line x1={xOf(g.from)} x2={xOf(g.to)} y1={H - 12} y2={H - 12} class="ped" vector-effect="non-scaling-stroke" />
        {/each}
      </svg>
      <figcaption class="text-xs text-ws-stage-soft">Pedal line: down where the line runs, up in the gaps. Each gap should sit just after a bar line.</figcaption>
    </figure>
    {/if}
    <Piano low={keys.low} high={keys.high} {marks} {flashes} label="Piano keyboard, {noteName(keys.low)} to {noteName(keys.high)}. Left hand root marked L, right hand chord R." />
  {/snippet}

  {#snippet results()}
    {#if summary}
      <Results {summary}>
        {#snippet actions()}
          <button type="button" class={btn} onclick={() => { settings.update({ bpm: Math.max(TEMPO.min, bpm - 10) }); phase = "ready"; summary = null; }}>Slower</button>
          <button type="button" class={btn} onclick={() => { settings.update({ bpm: Math.min(TEMPO.max, bpm + 10) }); phase = "ready"; summary = null; }}>Faster</button>
        {/snippet}
      </Results>
    {/if}
  {/snippet}
</DrillShell>

<style>
  .bar {
    stroke: color-mix(in oklch, var(--ws-stage-ink) 30%, transparent);
    stroke-width: 1;
  }
  .ped {
    stroke: var(--instr);
    stroke-width: 5;
    stroke-linecap: round;
  }
</style>
